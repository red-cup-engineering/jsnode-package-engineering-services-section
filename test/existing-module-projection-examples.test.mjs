// Generated from the existing module's public behavior specification.
import nativeAssert from "node:assert/strict";
import test from "node:test";
const assert = Object.freeze({
  deepStrictEqual: nativeAssert.deepStrictEqual.bind(nativeAssert),
  rejects: nativeAssert.rejects.bind(nativeAssert),
});
const moduleUnderAssay = await import("../src/project-existing-module-example-tests.mjs");
const fabricatedOperation = moduleUnderAssay["projectExistingModuleExampleTests"];
if (typeof fabricatedOperation !== "function") throw new TypeError("Missing callable source export");

test("existing-module-projection: a public operation's examples project to its named Node test file", async () => {
  const submitted = {"name":"restore-flight","module":"src/flight.mjs","exportName":"openFlight","x-javascript-arguments":"positional","examples":[{"name":"restored turns","input":[42,{"turn":3}],"outputPath":["turn"],"output":3}]};
  const result = await fabricatedOperation(submitted);
  assert.deepStrictEqual(result["path"], "test/restore-flight-examples.test.mjs");
});
test("existing-module-projection: a caller mutation must address a member in the supplied input", async () => {
  await assert.rejects(async () => await fabricatedOperation({"name":"observe","module":"src/observe.mjs","exportName":"observe","examples":[{"name":"missing member","input":{"turn":3},"mutateInput":[{"path":["phase"],"value":4}],"output":3}]}), { name: "TypeError" });
});
test("existing-module-projection: a refusal and a returned value are exclusive observations", async () => {
  await assert.rejects(async () => await fabricatedOperation({"name":"observe","module":"src/observe.mjs","exportName":"observe","examples":[{"name":"conflicting expectations","input":null,"output":1,"throws":"TypeError"}]}), { name: "TypeError" });
});
