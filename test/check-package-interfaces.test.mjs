import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = fileURLToPath(new URL("../scripts/check-package-interfaces.mjs", import.meta.url));
const put = (root, file, text) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), text); };

// A repository with this morning's composition break (an import of an unexported subpath whose file exists),
// an export naming no file, and a provider only an install could resolve.
function repository(t) {
  const root = mkdtempSync(join(tmpdir(), "check-package-interfaces-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  put(root, "apps/engine/package.json", `${JSON.stringify({ name: "@red-cup-engineering/engine", version: "0.1.0", exports: { "./dispatch/operations": "./src/dispatch/operations.mjs", "./gone": "./src/gone.mjs" } }, null, 2)}\n`);
  put(root, "apps/engine/src/dispatch/operations.mjs", "export const operations = [];\n");
  put(root, "apps/engine/src/dispatch/work-inference-coordinate.mjs", "export function workInferenceCoordinate() {}\n");
  put(root, "apps/host/package.json", `${JSON.stringify({ name: "@red-cup-engineering/host", version: "0.1.0", exports: { ".": "./src/index.mjs" } }, null, 2)}\n`);
  put(root, "apps/host/src/index.mjs", [
    'import { operations } from "@red-cup-engineering/engine/dispatch/operations";',
    'import { workInferenceCoordinate } from "@red-cup-engineering/engine/dispatch/work-inference-coordinate";',
    'import { elsewhere } from "@red-cup-engineering/not-installed";',
    "",
  ].join("\n"));
  const git = (...args) => assert.equal(spawnSync("git", ["-C", root, ...args], { encoding: "utf8" }).status, 0);
  git("init", "-q"); git("add", "-A");
  return root;
}
const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  return { status: result.status, report: JSON.parse(result.stdout), stderr: result.stderr };
};

test("--check reports findings by break class and exits 1, writing nothing", (t) => {
  const root = repository(t);
  const before = readFileSync(join(root, "apps/engine/package.json"), "utf8");
  const { status, report } = run("--check", root);
  assert.equal(status, 1);
  assert.deepEqual(Object.keys(report.findings), ["export-target-missing", "export-into-retired-tree", "unexported-interface"]);
  assert.deepEqual(report.findings["export-target-missing"].map((row) => [row.package, row.subpath]), [["@red-cup-engineering/engine", "./gone"]]);
  assert.deepEqual(report.findings["unexported-interface"].map((row) => [row.file, row.specifier, row.role]), [
    ["apps/host/src/index.mjs", "@red-cup-engineering/engine/dispatch/work-inference-coordinate", "runtime"],
  ]);
  assert.deepEqual(report.diagnostics.map((row) => [row.reason, row.provider]), [["provider-unresolved", "@red-cup-engineering/not-installed"]]);
  assert.deepEqual(report.proposed, [{ package: "@red-cup-engineering/engine", dir: "apps/engine", subpath: "./dispatch/work-inference-coordinate", target: "./src/dispatch/work-inference-coordinate.mjs" }]);
  assert.equal(readFileSync(join(root, "apps/engine/package.json"), "utf8"), before);
});

test("--write adds the imported export in the manifest's own formatting and keeps every other export", (t) => {
  const root = repository(t);
  const { status, report } = run("--write", root);
  assert.equal(status, 1, "the missing ./gone target is still open");
  assert.equal(report.added.length, 1);
  const manifest = JSON.parse(readFileSync(join(root, "apps/engine/package.json"), "utf8"));
  assert.deepEqual(manifest.exports, {
    "./dispatch/operations": "./src/dispatch/operations.mjs",
    "./gone": "./src/gone.mjs",
    "./dispatch/work-inference-coordinate": "./src/dispatch/work-inference-coordinate.mjs",
  });
  assert.match(readFileSync(join(root, "apps/engine/package.json"), "utf8"), /^\{\n  "name"/u);
  const again = run("--check", root);
  assert.deepEqual(again.report.findings["unexported-interface"], []);
});
