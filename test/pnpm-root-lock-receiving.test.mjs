import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
