import assert from "node:assert/strict";
import test from "node:test";
import { testPlan } from "@red-cup-engineering/jsnode-package-services-section/package-test-plan";

test("JSNODE-PACKAGE-QUICKSTART", () => {
  const plan = testPlan({
    files: [
      "package.json",
      "test/unit.test.mjs",
      "test/integration/http.test.mjs",
      "test/fixtures/fake.test.mjs",
      "packages/child/package.json",
      "packages/child/test/child.test.mjs",
    ],
    manifest: {
      testRequires: { "test/integration/http.test.mjs": { network: "local integration service" } },
    },
  });

  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.tests, ["test/integration/http.test.mjs", "test/unit.test.mjs"]);
  assert.deepEqual(plan.requirements["test/integration/http.test.mjs"].requires, [
    { kind: "network", value: "local integration service" },
  ]);
});
