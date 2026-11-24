/**
 * Generate Node.js tests for a module's specified behavior.
 *
 * The module plan has already validated the export, schemas, examples and
 * independent test cases. This function generates test source without running it.
 *
 * ECMAScript ModuleExportName is not a local BindingIdentifier. "class",
 * "default", "await", and source-defined quoted names are legal ESM exports
 * even though `import { class }` is illegal JavaScript. Quote the actual
 * export name and bind it to one known safe local identifier, never write
 * untrusted/export-specific strings as executable local identifiers.
 */
import path from "node:path";

const testPathOf = operation => `test/${operation.name}-examples.test.mjs`;

/** Preserve an ordinary JSON "__proto__" data member in generated JS syntax.
 * A direct object-literal key is a prototype setter; a computed key is an
 * ordinary data property. One JSON serialization snapshot governs the edit,
 * preserving all unaffected source bytes and recorded test hashes.
 * Never defer interpretation to runtime JSON.parse after candidate import:
 * untrusted source could replace that global and forge both test operands.
 */
const jsonValueExpression = value => {
  const json = JSON.stringify(value);
  return typeof json === "string"
    ? json.replaceAll('"__proto__":', '["__proto__"]:')
    : json;
};

const expectRejection = (call, name) =>
  `  await assert.rejects(async () => await ${call}, { name: ${JSON.stringify(name)} });`;

// The existing-module schema validates each path before generating code.
// Bracket expressions keep every segment a literal, including quoted names.
const select = (root, segments) => root + segments.map(key => `[${JSON.stringify(key)}]`).join("");

function existingModuleObservation(example, positional, functionName) {
  const invoke = (input) => `${functionName}(${positional ? "..." : ""}${input})`;
  const input = jsonValueExpression(example.input);
  if (Object.hasOwn(example, "throws")) return [expectRejection(invoke(input), example.throws)];
  if (!example.mutateInput && !example.outputPath) {
    return [`  assert.deepStrictEqual(await ${invoke(input)}, ${jsonValueExpression(example.output)});`];
  }
  return [
    `  const submitted = ${input};`,
    `  const result = await ${invoke("submitted")};`,
    ...(example.mutateInput ?? []).map(({path, value}) =>
      `  ${select("submitted", path)} = ${jsonValueExpression(value)};`),
    `  assert.deepStrictEqual(${select("result", example.outputPath ?? [])}, ${jsonValueExpression(example.output)});`,
  ];
}

/** Generate tests for the supplied examples and independent requirement checks. */
export function projectJsnodeExampleTests(operation, examples, derivedCases = [], existingModule = false) {
  // Source-free generation is content-addressed. Preserve its published source bytes.
  const functionName = existingModule ? "operationUnderTest" : "fabricatedOperation";
  const moduleName = existingModule ? "moduleUnderTest" : "moduleUnderAssay";
  const relative = path.posix.relative("test", operation.module);
  const importPath = relative.startsWith(".") ? relative : `./${relative}`;
  const cases = examples.map(example => [
    `test(${JSON.stringify(`${operation.name}: ${example.name}`)}, async () => {`,
    ...(existingModule
      ? existingModuleObservation(example, operation["x-javascript-arguments"] === "positional", functionName)
      : [`  assert.deepStrictEqual(await ${functionName}(${jsonValueExpression(example.input)}), ${jsonValueExpression(example.output)});`]),
    "});",
  ].join("\n"));
  for (const item of derivedCases) {
    // Admit each clause value only once; later test-source positions must
    // reuse the same captured source, even for accessor-bearing JS carriers.
    const inputExpression = jsonValueExpression(item.input);
    const outputExpression = jsonValueExpression(item.output);
    // The original assay receiver has admitted these opt-in checks against
    // the source clause and schema. They are emitted as actual behavior
    // observations, never as a claim that a type implies purity.
    const success = item.checks === undefined ? [
      `  assert.deepStrictEqual(await ${functionName}(${inputExpression}), ${outputExpression});`,
    ] : [
      `  const assayInput = ${inputExpression};`,
      // Static supplier imports can replace global structuredClone before a
      // generated test runs. Two separately emitted literals cannot alias.
      `  const originalInput = ${inputExpression};`,
      `  const firstOutput = await ${functionName}(assayInput);`,
      `  assert.deepStrictEqual(firstOutput, ${outputExpression});`,
      ...(item.checks.inputUnchanged ? ["  assert.deepStrictEqual(assayInput, originalInput);"] : []),
      ...(item.checks.stableReplay ? [
        `  const replayInput = ${inputExpression};`,
        `  const replayOutput = await ${functionName}(replayInput);`,
        "  assert.deepStrictEqual(replayOutput, firstOutput);",
        ...(item.checks.inputUnchanged ? ["  assert.deepStrictEqual(replayInput, originalInput);"] : []),
      ] : []),
    ];
    cases.push([
      `test(${JSON.stringify(operation.name + ": clause assay " + item.name)}, async () => {`,
      ...(item.throws === null ? success : [
        expectRejection(`${functionName}(${inputExpression})`, item.throws),
      ]),
      "});",
    ].join("\n"));
  }
  return Object.freeze({
    type: "JavascriptNodeOperationTestSource",
    path: testPathOf(operation),
    text: [
      existingModule ? "// Generated from the existing module's public behavior specification."
        : "// Derived from the work order's admitted examples, before the operation's source was derived.",
      'import nativeAssert from "node:assert/strict";',
      'import test from "node:test";',
      // ESM static imports execute before module-local code. A candidate may
      // mutate the shared assert singleton (or sync native named exports) at
      // import time, so first capture native assertion functions; only then
      // import the candidate as an effect. The incumbent assay-completion
      // receiver independently requires ALL declared tests to have run, even
      // if a candidate exits early or suppresses test registration.
      'const assert = Object.freeze({',
      '  deepStrictEqual: nativeAssert.deepStrictEqual.bind(nativeAssert),',
      '  rejects: nativeAssert.rejects.bind(nativeAssert),',
      '});',
      `const ${moduleName} = await import(${JSON.stringify(importPath)});`,
      `const ${functionName} = ${moduleName}[${JSON.stringify(operation.exportName)}];`,
      `if (typeof ${functionName} !== "function") throw new TypeError("Missing callable source export");`,
      "",
      ...cases,
      "",
    ].join("\n"),
  });
}
