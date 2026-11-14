import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { projectJsnodeModuleReferences as project } from "../src/project-jsnode-module-references.mjs";

const mapping = [{ from: "scripts/main.mjs", to: "src/main.mjs" }, { from: "scripts/helper.mjs", to: "src/lib/helper.mjs" }];

test("mapped and unmoved relative targets rebase without changing quote style, suffixes or other source bytes", () => {
  const source = `// 😀 unchanged\r\nimport { value as alias } from './helper.mjs?mode=1#part';\r\nexport * from "./stay.mjs";\r\nconst data = './helper.mjs';\r\n/** @type {import('./helper.mjs').Value} */\r\nexport const load = () => import('./helper.mjs');\r\nconst required = require('./helper.mjs');\r\nconst asset = new URL('./stay.json', import.meta.url);\r\n`;
  const expected = `// 😀 unchanged\r\nimport { value as alias } from './lib/helper.mjs?mode=1#part';\r\nexport * from "../scripts/stay.mjs";\r\nconst data = './helper.mjs';\r\n/** @type {import('./lib/helper.mjs').Value} */\r\nexport const load = () => import('./lib/helper.mjs');\r\nconst required = require('./lib/helper.mjs');\r\nconst asset = new URL('../scripts/stay.json', import.meta.url);\r\n`;
  assert.equal(project(source, "scripts/main.mjs", mapping), expected);
});

test("lexically shadowed callables, computed requests, dependencies and ordinary strings remain unchanged", () => {
  const source = `import x from 'supplier';\nexport function f(require, URL) { return [require('./helper.mjs'),new URL('./helper.mjs',import.meta.url)]; }\nconst text = './helper.mjs';\nconst computed = import(text);\n`;
  assert.equal(project(source, "scripts/main.mjs", mapping), source);
  assert.equal(project(source, "scripts/main.mjs", []), source);
});

test("comment import references preserve escaped literal meaning without touching other comments", () => {
  const source = `// ordinary './helper.mjs'\n/** @type {import('./hel\\u0070er.mjs').Value} */\nexport {};\n`;
  assert.equal(project(source, "scripts/main.mjs", mapping), `// ordinary './helper.mjs'\n/** @type {import('./lib/helper.mjs').Value} */\nexport {};\n`);
});

test("mapped hidden targets remain relative Node specifiers", () => {
  assert.equal(project(`import './helper.mjs';`, "scripts/main.mjs", [...mapping.slice(0, 1), { from: "scripts/helper.mjs", to: "src/.hidden.mjs" }]), `import './.hidden.mjs';`);
});

test("invalid and duplicate mappings refuse without accepting external edit plans", () => {
  for (const files of [null, [{ from: "../escape.mjs", to: "src/a.mjs" }], [{ from: "scripts/main.mjs", to: "/tmp/a.mjs" }], [...mapping, mapping[0]], [{ from: "scripts\\a.mjs", to: "src/a.mjs" }]]) {
    assert.throws(() => project("export {};", "scripts/main.mjs", files), TypeError);
  }
  assert.throws(() => project("export {};", "../main.mjs", []), TypeError);
  assert.throws(() => project("export const =", "src/main.mjs", []), SyntaxError);
});

test("projected authored operation and test execute against actual relocated modules", async t => {
  const root = mkdtempSync(join(tmpdir(), "jsnode-reference-projection-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "src/lib"), { recursive: true });
  mkdirSync(join(root, "test"));
  const operation = `import { value as alias } from './helper.mjs'; export const value=alias; export const load=async()=> (await import('./helper.mjs')).value;`;
  writeFileSync(join(root, "src/main.mjs"), project(operation, "scripts/main.mjs", mapping));
  writeFileSync(join(root, "src/lib/helper.mjs"), "export const value=42;\n");
  const authoredTest = `import assert from 'node:assert/strict'; import {value,load} from '../scripts/main.mjs'; assert.equal(value,42); assert.equal(await load(),42); export const passed=true;`;
  writeFileSync(join(root, "test/operation.mjs"), project(authoredTest, "test/operation.mjs", mapping));
  assert.equal((await import(pathToFileURL(join(root, "test/operation.mjs")).href)).passed, true);
});

test("canonical createRequire aliases rebase through the same parser-owned request sites", () => {
  const source = `import {createRequire as factory} from 'node:module'; const load=factory(import.meta.url); export const value=load('./helper.cjs'); function f(load){return load('./literal-data');}`;
  assert.equal(project(source, "scripts/main.mjs", mapping), source.replace("load('./helper.cjs')", "load('../scripts/helper.cjs')"));
});

test("invalid import-looking comment prose never rejects valid JavaScript", () => {
  const source = String.raw`// import('./bad\xZZ.mjs')
export {};`;
  assert.equal(project(source, "scripts/main.mjs", []), source);
  assert.equal(project(source, "scripts/main.mjs", mapping), source);
});
