import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { comparePnpmImporterManifest, decodePnpmLockfileImporters } from "../src/workspace/pnpm-lockfile.mjs";

const source = [
  "lockfileVersion: '9.0'","importers:","  .:","    dependencies:",
  "      'actual':","        specifier: 1.0.0","        version: 1.0.0",
  "  nested:","    devDependencies:",
  "      'actual':","        specifier: 2.0.0","        version: 2.0.0","",
].join("\n");

test("source-owned decoder preserves distinct importer addresses and exact resolved versions",()=>{
  const found=decodePnpmLockfileImporters(source);
  assert.equal(found.lockfileVersion,"9.0");
  assert.deepEqual(found.importers.map(item=>item.path),[".","nested"]);
  assert.deepEqual(found.importers.map(item=>item.dependencies[0].version),["1.0.0","2.0.0"]);
  assert.equal(found.importers[1].dependencies[0].field,"devDependencies");
});

test("duplicate importer declarations cannot overwrite one source with another",()=>{
  const bad=source.replace("  nested:", "  .:");
  assert.throws(()=>decodePnpmLockfileImporters(bad),/duplicate or unnamed importer/);
  assert.throws(()=>decodePnpmLockfileImporters(source+"importers:\n"),/duplicate importers root keys/);
});

test("duplicate, unnamed or incomplete dependency entries cannot claim a version",()=>{
  const repeated=source.replace("  nested:",[
    "      'actual':","        specifier: 1.0.0","        version: 2.0.0","  nested:",
  ].join("\n"));
  assert.throws(()=>decodePnpmLockfileImporters(repeated),/duplicated or unnamed dependency/);
  assert.throws(()=>decodePnpmLockfileImporters(
    source.replace("        version: 1.0.0", "        version:")),/lacks specifier or selected version/);
  assert.throws(()=>decodePnpmLockfileImporters(
    source.replace("        specifier: 1.0.0","        specifier:")),/lacks specifier or selected version/);
});

test("manifest preflight identifies changed ranges and asymmetric dependency membership", () => {
  assert.deepEqual(comparePnpmImporterManifest(source, {
    dependencies: { actual: "^1.0.0", unmatched: "1.0.0" },
  }), [
    { kind: "specifier-mismatch", field: "dependencies", name: "actual" },
    { kind: "manifest-only", field: "dependencies", name: "unmatched" },
  ]);
  assert.deepEqual(comparePnpmImporterManifest(source, { dependencies: { actual: "1.0.0" } }, "nested"), [
    { kind: "manifest-only", field: "dependencies", name: "actual" },
    { kind: "lock-only", field: "devDependencies", name: "actual" },
  ]);
});

test("preflight uses the selected importer and treats quoted ranges as declarations, not resolutions", () => {
  const quoted = source.replace("specifier: 1.0.0", "specifier: '^1.0.0'");
  assert.deepEqual(comparePnpmImporterManifest(quoted, { dependencies: { actual: "^1.0.0" } }), []);
  assert.deepEqual(comparePnpmImporterManifest(source, { devDependencies: { actual: "2.0.0" } }, "nested"), []);
  assert.throws(() => comparePnpmImporterManifest(source, {}, "not-selected"), /missing importer/u);
  assert.throws(() => comparePnpmImporterManifest(source.replace("9.0", "8.0"), {}), /version 9.0/u);
});

test("existing sync CLI checks root declarations before supplier startup or writes", () => {
  const root = mkdtempSync(join(tmpdir(), "jsnode-root-declarations-"));
  try {
    const lockfile = join(root, "pnpm-lock.yaml"), packageFile = join(root, "package.json");
    const script = new URL("../scripts/sync-package-manifest.mjs", import.meta.url);
    const run = (manifest, lock, flags = []) => {
      const input = JSON.stringify(manifest);
      writeFileSync(packageFile, input);
      writeFileSync(lockfile, lock);
      const completed = spawnSync(process.execPath, [script.pathname, "--check-pnpm-root", root, ...flags], {
        encoding: "utf8", timeout: 2000, maxBuffer: 65536,
      });
      assert.ifError(completed.error);
      assert.equal(completed.stderr, "");
      assert.equal(readFileSync(packageFile, "utf8"), input);
      assert.equal(readFileSync(lockfile, "utf8"), lock);
      return { exit: completed.status, receipt: JSON.parse(completed.stdout) };
    };
    const manifest = { dependencies: { actual: "1.0.0" } };
    const same = run(manifest, source);
    assert.equal(same.exit, 0);
    assert.equal(same.receipt.status, "agreement");
    assert.equal(same.receipt.scope, "literal-direct-declarations-only");
    const changed = run({ dependencies: { actual: "^2.0.0" } }, source);
    assert.equal(changed.exit, 1);
    assert.deepEqual(changed.receipt.differences, [{ kind: "specifier-mismatch", field: "dependencies", name: "actual" }]);

    for (const request of [
      [manifest, source, ["--write"]],
      [{ ...manifest, pnpm: { overrides: {} } }, source],
      [{ dependencies: { actual: "https://example.invalid/synthetic-private-value" } }, source],
      [{ ...manifest, optionalDependencies: { actual: "2.0.0" } }, source],
      [manifest, source.replace("    dependencies:", "    unknownImporterField:\n    dependencies:")],
      [manifest, source.replace("        specifier: 1.0.0", '        specifier: "1.0.\\x30"')],
      [manifest, source.replace("        version: 1.0.0", "        specifier: 2.0.0\n        version: 1.0.0")],
    ]) {
      const refused = run(...request);
      assert.equal(refused.exit, 2);
      assert.equal(refused.receipt.status, "unchecked");
      assert.doesNotMatch(JSON.stringify(refused), /synthetic-private-value/u);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
