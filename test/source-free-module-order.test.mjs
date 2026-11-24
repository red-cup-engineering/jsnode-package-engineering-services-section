import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sha256Hex } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";
import { moduleFabricationPlan, testsOfClosure } from "../src/plan-jsnode-modules.mjs";
import { translateMarkdownJsnodeOperationPackageSpecification } from "../src/translate-markdown-jsnode-operation-package-specification.mjs";

test("the source-free module order reproduces its original Node test source", async () => {
  const path = "examples/source-free-module-order.md";
  const text = await readFile(new URL("../" + path, import.meta.url), "utf8");
  const translated = translateMarkdownJsnodeOperationPackageSpecification({
    type: "MarkdownJsnodeOperationPackageSpecificationTranslationRequest",
    version: 1,
    source: { type: "MarkdownDocumentSource", path, text },
  });
  const { closure, workOrder } = moduleFabricationPlan(translated.artifactSpecificationCandidate);
  assert.equal(workOrder.specificationDigest, "ni:///sha-256;TRD_FwBk2wANhSAvm1veBe-w4x-rk9rP3CK8ksIiKyY");
  const files = testsOfClosure(closure);
  assert.deepEqual(files.map(file => [file.path, sha256Hex(file.text)]), [
    ["test/double-value-examples.test.mjs", "2b41959b5c28507d1a211596e641c6c20da5aa59e2f7a587e9e69620dfb2c7bc"],
    ["test/increment-value-examples.test.mjs", "c2b7f71a8581322476fe55ef1cf92b60ad7665553a004d694085592ce6b7f1b8"],
  ]);
});
