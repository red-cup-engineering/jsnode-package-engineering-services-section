import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectJsnodeOperationTests } from "../src/project-jsnode-operation-tests.mjs";
import { packageFiles } from "../src/package-files.mjs";
import { testPlan } from "../src/package-test-plan.mjs";

const specification = {
  type: "JsnodeOperationPackageSpecification", version: 2, app: null,
  operations: [{ path: "src/math.mjs", exportName: "addOne", commandName: "add-one", documentation: { description: "Adds one." } }],
  tests: [{ type: "JavascriptNodeOperationTestSource", path: "test/math.test.mjs", text: "authored\n" }],
  examples: [{ type: "JsnodeOperationPackageExample", name: "adds one", operation: "add-one", input: 1, output: 2 }],
};

test("preserves authored tests and projects one module contract test", () => {
  const projections = projectJsnodeOperationTests(specification);
  assert.deepEqual(projections.map(({ path }) => path), ["test/math.test.mjs", "test/operation-contracts.test.mjs"]);
  assert.equal(projections[0].text, "authored\n");
  assert.match(projections[1].text, /import \{ addOne as operation0 \} from "\.\.\/src\/math\.mjs"/u);
  assert.match(projections[1].text, /await \(\{.*operation0/u);
  assert.doesNotMatch(projections[1].text, /runJavascriptNodeOperationModule/u);
});

test("adds catalog invocation only when the specification has an app", () => {
  const projections = projectJsnodeOperationTests({ ...specification, app: { path: "apps/math-cli.mjs", commandName: "math" } });
  assert.match(projections[1].text, /@red-cup-engineering\/node-js-function-engineering-services-section\/operation/u);
  assert.doesNotMatch(projections[1].text, /javascript-node-services-section\/operation/u);
  assert.match(projections[1].text, /example\.commandName/u);
});


test("uses a distinct deterministic binding for each operation, including shared exports", () => {
  const projections = projectJsnodeOperationTests({ ...specification, operations: [
    ...specification.operations,
    { path: "src/math.mjs", exportName: "addOne", commandName: "increment", documentation: { description: "Adds one again." } },
  ], examples: [
    ...specification.examples,
    { type: "JsnodeOperationPackageExample", name: "increments one", operation: "increment", input: 1, output: 2 },
  ] });
  assert.match(projections[1].text, /import \{ addOne as operation0 \}/u);
  assert.match(projections[1].text, /import \{ addOne as operation1 \}/u);
  assert.match(projections[1].text, /"binding": "operation1"/u);
});


test("the generated catalog contract executes against the declared canonical interpreter", async (t) => {
  // This fixture receives the generated source with this package's explicitly
  // installed test supplier. Clean archive/registry receiving is separate.
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const root = await mkdtemp(join(testDirectory, "fixtures", ".generated-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "src"));
  await mkdir(join(root, "apps"));
  await mkdir(join(root, "test"));
  await writeFile(join(root, "src/math.mjs"), "export const addOne = value => value + 1;\n");
  await writeFile(join(root, "apps/math-cli.mjs"), 'import { addOne } from "../src/math.mjs"; export const catalog = { name: "math", description: "Integer math.", operations: { "add-one": { name: "add-one", description: "Adds one.", operation: addOne } } };\n');
  const projected = projectJsnodeOperationTests({ ...specification, app: { path: "apps/math-cli.mjs", commandName: "math" } });
  const generated = projected.find(file => file.path === "test/operation-contracts.test.mjs");
  await writeFile(join(root, generated.path), generated.text);
  // Generated receiving fixtures must not enter this owner's concurrent test plan.
  const packageRoot = dirname(testDirectory);
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  assert.deepEqual(testPlan({ files: packageFiles(packageRoot), manifest }).tests, manifest.receivingTests);
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "NODE_TEST_CONTEXT"));
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", join(root, generated.path)], { encoding: "utf8", env: environment });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /# pass 1/u);
  assert.match(result.stdout, /# fail 0/u);
});
