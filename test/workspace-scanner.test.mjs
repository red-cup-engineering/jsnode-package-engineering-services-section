import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scanDeclaredWorkspace, scanPackageRoot, scanWorkspace, scanWorkspaceDeclaration } from '@red-cup-engineering/jsnode-package-services-section/workspace/scanner/service';
import { workspaceScanContract } from '@red-cup-engineering/jsnode-package-services-section/workspace/scanner/schema';

const filesystem = {
  readFileUtf8: file => readFileSync(file, 'utf8'),
  pathExists: existsSync,
  readDirectoryEntries: directory => readdirSync(directory, { withFileTypes: true }),
};
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'jsnode-workspace-scanner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (relative, text) => { const file = path.join(root, relative); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); };
  return { root, write, manifest(relative, name) { write(relative, JSON.stringify({ name, version: '1.0.0', type: 'module' })); } };
}

test('declared workspace selection preserves complete globs, exclusions, deep members and the implicit root', t => {
  const f = fixture(t);
  f.manifest('package.json', '@test/root');
  f.manifest('packages/deep/a/b/c/d/package.json', '@test/deep');
  f.manifest('packages/excluded/package.json', '@test/excluded');
  f.write('pnpm-workspace.yaml', 'packages:\n  - packages/**\n  - "!packages/excluded"\n');
  const ports = { ...filesystem,
    globPaths(root, includes, exclusions) {
      assert.equal(root, f.root);
      assert.deepEqual(includes, ['packages/**/package.json']);
      assert.deepEqual(exclusions, ['packages/excluded']);
      return ['packages/deep/a/b/c/d/package.json', 'packages/deep/a/b/c/d/package.json'];
    },
  };
  const admitted = scanWorkspaceDeclaration(f.root, ports);
  assert.equal(admitted.kind, 'metroplat.admission.workspace-declaration');
  const scan = scanDeclaredWorkspace(f.root, ports);
  assert.deepEqual(scan.packages.map(item => item.admission.manifest.name), ['@test/root', '@test/deep']);
  assert.equal(workspaceScanContract.assert(scan), scan);
});

test('unsupported host glob syntax refuses instead of masquerading as an empty successful workspace', t => {
  const f = fixture(t);
  f.manifest('package.json', '@test/root');
  f.write('pnpm-workspace.yaml', 'packages:\n  - packages/{a,b}\n');
  const refusal = new TypeError('unsupported host glob syntax');
  assert.throws(() => scanDeclaredWorkspace(f.root, { ...filesystem, globPaths() { throw refusal; } }), error => error === refusal);
});

test('the original bounded fallback retains unreadable manifest evidence and ignored directory policy', t => {
  const f = fixture(t);
  f.manifest('package.json', '@test/root');
  f.manifest('src/one/package.json', '@test/deep');
  f.manifest('node_modules/ignored/package.json', '@test/ignored');
  f.write('broken/package.json', '{not json');
  const bounded = scanWorkspace(f.root, { ...filesystem, maxDepth: 1 }).scan;
  assert.deepEqual(bounded.packages.map(item => path.relative(f.root, item.root)), ['', 'broken']);
  assert.equal(bounded.packages[1].admission.kind, 'metroplat.admission.failure');
  const fallback = scanDeclaredWorkspace(f.root, { ...filesystem, maxDepth: 1 });
  assert.deepEqual(fallback, bounded);
  const missing = scanPackageRoot(path.join(f.root, 'absent'), filesystem).scan;
  assert.equal(missing.admission.kind, 'metroplat.admission.failure');
});
