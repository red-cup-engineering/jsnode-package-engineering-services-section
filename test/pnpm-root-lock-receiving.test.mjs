import assert from 'node:assert/strict';
import test from 'node:test';
import { decodePnpmLockfileImporters } from '@red-cup-engineering/jsnode-package-engineering-services-section/workspace/pnpm-lockfile';

test('the receiving package reads the dependency selected for the root workspace', () => {
  const lock = [
    "lockfileVersion: '9.0'", 'importers:', '  .:', '    dependencies:',
    '      game:', '        specifier: ^1.0.0', '        version: 1.1.0',
  ].join('\n');
  assert.deepEqual(decodePnpmLockfileImporters(lock, { strict: true }).importers, [{
    path: '.', dependencies: [{ name: 'game', field: 'dependencies', specifier: '^1.0.0', version: '1.1.0', workspaceLink: false }],
  }]);
});
