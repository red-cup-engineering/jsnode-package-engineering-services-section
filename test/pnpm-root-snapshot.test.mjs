import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli=fileURLToPath(new URL('../scripts/sync-package-manifest.mjs',import.meta.url));
test('root lock preflight identifies exact direct drift without qualifying or changing resolution', t=>{
  const root=mkdtempSync(join(tmpdir(),'jsnode-root-lock-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const lock=`lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      old-carrier:
        specifier: ^1.0.0
        version: 1.2.0
      parcel:
        specifier: '0.2.0-dev.1'
        version: 0.2.0-dev.1
      peerful:
        specifier: 1.0.0
        version: 1.0.0(peer@2.0.0)
`;
  const lockPath=join(root,'pnpm-lock.yaml'), manifestPath=join(root,'package.json');
  writeFileSync(lockPath,lock);
  const check=dependencies=>{
    const manifest=JSON.stringify({dependencies});
    writeFileSync(manifestPath,manifest);
    const result=spawnSync(process.execPath,[cli,'--check-pnpm-root',root],{encoding:'utf8',timeout:10000});
    assert.ifError(result.error);
    assert.equal(readFileSync(manifestPath,'utf8'),manifest);
    assert.equal(readFileSync(lockPath,'utf8'),lock);
    return [result.status,JSON.parse(result.stdout)];
  };
  const [drift,receipt]=check({parcel:'^0.2.0',peerful:'^1.0.0','new-carrier':'^1.0.0'});
  assert.equal(drift,1);
  assert.equal(receipt.scope,'literal-direct-declarations-only');
  assert.equal(receipt.status,'drift');
  assert.deepEqual(receipt.differences,[
    {kind:'specifier-mismatch',field:'dependencies',name:'parcel',declaredSpecifier:'^0.2.0',
      lockedSpecifier:'0.2.0-dev.1',lockedVersion:'0.2.0-dev.1'},
    {kind:'specifier-mismatch',field:'dependencies',name:'peerful',declaredSpecifier:'^1.0.0',
      lockedSpecifier:'1.0.0',lockedVersion:null},
    {kind:'manifest-only',field:'dependencies',name:'new-carrier',declaredSpecifier:'^1.0.0',
      lockedSpecifier:null,lockedVersion:null},
    {kind:'lock-only',field:'dependencies',name:'old-carrier',declaredSpecifier:null,
      lockedSpecifier:'^1.0.0',lockedVersion:'1.2.0'},
  ]);
  const [same,agreement]=check({parcel:'0.2.0-dev.1',peerful:'1.0.0','old-carrier':'^1.0.0'});
  assert.equal(same,0);
  assert.deepEqual(agreement.differences,[]);
});

test('release preflight reads the exact exported frozen lock, not incidental root state', t=>{
  const root=mkdtempSync(join(tmpdir(),'jsnode-release-lock-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(join(root,'release'));
  const product='./release/pnpm-lock.yaml';
  const manifest={exports:{'./frozen-lockfile':product},registryConsumption:{frozenLockfile:product},
    dependencies:{parcel:'^2.0.0'}};
  const manifestPath=join(root,'package.json'),lockPath=join(root,'release','pnpm-lock.yaml');
  writeFileSync(join(root,'pnpm-lock.yaml'),"not the release product\n");
  const check=(document,frozen,flags=['--check-pnpm-release'])=>{
    writeFileSync(manifestPath,JSON.stringify(document));writeFileSync(lockPath,frozen);
    const result=spawnSync(process.execPath,[cli,...flags,root],{encoding:'utf8',timeout:10000});
    assert.ifError(result.error);assert.equal(readFileSync(lockPath,'utf8'),frozen);
    assert.equal(readFileSync(manifestPath,'utf8'),JSON.stringify(document));
    return [result.status,JSON.parse(result.stdout)];
  };
  const lock=`lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      parcel:
        specifier: ^1.0.0
        version: 1.2.0
`;
  const [status,report]=check(manifest,lock);
  assert.equal(status,1);
  assert.equal(report.lockfile,'release/pnpm-lock.yaml');
  assert.equal(report.differences[0].lockedVersion,'1.2.0');
  const [,disagreement]=check({...manifest,exports:{'./frozen-lockfile':'./pnpm-lock.yaml'}},lock);
  assert.equal(disagreement.reason,'frozen-lock-product-not-declared');
  const [blocked,policy]=check(manifest,lock.replace('importers:','overrides:\n  unrelated: 1.0.0\nimporters:'));
  assert.equal(blocked,2);
  assert.equal(policy.status,'unchecked');
  assert.equal(policy.reason,'requires-native-policy-check');
  assert.deepEqual(policy.observedDifferences,[{kind:'specifier-mismatch',field:'dependencies',name:'parcel'}]);
  const [both,options]=check(manifest,lock,['--check-pnpm-release','--check-pnpm-root']);
  assert.equal(both,2);assert.equal(options.reason,'invalid-arguments');
});
