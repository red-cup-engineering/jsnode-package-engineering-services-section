import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { projectJsnodeModules } from "../src/project-jsnode-modules.mjs";
import { projectJsnodePackageCli } from "../scripts/project-jsnode-package-cli.mjs";
import { readFile } from "node:fs/promises";
import { parseJavaScript } from "@red-cup-engineering/javascript-parser-service";
import { readJavaScriptModuleRequestSites } from "@red-cup-engineering/javascript-parser-service/module-reference-sites";

// Resolve the declared code-layer runner under either direct or hoisted installation.
const operationRunner = fileURLToPath(import.meta.resolve("@red-cup-engineering/node-js-function-engineering-services-section/run-javascript-node-operation-module"));
const specification = {
  sources: [
    { path: "src/base.mjs", text: "export const base = 1;\n" },
    { path: "src/math.mjs", text: "import { base } from './base.mjs';\nexport const increment = (value) => value + base;\nexport const double = (value) => value * 2;\n" },
  ],
  operations: [
    { name: "increment", module: "src/math.mjs", exportName: "increment", description: "Adds one.", inputSchema: { type: "integer" }, outputSchema: { type: "integer" } },
    { name: "double", module: "src/math.mjs", exportName: "double", description: "Doubles.", inputSchema: { type: "integer" }, outputSchema: { type: "integer" } },
  ],
  cli: { path: "apps/math-cli.mjs", name: "math", description: "Runs math." },
};
function run(file, arguments_, input, exitCode = 0) {
  return new Promise((resolve, reject) => {
    // A catalog is a declaration: the code layer's runner executes it.
    const { NODE_TEST_CONTEXT, HOUSE_ROOT, HOUSE_PACKAGE_BINDINGS, ...env } = process.env;
    const child = spawn(process.execPath, [operationRunner, file, ...arguments_], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => child.kill(), 60_000);
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code, signal) => { clearTimeout(timeout); code === exitCode ? resolve({ stdout, stderr }) : reject(new Error(`CLI failed (${signal ?? code}): ${stderr} ${stdout}`)); });
    child.stdin.end(input);
  });
}
async function materialize(root, files) {
  for (const file of files) {
    const destination = path.join(root, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.text, { mode: file.mode });
  }
}

test("projects shared source modules and one schema-bound NDJSON catalog without wrappers", async (t) => {
  const first = projectJsnodeModules(specification);
  assert.deepEqual(first, projectJsnodeModules(specification));
  assert.equal(first.find((file) => file.path === "src/math.mjs").text, specification.sources[1].text);
  assert.deepEqual(first.map((file) => file.path), ["apps/math-cli.mjs", "data/records/schema/double.input.schema.json", "data/records/schema/double.output.schema.json", "data/records/schema/increment.input.schema.json", "data/records/schema/increment.output.schema.json", "src/base.mjs", "src/math.mjs"]);
  const root = await mkdtemp(path.join(tmpdir(), "jsnode-modules-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await materialize(root, first);
  const module = await import(pathToFileURL(path.join(root, "src/math.mjs")).href);
  assert.equal(module.increment(2), 3);
  assert.equal(module.double(2), 4);
  const catalogText = first.find((file) => file.path === "apps/math-cli.mjs").text;
  assert.match(catalogText, /^export const catalog = Object\.freeze\(/mu);
  assert.doesNotMatch(catalogText, /^#!|import\.meta\.main|javascript-node-services-section|createJavascriptNodeOperation|process\./mu);
  assert.equal((await run(path.join(root, "apps/math-cli.mjs"), [], "")).stdout.includes("increment"), true);
  assert.equal((await run(path.join(root, "apps/math-cli.mjs"), ["increment"], "2\n")).stdout, "3\n");
  assert.equal((await run(path.join(root, "apps/math-cli.mjs"), ["double"], "2\n4\n")).stdout, "4\n8\n");
  const refused = await run(path.join(root, "apps/math-cli.mjs"), ["increment"], '"wrong type"\n2\n', 2);
  const [problem, recovered] = refused.stdout.trim().split("\n").map(JSON.parse);
  assert.equal(problem.type, "https://schemas.561.group/problems/operation-refused");
  assert.equal(problem.code, "InvalidInput");
  assert.equal(Object.hasOwn(problem, "ok"), false);
  assert.equal(recovered, 3);
  assert.equal(first.find((file) => file.path === "apps/math-cli.mjs").mode, 0o644);
  const changed = projectJsnodeModules({ ...specification, cli: { ...specification.cli, description: "Runs integer math." } });
  assert.notEqual(changed.find((file) => file.path === specification.cli.path).text, first.find((file) => file.path === specification.cli.path).text);
});

test("keeps module-only projections minimal and refuses collisions or unknown exports", () => {
  assert.deepEqual(projectJsnodeModules({ sources: [{ path: "src/only.mjs", text: "export const only = true;\n" }], operations: [] }).map((file) => file.path), ["src/only.mjs"]);
  assert.throws(() => projectJsnodeModules({ ...specification, sources: [specification.sources[0], specification.sources[0]], operations: [] }), /duplicate source path/u);
  assert.throws(() => projectJsnodeModules({ ...specification, operations: [{ ...specification.operations[0], exportName: "absent" }] }), /operation export is not present/u);
  assert.throws(() => projectJsnodeModules({ ...specification, sources: [{ path: "src/../escape.mjs", text: "export const a = 1;" }], operations: [] }), /unsafe path/u);
  assert.throws(() => projectJsnodeModules({ ...specification, cli: { ...specification.cli, path: "apps\\escape.mjs" } }), /path/u);
  assert.throws(() => projectJsnodeModules({ sources: [{ path: "src/a.mjs", text: "import '../escape.mjs'; export const a = 1;" }], operations: [] }), /external reference is not declared/u);
  assert.throws(() => projectJsnodeModules({ ...specification, operations: [{ ...specification.operations[0], inputSchema: { type: "not-a-json-schema-type" } }] }), /invalid input schema/u);
});


test("projects the checked-in catalog binding without drift and executes its module projection", async () => {
  const projected = await projectJsnodePackageCli();
  const current = await readFile(new URL("../apps/jsnode-package-cli.mjs", import.meta.url), "utf8");
  assert.equal(projected.text, current);
  for (const name of ["admit", "project", "create", "project-modules", "translate-markdown"]) assert.match(current, new RegExp(JSON.stringify(name)));
  assert.doesNotMatch(current, /check-destination-fragmentation/u);
  const cli = fileURLToPath(new URL("../apps/jsnode-package-cli.mjs", import.meta.url));
  assert.doesNotMatch(current, /^#!|import\.meta\.main/mu);
  assert.match((await run(cli, ["--help"], "")).stdout, /project-modules/u);
  const output = await run(cli, ["project-modules"], `${JSON.stringify({ sources: [{ path: "src/value.mjs", text: "export const value = (x) => x;\n" }], operations: [{ name: "value", module: "src/value.mjs", exportName: "value", description: "Returns a value." }] })}\n`);
  assert.equal(JSON.parse(output.stdout)[0].path, "src/value.mjs");
  const admitted = await run(cli, ["admit"], `${JSON.stringify({
    type: "JsnodeOperationPackageSpecificationCandidate", version: 2, topic: "numbers", packageName: "@red-cup-engineering/numbers-service", packageVersion: "0.1.0", license: "MIT", dependencies: {}, devDependencies: {},
    sources: [{ type: "JavascriptNodePackageSource", path: "src/numbers.mjs", text: "export const answer = () => 42;\n" }],
    operations: [{ type: "JsnodeOperationArguments", version: 1, path: "scripts/answer.mjs", exportName: "answer", exportCount: 1, description: "Answers.", params: [], returns: { type: "number", description: "Answer." }, throws: [], imports: [], bodyText: "export const answer = () => 42;", residue: [], residueStatements: [], inputSchema: null, outputSchema: null }],
    tests: [{ type: "JavascriptNodeOperationTestSource", path: "test/numbers.test.mjs", text: "import test from 'node:test'; test('numbers', () => {});" }], examples: [{ type: "JsnodeOperationPackageExample", name: "answers", operation: "scripts/answer.mjs", input: null, output: 42 }],
  })}\n`);
  assert.equal(JSON.parse(admitted.stdout).type, "JsnodeOperationPackageSpecification");
});

test("module projection uses bound loader requests without treating local require parameters as dependencies", () => {
  const operation = { name: "value", module: "src/value.mjs", exportName: "value", description: "Returns a value." };
  const shadowed = "export function value(require) { return require('./not-a-module.mjs'); }";
  assert.ok(projectJsnodeModules({ sources: [{ path: "src/value.mjs", text: shadowed }], operations: [operation] }).some(file => file.path === "src/value.mjs"));
  const canonical = "import {createRequire as factory} from 'node:module'; const load=factory(import.meta.url); export const value=()=>load('./missing.cjs');";
  assert.throws(() => projectJsnodeModules({ sources: [{ path: "src/value.mjs", text: canonical }], operations: [operation] }), /unresolvable projected import/);
  assert.throws(() => projectJsnodeModules({ sources: [{ path: "src/value.mjs", text: "// export const value = 1;\nconst hidden = 1;" }], operations: [operation] }), /export/);
});

test("catalog commands defer only operation evaluation and preserve native refusal and invocation semantics", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "catalog-command-boundary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const marker = path.join(root, "evaluated.txt");
  const record = label => `import {appendFileSync} from 'node:fs'; appendFileSync(${JSON.stringify(marker)}, ${JSON.stringify(label + "\n")});\n`;
  const files = projectJsnodeModules({
    sources: [
      { path: "src/good.mjs", text: record("good") + "function value(input, context) { return {input, detached:this === undefined, arguments:context?.arguments ?? null}; } export {value as default};" },
      { path: "src/broken.mjs", text: record("broken") + "throw Object.assign(new Error('selected initialization failed'), {code:'BROKEN_OPERATION'}); export const broken = value => value;" },
      { path: "src/noncallable.mjs", text: "export const value = 3;" },
      { path: "src/missing-supplier.mjs", text: "import 'unavailable-command-fixture-package'; export const value = x => x;" },
    ],
    operations: [
      { name: "good", module: "src/good.mjs", exportName: "default", description: "Receives input and context.", inputSchema: {type:"integer"}, outputSchema: {type:"object"} },
      { name: "broken", module: "src/broken.mjs", exportName: "broken", description: "Refuses during initialization." },
      { name: "noncallable", module: "src/noncallable.mjs", exportName: "value", description: "Refuses a non-callable export." },
      { name: "missing", module: "src/missing-supplier.mjs", exportName: "value", description: "Refuses an unavailable supplier." },
      { name: "wrong-output", module: "src/good.mjs", exportName: "default", description: "Rejects the result.", outputSchema: {type:"number"} },
    ],
    cli: {path:"apps/commands.mjs",name:"commands",description:"Independent command boundaries."},
  });
  const declaration = files.find(file => file.path === "apps/commands.mjs");
  const dynamicSuppliers = readJavaScriptModuleRequestSites(parseJavaScript(declaration.text))
    .filter(site => site.kind === "dynamic-import").map(site => site.specifier);
  assert.deepEqual(dynamicSuppliers, ["../src/good.mjs", "../src/broken.mjs", "../src/noncallable.mjs", "../src/missing-supplier.mjs", "../src/good.mjs"], "all operation suppliers remain statically inspectable, not hidden behind computed imports");
  await materialize(root, files);
  const cli = path.join(root, "apps/commands.mjs");
  const observed = () => readFile(marker,"utf8").catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
  await run(cli,["--help"],""); await run(cli,["broken","--help"],"");
  assert.equal(JSON.parse((await run(cli,["unknown"],"",2)).stdout).code,"UnknownOperation");
  assert.equal(JSON.parse((await run(cli,["good"],'"invalid"\n',2)).stdout).code,"InvalidInput");
  assert.equal(await observed(), "", "help, unknown commands and invalid input do not evaluate operation modules");
  const success = (await run(cli,["good","--carry"],"2\n3\n")).stdout.trim().split('\n').map(JSON.parse);
  assert.deepEqual(success,[{input:2,detached:true,arguments:null},{input:3,detached:true,arguments:null}]);
  assert.equal(await observed(), "good\n", "the actual ESM module is evaluated once for repeated inputs");
  assert.equal(JSON.parse((await run(cli,["broken"],"{}\n",2)).stdout).code,"BROKEN_OPERATION");
  assert.equal(await observed(), "good\nbroken\n");
  const declared = await import(pathToFileURL(cli).href);
  assert.deepEqual(await declared.catalog.operations.good.operation(5, {arguments:["direct-context"]}), {input:5,detached:true,arguments:["direct-context"]});
  assert.equal(JSON.parse((await run(cli,["missing"],"{}\n",2)).stdout).code,"ERR_MODULE_NOT_FOUND");
  assert.equal(JSON.parse((await run(cli,["noncallable"],"{}\n",2)).stdout).type,"https://schemas.561.group/problems/operation-refused");
  assert.equal(JSON.parse((await run(cli,["wrong-output"],"{}\n",2)).stdout).code,"InvalidOutput");
  await writeFile(path.join(root,"src/noncallable.mjs"),"export const other = () => 1;\n");
  assert.equal(JSON.parse((await run(cli,["noncallable"],"{}\n",2)).stdout).type,"https://schemas.561.group/problems/operation-refused", "a missing materialized export cannot become success");
});

test("the actual catalog keeps creation callable and propagates refusal rather than reporting delivery", async () => {
  const cli = fileURLToPath(new URL("../apps/jsnode-package-cli.mjs", import.meta.url));
  assert.match((await run(cli,["create","--help"],"")).stdout,/create/i);
  const refusal = JSON.parse((await run(cli,["create"],"{}\n")).stdout);
  assert.equal(refusal.type,"JsnodeOperationPackageCreationRefusal");
  assert.equal(refusal.phase,"request");
  assert.equal(refusal.code,"UNEXPECTED_FIELDS");
  assert.equal(refusal.type === "JsnodeOperationPackageCreationReceipt",false);
});

test("catalog URLs and source closure use native ESM semantics without changing require paths", async t => {
  const operation={name:"read-value",module:"src/read#value.mjs",exportName:"readValue",description:"Reads an integer.",inputSchema:{type:"number"},inputSchemaPath:"data/records/schema/in#put.json",outputSchema:{type:"number"},outputSchemaPath:"data/records/schema/out?put.json"};
  const sources=[
    {path:"src/shared#value.mjs",text:"export const value=2;\n"},
    {path:"src/literal%20value.mjs",text:"export const value=3;\n"},
    {path:operation.module,text:'import {value} from ".//shared%23value.mjs?selected=1#source"; import {createRequire} from "node:module"; const require=createRequire(import.meta.url); const other=require("./literal%20value.mjs"); export function readValue(input){return input+value+other.value;}\n'},
  ];
  const cli={path:"apps/read#catalog.mjs",name:"values",description:"Reads values."};
  const files=projectJsnodeModules({sources,operations:[operation],cli});
  const root=await mkdtemp(path.join(tmpdir(),"module-url-receiving-"));t.after(()=>rm(root,{recursive:true,force:true}));
  await materialize(root,files);
  for(const side of ["input","output"]){const target=path.join(root,operation[side+"SchemaPath"]);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,JSON.stringify(operation[side+"Schema"]));}
  const module=await import(pathToFileURL(path.join(root,cli.path)).href);
  assert.equal(await module.catalog.operations["read-value"].operation(7),12);
  assert.throws(()=>projectJsnodeModules({sources:[{path:"src/a.mjs",text:'import "./sub%2Fmodule.mjs";'}],operations:[]}),/encoded.*[\\/]|encoded.*characters/i);
  assert.throws(()=>projectJsnodeModules({sources:[{path:"src/a.mjs",text:'import "./%2e%2e/outside.mjs";'}],operations:[]}),/external reference is not declared/u);
});


test("ESM closure checking cannot clamp package escapes back into local sources", () => {
  for (const specifier of ["../../src/b.mjs", "../../../src/b.mjs", "./%2e%2e/%2e%2e/src/b.mjs", "../../package/src/b.mjs"]) {
    const sources=[{path:"src/a.mjs",text:`import ${JSON.stringify(specifier)};`},{path:"src/b.mjs",text:"export const value=1;"}];
    assert.throws(()=>projectJsnodeModules({sources,operations:[]}),/external reference is not declared/u);
    assert.doesNotThrow(()=>projectJsnodeModules({sources,operations:[],externalReferences:[specifier]}));
  }
});
