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
import * as canonicalProgramme from "@red-cup-engineering/javascript-node-engineering-services-section/module-closure";
import * as legacyProgramme from "@red-cup-engineering/javascript-node-engineering-services-section/execute-javascript-program";

const fixture = new URL("./fixtures/shared-account-character-selection/", import.meta.url);
const candidate = () => JSON.parse(readFileSync(new URL("work-order.candidate.json", fixture), "utf8"));
const clauseSections = ["requirements", "prohibitions", "constraints", "acceptanceObligations"];
// The original authored v1 fixture remains the semantic baseline, not an
// admitted historical specification. Strip only the explicit v2 claim layer.
function legacyCandidate(input) {
  const legacy = structuredClone(input);
  legacy.version = 1;
  delete legacy.claims;
  for (const section of clauseSections) for (const clause of legacy[section]) {
    clause.version = 1;
    delete clause.parameters;
    delete clause.claimIds;
  }
  return legacy;
}
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
  assert.deepEqual(manifest.receivingTests, plan.tests);
  assert.ok(plan.tests.includes("test/shared-account-selection-plan.test.mjs"));
  for (const name of readdirSync(new URL(".", import.meta.url)).filter(name => name.endsWith(".test.mjs"))) {
    assert.ok(plan.tests.includes("test/" + name), name);
  }
});

test("authored v2 claims preserve the complete historical order without claiming execution", () => {
  const input = candidate();
  assert.equal(input.version, 2);
  // Digest of JSON.stringify(original authored v1 candidate at 703d966).
  assert.equal(createHash("sha256").update(JSON.stringify(legacyCandidate(input))).digest("hex"),
    "305dc31aa741d56f1db6417b7dfec36c8b8e3982b2bb1deabf898d9cc4d4b342");
  assert.deepEqual(clauseSections.map(section => input[section].length), [12, 5, 5, 16]);
  assert.equal(input.constraints.filter(clause => clause.kind === "operational").length, 2);
  assert.equal(input.traceability.length, 17);
  for (const trace of input.traceability) {
    assert.deepEqual(trace.acceptanceObligationIds, input.acceptanceObligations.map(item => item.id));
  }
  const source = readFileSync(new URL("WORK-ORDER.md", fixture), "utf8");
  assert.equal(input.source.provenance.digest, "sha256:" + createHash("sha256").update(source).digest("hex"));
  const lines = source.split("\n");
  assert.equal(input.claims.length, 4);
  for (const [index, section] of clauseSections.entries()) {
    const claim = input.claims[index];
    assert.equal(claim.status, "derived");
    assert.equal(claim.kind, "world");
    assert.equal(claim.quantity, null);
    assert.equal(claim.basis.type, "ArtifactFabricationDerivedBasis");
    const { startLine, endLine } = claim.sourceSpan;
    assert.deepEqual(claim.basis.premises, [{ type: "ArtifactFabricationPremise", kind: "citation",
      ref: `WORK-ORDER.md#L${startLine}-L${endLine}; ${input.source.provenance.digest}` }]);
    for (const clause of input[section]) {
      assert.equal(clause.version, 2);
      assert.deepEqual(clause.parameters, []);
      assert.deepEqual(clause.claimIds, [claim.id]);
      assert.ok(clause.sourceSpan.startLine >= startLine && clause.sourceSpan.endLine <= endLine);
      assert.ok(lines.slice(startLine - 1, endLine).join("\n").includes(clause.statement), clause.id);
    }
  }
});

test("the historical unclaimed order remains retired without invented admission evidence", () => {
  const legacy = legacyCandidate(candidate());
  assert.equal(admitArtifactFabricationSpecification(legacy).code, "LEGACY_CANDIDATE_RETIRED");
  const result = planJsnodeModules(legacy);
  assert.equal(result.type, "JsnodeModuleDerivationRefusal");
  assert.equal(result.phase, "artifact-specification-admission");
  assert.equal(result.code, "LEGACY_CANDIDATE_RETIRED");
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
    type: "ArtifactFabricationOpenQuestion", version: 2, id: "unresolved-test-question",
    question: "Which bearer may an ambiguous account select without an explicit choice?",
    blocking: true, claimId: null, sourceSpan: input.requirements[0].sourceSpan,
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
    'import { executeJavascriptProgram } from "@red-cup-engineering/javascript-node-engineering-services-section/execute-javascript-program";',
    'await assert.rejects(executeJavascriptProgram({fixture:true}), error => error instanceof TypeError && error.code === "programme-carrier-unavailable");',
  ].join("\n");
  const result = spawnSync(process.execPath, ["--conditions=workerd", "--input-type=module", "-e", source], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
