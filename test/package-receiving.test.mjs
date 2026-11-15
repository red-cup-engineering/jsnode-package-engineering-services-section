import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const runner = fileURLToPath(new URL('../scripts/run-package-tests.mjs', import.meta.url));
const endpoint = 'test/consumer.test.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'jsnode-receiving-contract-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'test'));
  const manifest = { name: '@fixture/receiving', version: '0.0.0',
    type: 'module', files: ['test'], receivingTests: [endpoint] };
  const write = (path, bytes) => writeFileSync(join(root, path), bytes);
  const writeManifest = (patch = {}) => write('package.json', JSON.stringify({ ...manifest, ...patch }));
  writeManifest();
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  const commit = () => { git('add', '-A'); git('commit', '-qm', 'Select fixture source'); };
  const run = (...flags) => {
    const {NODE_TEST_CONTEXT, NODE_OPTIONS, ...env} = process.env;
    const result = spawnSync(process.execPath, [runner, ...flags], {
      cwd: root, env: { ...env, PACKAGE_TEST_DIRECTORY: root }, encoding: 'utf8', timeout: 30000,
    });
    const last = result.stdout?.trim().split('\n').at(-1);
    assert.ok(last?.startsWith('{'), result.error?.message || result.stderr || 'missing report');
    return [result.status, JSON.parse(last)];
  };
  return { write, writeManifest, commit, run };
}

test('plain Node.js receiving qualifies a complete pass, not a filtered or skipped test run', t => {
  const f = fixture(t);
  const importTest = "import test from 'node:test';\n";
  f.write(endpoint, importTest + "test('consumer behavior',()=>{});\n");
  const [ok, full] = f.run('--receiving');
  assert.equal(ok, 0);
  assert.equal(full.kind, 'package-test-run.v1');
  assert.equal(full.planned, 1);
  assert.equal(full.passed, 1);
  assert.equal(full.ran, full.passed);
  const [filtered, report] = f.run('--receiving', '--test-name-pattern=consumer');
  assert.equal(filtered, 2);
  assert.equal(report.ran, 0);
  for (const code of [
    "test('consumer behavior',{skip:'not received'},()=>{});",
    "test('consumer behavior',{todo:'not received'},()=>{});",
  ]) {
    f.write(endpoint, importTest + code + '\n');
    const [qualification, hold] = f.run('--receiving');
    assert.notEqual(qualification, 0);
    assert.equal(hold.ok, false);
    assert.equal(hold.ran, 1);
    assert.equal(hold.passed, 0);
    assert.match(hold.error, /must all pass/u);
  }
});

test('enrollment preflight checks the committed path and actual npm file selection without executing it', t => {
  const f = fixture(t);
  f.commit();
  f.write(endpoint, "throw Error('preflight must not execute enrolled code');\n");
  const [untracked, absent] = f.run('--check-receiving-enrollment');
  assert.equal(untracked, 2);
  assert.equal(absent.stage, 'source');
  assert.match(absent.error, /names missing program/u);
  f.commit();
  const [packed, report] = f.run('--check-receiving-enrollment');
  assert.equal(packed, 0);
  assert.equal(report.kind, 'package-receiving-enrollment.v1');
  assert.equal(report.planned, 1);
  assert.equal(report.testsExecuted, false);
  f.write(endpoint, "// Uncommitted replacement is not the selected program.\n");
  const [dirty, refused] = f.run('--check-receiving-enrollment');
  assert.equal(dirty, 2);
  assert.equal(refused.stage, 'source');
  assert.match(refused.error, /program differs from the selected Git revision/u);
  f.writeManifest({ files: ['other'] });
  f.commit();
  const [excluded, denied] = f.run('--check-receiving-enrollment');
  assert.equal(excluded, 2);
  assert.equal(denied.stage, 'pack');
  assert.match(denied.error, /names missing program/u);
});
