import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../scripts/sync-package-manifest.mjs", import.meta.url));

test("manifest normalization reports only completed literal writes, not other dirty files or dry-run plans", t => {
  const cwd = mkdtempSync(join(tmpdir(), "jsnode-manifest-receiving-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" });
  const write = (path, data) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), data);
  };
  const read = path => readFileSync(join(cwd, path), "utf8");
  const manifest = (name, dependencies) => JSON.stringify({ name, version: "1.0.0", dependencies }, null, 2) + "\n";
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Manifest Fixture");
  git("config", "user.email", "manifest@example.invalid");
  write("package.json", manifest("@red-cup-engineering/fixture", { "@red-cup-engineering/unneeded": "1.0.0" }));
  write("apps/worker with space/package.json", manifest("@red-cup-engineering/worker", { "@red-cup-engineering/unused": "1.0.0" }));
  write("apps/unchanged/package.json", manifest("@red-cup-engineering/unchanged", {}));
  write("test/fixtures/literal/package.json", manifest("@red-cup-engineering/fixture-data", { "@red-cup-engineering/ignored": "1.0.0" }));
  write("src/runtime.mjs", "export const content = 1;\n");
  git("add", "--all");
  git("commit", "-qm", "Establish original package source");
  const originalHead = git("rev-parse", "HEAD");
  write("src/runtime.mjs", "export const content = 2;\n");
  git("add", "src/runtime.mjs");
  const staged = git("ls-files", "--stage");

  const run = option => {
    const result = spawnSync(process.execPath, [cli, option, cwd], { cwd, encoding: "utf8" });
    assert.ifError(result.error);
    assert.equal(result.status, option === "--check" ? 1 : 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  assert.deepEqual(run("--check").writtenManifestPaths, []);
  assert.match(read("package.json"), /unneeded/u);
  const receipt = run("--write");
  const unstaged = git("diff", "--name-only", "-z").split("\0").filter(Boolean);
  assert.deepEqual(receipt.writtenManifestPaths, ["apps/worker with space/package.json", "package.json"]);
  assert.deepEqual(receipt.writtenManifestPaths, unstaged);
  assert.match(read("test/fixtures/literal/package.json"), /ignored/u);
  assert.equal(git("ls-files", "--stage"), staged);
  assert.equal(git("rev-parse", "HEAD"), originalHead);
  assert.deepEqual(run("--write").writtenManifestPaths, []);
});

test("a later package with unreadable tracked source prevents all manifest writes", t => {
  const cwd = mkdtempSync(join(tmpdir(), "jsnode-manifest-plan-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" });
  const manifest = '{"name":"@red-cup-engineering/root","dependencies":{"@red-cup-engineering/unused":"1.0.0"}}\n';
  const rootManifest = join(cwd, "package.json");
  mkdirSync(join(cwd, "packages", "later"), { recursive: true });
  const late = join(cwd, "packages", "later", "tracked.mjs");
  writeFileSync(rootManifest, manifest);
  writeFileSync(join(cwd, "packages", "later", "package.json"), '{"name":"@red-cup-engineering/later"}\n');
  writeFileSync(late, "export const shipped = true;\n");
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Planning Fixture");
  git("config", "user.email", "planning@example.invalid");
  git("add", "--all");
  git("commit", "-qm", "Establish complete fixture");
  const initialHead = git("rev-parse", "HEAD");
  rmSync(late);
  const result = spawnSync(process.execPath, [cli, "--write", cwd], { cwd, encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOENT/u);
  assert.equal(result.stdout, "");
  assert.equal(readFileSync(rootManifest, "utf8"), manifest);
  assert.equal(git("rev-parse", "HEAD"), initialHead);
  assert.equal(git("diff", "--cached", "--name-only"), "");
});
