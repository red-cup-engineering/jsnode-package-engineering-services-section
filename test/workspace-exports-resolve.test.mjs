import assert from "node:assert/strict";
import test from "node:test";
import { exportSubpaths, exportTargets, resolveExportSubpath } from "../src/workspace/exports/resolve.mjs";

test("sugar forms stand for the root subpath", () => {
  for (const value of ["./index.mjs", ["./index.mjs"], { import: "./index.mjs", default: "./index.cjs" }]) {
    assert.deepEqual(exportSubpaths(value), [{ subpath: ".", pattern: false }]);
    assert.deepEqual(resolveExportSubpath(value, "."), { status: "exported", key: ".", target: "./index.mjs" });
  }
  assert.deepEqual(exportSubpaths(undefined), []);
  assert.deepEqual(resolveExportSubpath(undefined, "."), { status: "unexported" });
});

test("exact subpaths win over patterns, and the longest pattern prefix wins among patterns", () => {
  const map = { "./x": "./src/x.mjs", "./*": "./src/*.mjs", "./dispatch/*": "./src/dispatch/*.mjs" };
  assert.deepEqual(resolveExportSubpath(map, "./x"), { status: "exported", key: "./x", target: "./src/x.mjs" });
  assert.deepEqual(resolveExportSubpath(map, "./y"), { status: "exported", key: "./*", target: "./src/y.mjs" });
  assert.deepEqual(resolveExportSubpath(map, "./dispatch/operations"), { status: "exported", key: "./dispatch/*", target: "./src/dispatch/operations.mjs" });
  assert.deepEqual(resolveExportSubpath({ "./a": "./a.mjs" }, "./b"), { status: "unexported" });
});

test("conditions resolve in key order, arrays take the first match, and null excludes", () => {
  const map = {
    ".": { types: "./index.d.mts", import: "./index.mjs", require: "./index.cjs" },
    "./node-only": { node: { import: "./node.mjs" }, default: "./browser.mjs" },
    "./private/*": null,
    "./private/open": "./private/open.mjs",
    "./require-only": { require: "./r.cjs" },
    "./fallback": [{ worker: "./w.mjs" }, "./f.mjs"],
  };
  assert.equal(resolveExportSubpath(map, ".").target, "./index.mjs");
  assert.equal(resolveExportSubpath(map, "./node-only").target, "./node.mjs");
  assert.equal(resolveExportSubpath(map, "./node-only", ["browser", "default"]).target, "./browser.mjs");
  assert.deepEqual(resolveExportSubpath(map, "./private/secret"), { status: "excluded", key: "./private/*" });
  assert.equal(resolveExportSubpath(map, "./private/open").target, "./private/open.mjs");
  assert.deepEqual(resolveExportSubpath(map, "./require-only"), { status: "unexported" });
  assert.equal(resolveExportSubpath(map, "./fallback").target, "./f.mjs");
});

test("every target a map names is listed with its subpath and condition path", () => {
  const targets = exportTargets({ ".": { types: "./i.d.mts", import: "./i.mjs" }, "./*": "./src/*.mjs", "./gone": null });
  assert.deepEqual(targets.map(({ subpath, conditions, target }) => [subpath, conditions.join("+"), target]), [
    [".", "types", "./i.d.mts"],
    [".", "import", "./i.mjs"],
    ["./*", "", "./src/*.mjs"],
  ]);
});
