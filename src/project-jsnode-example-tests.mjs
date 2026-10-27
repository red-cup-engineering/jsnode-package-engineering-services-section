/**
 * Render the source-free JSNode meaning closure's executable example assays.
 *
 * The original moduleFabricationPlan has already admitted the operation's
 * module/export binding, its schemas, examples and independent clause cases.
 * This pure projector constructs a test SOURCE, never executes it or grants a
 * model, filesystem, Code, supplier or independent receiving effect.
 *
 * ECMAScript ModuleExportName is not a local BindingIdentifier. "class",
 * "default", "await", and source-defined quoted names are legal ESM exports
 * even though `import { class }` is illegal JavaScript. Quote the actual
 * export name and bind it to one known safe local identifier, never write
 * untrusted/export-specific strings as executable local identifiers.
 */
import path from "node:path";

const testPathOf = operation => `test/${operation.name}-examples.test.mjs`;
const BINDING = "fabricatedOperation";

/** Tests derived from original qualified examples and independently assayed clause cases. */
export function projectJsnodeExampleTests(operation, examples, derivedCases = []) {
  const relative = path.posix.relative("test", operation.module);
  const importPath = relative.startsWith(".") ? relative : `./${relative}`;
  const cases = examples.map(example => [
    `test(${JSON.stringify(`${operation.name}: ${example.name}`)}, async () => {`,
    `  assert.deepStrictEqual(await ${BINDING}(${JSON.stringify(example.input)}), ${JSON.stringify(example.output)});`,
    "});",
  ].join("\n"));
  for (const item of derivedCases) {
    cases.push([
      `test(${JSON.stringify(operation.name + ": clause assay " + item.name)}, async () => {`,
      item.throws === null
        ? `  assert.deepStrictEqual(await ${BINDING}(${JSON.stringify(item.input)}), ${JSON.stringify(item.output)});`
        : `  await assert.rejects(async () => await ${BINDING}(${JSON.stringify(item.input)}), { name: ${JSON.stringify(item.throws)} });`,
      "});",
    ].join("\n"));
  }
  return Object.freeze({
    type: "JavascriptNodeOperationTestSource",
    path: testPathOf(operation),
    text: [
      "// Derived from the work order's admitted examples, before the operation's source was derived.",
      'import assert from "node:assert/strict";',
      'import test from "node:test";',
      `import { ${JSON.stringify(operation.exportName)} as ${BINDING} } from ${JSON.stringify(importPath)};`,
      "",
      ...cases,
      "",
    ].join("\n"),
  });
}
