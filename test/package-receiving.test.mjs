import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { projectJsnodeModules } from '@red-cup-engineering/jsnode-package-engineering-services-section/project-jsnode-modules';

test('an authored game entry can import an immutable module generated from its design', async t => {
  const output = await mkdtemp(join(process.cwd(), '.jsnode-game-design-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const design = {
    name: 'WORLDS', value: [{ id: 'garden', resources: ['water'] }],
    schema: { type: 'array', items: { type: 'object', required: ['id', 'resources'] } },
  };
  const specification = {
    operations: [],
    dataModules: [{ path: 'src/worlds.mjs', exports: [design] }],
    sources: [{ path: 'src/game.mjs', text: 'export { WORLDS as worlds } from "./worlds.mjs";' }],
  };
  for (const file of projectJsnodeModules(specification)) {
    const target = join(output, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.text);
  }
  const { worlds } = await import(pathToFileURL(join(output, 'src/game.mjs')));
  assert.deepEqual(worlds, design.value);
  assert.ok(Object.isFrozen(worlds[0].resources));
  const wrong = { ...design, value: [{ id: 'garden' }] };
  assert.throws(() => projectJsnodeModules({
    ...specification, dataModules: [{ path: 'src/worlds.mjs', exports: [wrong] }],
  }), /fails its declared schema/);
});
