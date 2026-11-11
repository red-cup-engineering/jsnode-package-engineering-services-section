import assert from "node:assert/strict";
import test from "node:test";
import typescript from "typescript";
import { codeRole, createPackageImportReader, houseSpecifiersOfText as directSpecifiers, importsOfFiles as directImports, packageNameOf } from "../src/package-imports.mjs";
const { houseSpecifiersOfText, importsOfFiles } = createPackageImportReader(typescript);

test("every form a module uses a house package by is read, and nothing else", () => {
  const text = [
    'import { a } from "@red-cup-engineering/alpha/sub";',
    'export * from "@lenticule-science/beta";',
    'const c = await import("@red-cup-engineering/gamma");',
    'const d = require("@red-cup-engineering/delta");',
    'import "@red-cup-engineering/epsilon";',
    'const e = import.meta.resolve("@red-cup-engineering/zeta/data.json");',
    'const f = resolveModule("@red-cup-engineering/eta/custody");',
    'route("admit", "@red-cup-engineering/theta/integrations/hooks:appendHookEvent", "service");',
    'import x from "semver"; import y from "./local.mjs"; import "node:fs";',
    '// "@red-cup-engineering/iota" in a comment string with no load shape is not a use',
  ].join("\n");
  assert.deepEqual(houseSpecifiersOfText(text), [
    "@lenticule-science/beta", "@red-cup-engineering/alpha/sub", "@red-cup-engineering/delta", "@red-cup-engineering/epsilon",
    "@red-cup-engineering/eta/custody", "@red-cup-engineering/gamma", "@red-cup-engineering/theta/integrations/hooks", "@red-cup-engineering/zeta/data.json",
  ]);
  assert.equal(packageNameOf("@red-cup-engineering/alpha/sub/x"), "@red-cup-engineering/alpha");
});

test("runtime, test and foreign code are told apart, and a package used at runtime is never test-only", () => {
  assert.equal(codeRole("src/a.mjs"), "runtime");
  assert.equal(codeRole("src/a.test.mjs"), "test");
  assert.equal(codeRole("test/fixtures/a.mjs"), "test");
  assert.equal(codeRole("lib/legacy/a.mjs"), null);
  assert.equal(codeRole("src/types.d.mts"), null);
  assert.equal(codeRole("README.md"), null);
  const imports = importsOfFiles([
    { path: "src/index.mjs", text: 'import "@red-cup-engineering/runtime-one";' },
    { path: "test/index.test.mjs", text: 'import "@red-cup-engineering/runtime-one"; import "@red-cup-engineering/test-only";' },
    { path: "services/nested/src/index.mjs", text: 'import "@red-cup-engineering/nested-only";' },
  ], { nestedRoots: ["services/nested"] });
  assert.deepEqual([...imports.runtime], [["@red-cup-engineering/runtime-one", ["src/index.mjs"]]]);
  assert.deepEqual([...imports.test], [["@red-cup-engineering/test-only", ["test/index.test.mjs"]]]);
});


test("parser selection is explicit and never falls back to a textual or ambient reader", () => {
  for (const provider of [undefined, {}, { ...typescript, version: "5.9.2" }, { ...typescript, createSourceFile: null }]) {
    assert.throws(() => createPackageImportReader(provider), /qualified TypeScript 5\.9\.3/u);
  }
  assert.throws(() => directSpecifiers('import "@red-cup-engineering/a";'), TypeError);
  assert.throws(() => directImports([]), TypeError);
  assert.deepEqual(directSpecifiers('import "@red-cup-engineering/a";', { typescript }), ["@red-cup-engineering/a"]);
  assert.deepEqual([...directImports([{ path: "src/a.mjs", text: 'import "@red-cup-engineering/a";' }], { typescript }).runtime.keys()], ["@red-cup-engineering/a"]);
});

test("generated strings, template text, regular expressions and comments are not supplier edges", () => {
  const text = [
    `const generated = 'import { run } from "@red-cup-engineering/generated-only/operation";';`,
    'const template = `import "@red-cup-engineering/template-only";`;',
    '// import "@red-cup-engineering/comment-only";',
    '/* require("@red-cup-engineering/comment-require"); */',
    `const command = 'resolveModule("@red-cup-engineering/string-resolver")';`,
    `const generatedRoute = 'route("@red-cup-engineering/string-route/sub:run")';`,
    String.raw`const pattern = /import "@red-cup-engineering\/regex-only"/;`,
    'import "@red-cup-engineering/actual-runtime";',
    'const value = `computed ${import("@red-cup-engineering/actual-dynamic")}`;',
  ].join("\n");
  assert.deepEqual(houseSpecifiersOfText(text), ["@red-cup-engineering/actual-dynamic", "@red-cup-engineering/actual-runtime"]);
  const reading = importsOfFiles([
    { path: "src/project-tests.mjs", text },
    { path: "test/project.test.mjs", text: 'import "@red-cup-engineering/generated-only/operation";' },
  ]);
  assert.equal(reading.runtime.has("@red-cup-engineering/generated-only"), false);
  assert.deepEqual(reading.test.get("@red-cup-engineering/generated-only"), ["test/project.test.mjs"]);
});

test("all admitted JS and TS forms preserve actual static, dynamic, resolver and type-only demand", () => {
  const common = [
    'import "@red-cup-engineering/side-effect";',
    'export * from "@red-cup-engineering/reexport";',
    'require.resolve("@red-cup-engineering/require-resolution");',
    'import.meta["resolve"]("@red-cup-engineering/computed-resolution");',
    'process.getBuiltinModule("@red-cup-engineering/builtin-shape");',
    'const route = "@red-cup-engineering/declared-route/sub:run";',
    'const literalImport = import(`@red-cup-engineering/literal-dynamic`);',
  ].join("\n");
  const expected = ["@red-cup-engineering/builtin-shape", "@red-cup-engineering/computed-resolution",
    "@red-cup-engineering/declared-route/sub", "@red-cup-engineering/literal-dynamic",
    "@red-cup-engineering/reexport", "@red-cup-engineering/require-resolution", "@red-cup-engineering/side-effect"].sort();
  for (const fileName of ["source.js", "source.mjs", "source.cjs", "source.ts", "source.mts", "source.cts"]) {
    assert.deepEqual(houseSpecifiersOfText(common, { fileName }), expected, fileName);
  }
  const typed = [common, 'import type { Model } from "@red-cup-engineering/type-only";',
    'export type { Output } from "@red-cup-engineering/type-export";',
    'type Lazy = import("@red-cup-engineering/import-type").Lazy;',
    'import legacy = require("@red-cup-engineering/import-equals");',
    'const value: Model | null = null;'].join("\n");
  for (const fileName of ["source.ts", "source.mts", "source.cts"]) {
    assert.deepEqual(houseSpecifiersOfText(typed, { fileName }), [...expected,
      "@red-cup-engineering/type-only", "@red-cup-engineering/type-export", "@red-cup-engineering/import-type",
      "@red-cup-engineering/import-equals"].sort(), fileName);
  }
});

test("JSX and TSX traverse executable expressions without reading generated element text", () => {
  for (const fileName of ["source.jsx", "source.tsx"]) {
    const text = [
      'const view = <section>{import("@red-cup-engineering/jsx-expression")}</section>;',
      'const generated = \'<section>{import("@red-cup-engineering/generated-jsx")}</section>\';',
      ...(fileName.endsWith(".tsx") ? ['type Props = import("@red-cup-engineering/tsx-type").Props;'] : []),
    ].join("\n");
    assert.deepEqual(houseSpecifiersOfText(text, { fileName }), ["@red-cup-engineering/jsx-expression",
      ...(fileName.endsWith(".tsx") ? ["@red-cup-engineering/tsx-type"] : [])]);
  }
});

test("recovered parse trees refuse with filename diagnostics instead of partial passing reads", () => {
  for (const fileName of ["source.js", "source.ts", "source.jsx", "source.tsx"]) {
    assert.throws(() => houseSpecifiersOfText('import { from "@red-cup-engineering/broken";', { fileName }), SyntaxError);
  }
  assert.throws(() => houseSpecifiersOfText("export {}", { fileName: "source.txt" }), TypeError);
  assert.throws(() => importsOfFiles([{ path: "src/broken.ts", text: "const = ;" }]), /src\/broken\.ts:1:/u);
});


test("installed package entrypoint preserves the original direct reader contract", async () => {
  const { readFileSync } = await import("node:fs");
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const entry = new URL(`../${manifest.exports["./package-imports"]}`, import.meta.url);
  const installed = await import(entry.href);
  assert.deepEqual(installed.houseSpecifiersOfText('import "@red-cup-engineering/real";'), ["@red-cup-engineering/real"]);
  assert.deepEqual([...installed.importsOfFiles([{ path: "src/a.ts", text: 'import type { T } from "@red-cup-engineering/types";' }]).runtime.keys()], ["@red-cup-engineering/types"]);
  assert.equal(installed.packageNameOf("@red-cup-engineering/real/sub"), "@red-cup-engineering/real");
  assert.equal(installed.codeRole("src/a.ts"), "runtime");
  assert.equal(typeof installed.createPackageImportReader, "function");
});
