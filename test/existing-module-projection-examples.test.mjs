// Generated from the existing module's public behavior specification.
import nativeAssert from "node:assert/strict";
import test from "node:test";
const assert = Object.freeze({
  deepStrictEqual: nativeAssert.deepStrictEqual.bind(nativeAssert),
  rejects: nativeAssert.rejects.bind(nativeAssert),
});
const moduleUnderTest = await import("../src/project-existing-module-example-tests.mjs");
const operationUnderTest = moduleUnderTest["projectExistingModuleExampleTests"];
if (typeof operationUnderTest !== "function") throw new TypeError("Missing callable source export");

test("existing-module-projection: examples generate a Node test file for the named operation", async () => {
  const submitted = {"name":"restore-flight","module":"src/flight.mjs","exportName":"openFlight","x-javascript-arguments":"positional","examples":[{"name":"restored turns","input":[42,{"turn":3}],"outputPath":["turn"],"output":3}]};
  const result = await operationUnderTest(submitted);
  assert.deepStrictEqual(result["path"], "test/restore-flight-examples.test.mjs");
});
test("existing-module-projection: a caller mutation must address a member in the supplied input", async () => {
  await assert.rejects(async () => await operationUnderTest({"name":"observe","module":"src/observe.mjs","exportName":"observe","examples":[{"name":"missing member","input":{"turn":3},"mutateInput":[{"path":["phase"],"value":4}],"output":3}]}), { name: "TypeError" });
});
test("existing-module-projection: an example cannot both return a value and throw", async () => {
  await assert.rejects(async () => await operationUnderTest({"name":"observe","module":"src/observe.mjs","exportName":"observe","examples":[{"name":"conflicting expectations","input":null,"output":1,"throws":"TypeError"}]}), { name: "TypeError" });
});
test("existing-module-projection: a SignCell example can specify a null result", async () => {
  const submitted = {"name":"score","module":"src/score.mjs","exportName":"score","examples":[{"subject":{"operation":{"module":"src/score.mjs","exportName":"score"},"name":"an empty score","input":[]},"predicate":"jsnode.example.returns","object":null,"for":["game rules"],"against":[]}]};
  const result = await operationUnderTest(submitted);
  assert.deepStrictEqual(result["path"], "test/score-examples.test.mjs");
});
test("existing-module-projection: conflicting evidence invalidates an example", async () => {
  await assert.rejects(async () => await operationUnderTest({"name":"score","module":"src/score.mjs","exportName":"score","examples":[{"subject":{"operation":{"module":"src/score.mjs","exportName":"score"},"name":"an empty score","input":[]},"predicate":"jsnode.example.returns","object":null,"for":["game rules"],"against":["amended rules"]}]}), { name: "TypeError" });
});
test("existing-module-projection: a declaration about one export cannot specify another", async () => {
  await assert.rejects(async () => await operationUnderTest({"name":"score","module":"src/score.mjs","exportName":"reset","examples":[{"subject":{"operation":{"module":"src/score.mjs","exportName":"score"},"name":"an empty score","input":[]},"predicate":"jsnode.example.returns","object":null,"for":["game rules"],"against":[]}]}), { name: "TypeError" });
});
