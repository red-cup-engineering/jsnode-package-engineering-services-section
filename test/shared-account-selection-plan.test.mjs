import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { admitArtifactFabricationSpecification } from "@red-cup-engineering/computer-data-engineering-services-section/artifact-fabrication";
import { deriveJsnodeModules, planJsnodeModules } from "../src/derive-jsnode-package-from-closure.mjs";
import { testPlan } from "../src/package-test-plan.mjs";
import { packageFiles } from "../src/package-files.mjs";
import * as canonicalProgramme from "@red-cup-engineering/javascript-node-services-section/module-closure";
import * as legacyProgramme from "@red-cup-engineering/javascript-node-services-section/execute-javascript-program";

const fixture = new URL("./fixtures/shared-account-character-selection/", import.meta.url);
const candidate = () => JSON.parse(readFileSync(new URL("work-order.candidate.json", fixture), "utf8"));
const expectedPaths = [
  "data/records/schema/select-current-bearer.input.schema.json",
  "data/records/schema/select-current-bearer.output.schema.json",
  "src/agency/select-current-bearer.mjs",
  "test/select-current-bearer-examples.test.mjs",
];

test("the current owner test plan includes this receiving case and all direct owner tests", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const plan = testPlan({ files: packageFiles(fileURLToPath(new URL("..", import.meta.url))), manifest });
  assert.deepEqual(plan.problems, []);
  assert.ok(plan.tests.includes("test/shared-account-selection-plan.test.mjs"));
  for (const name of readdirSync(new URL(".", import.meta.url)).filter(name => name.endsWith(".test.mjs"))) {
    assert.ok(plan.tests.includes("test/" + name), name);
  }
});

test("the fixed original selection order is admitted and purely planned with every native acceptance obligation retained", () => {
  const input = candidate();
  const source = readFileSync(new URL("WORK-ORDER.md", fixture), "utf8");
  assert.equal(input.source.provenance.digest, "sha256:" + createHash("sha256").update(source).digest("hex"));
  const lines = source.split("\n");
  for (const clause of [...input.requirements, ...input.prohibitions, ...input.constraints, ...input.acceptanceObligations]) {
    const { startLine, endLine } = clause.sourceSpan;
    assert.ok(lines.slice(startLine - 1, endLine).join("\n").includes(clause.id), clause.id);
  }
  const before = structuredClone(input);
  const admitted = admitArtifactFabricationSpecification(input);
  assert.equal(admitted.type, "ArtifactFabricationSpecification", JSON.stringify(admitted));
  const plan = planJsnodeModules(input);
  assert.equal(plan.type, "JsnodeModuleFabricationPlan", JSON.stringify(plan));
  assert.equal(plan.workOrderSpecificationDigest, admitted.specificationDigest);
  assert.deepEqual(plan.paths, expectedPaths);
  assert.deepEqual([...plan.realizationPlan.acceptanceObligationIds].sort(), input.acceptanceObligations.map(item => item.id).sort());
  assert.deepEqual(input, before);
  // This is source-free planning, not selection execution or native receiving.
  assert.equal(Object.hasOwn(plan, "files"), false);
  assert.equal(Object.hasOwn(plan, "derivation"), false);
});

test("the same order reaches the genuine no-inference derivation boundary without a supplier or pre-assay", async () => {
  const input = candidate();
  const admitted = admitArtifactFabricationSpecification(input);
  assert.equal(admitted.type, "ArtifactFabricationSpecification");
  const result = await deriveJsnodeModules(input, {});
  assert.equal(result.type, "JsnodeModuleDerivationRefusal", JSON.stringify(result));
  assert.equal(result.phase, "derivation");
  assert.equal(result.code, "NO_DERIVATION_CARRIER");
  assert.equal(result.workOrderSpecificationDigest, admitted.specificationDigest);
  assert.equal(Object.hasOwn(result, "files"), false);
  assert.equal(Object.hasOwn(result, "derivation"), false);
});

test("a semantically blocking question refuses before the planner can claim a realization", () => {
  const input = candidate();
  input.openQuestions.push({
    type: "ArtifactFabricationOpenQuestion", version: 1, id: "unresolved-test-question",
    question: "Which bearer may an ambiguous account select without an explicit choice?",
    blocking: true, sourceSpan: input.requirements[0].sourceSpan,
  });
  const result = planJsnodeModules(input);
  assert.equal(result.type, "JsnodeModuleDerivationRefusal");
  assert.equal(result.phase, "artifact-specification-admission");
  assert.equal(result.code, "BLOCKING_OPEN_QUESTION");
});

test("the migrated legacy programme export retains the canonical Node carrier and workerd refusal", () => {
  assert.equal(legacyProgramme.executeJavascriptProgram, canonicalProgramme.executeJavascriptProgram);
  const source = [
    'import assert from "node:assert/strict";',
    'import { executeJavascriptProgram } from "@red-cup-engineering/javascript-node-services-section/execute-javascript-program";',
    'await assert.rejects(executeJavascriptProgram({fixture:true}), error => error instanceof TypeError && error.code === "programme-carrier-unavailable");',
  ].join("\n");
  const result = spawnSync(process.execPath, ["--conditions=workerd", "--input-type=module", "-e", source], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
