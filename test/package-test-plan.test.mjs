import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { packageFiles } from "../src/package-files.mjs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { admitTestRequires, nestedPackageRoots, ownFiles, testPlan, unmetRequirements } from "../src/package-test-plan.mjs";

const FILES = [
  "package.json", "src/a.mjs", "src/a.test.mjs", "src/web/b.test.js", "src/types.test.mts", "src/old.cjs",
  "test/one.test.mjs", "test/deep/two.test.mjs", "test/helper.mjs", "test/fixtures/x/test/index.test.mjs",
  "lib/legacy/c.test.mjs", "node_modules/p/d.test.mjs", "vendor/e.test.mjs", "README.md",
  "services/inner/package.json", "services/inner/test/inner.test.mjs", "services/inner/src/i.mjs",
];

test("the plan is every *.test.{mjs,js,cjs,mts} the package owns, at any depth", () => {
  const plan = testPlan({ files: FILES });
  assert.deepEqual(plan.tests, ["src/a.test.mjs", "src/types.test.mts", "src/web/b.test.js", "test/deep/two.test.mjs", "test/one.test.mjs"]);
  assert.deepEqual(plan.problems, []);
});

test("nested packages, node_modules, legacy, vendor and fixtures are not the package's own", () => {
  assert.deepEqual(nestedPackageRoots(FILES), ["services/inner"]);
  const own = ownFiles(FILES);
  for (const path of ["services/inner/test/inner.test.mjs", "lib/legacy/c.test.mjs", "node_modules/p/d.test.mjs", "vendor/e.test.mjs", "test/fixtures/x/test/index.test.mjs"]) assert.equal(own.includes(path), false, path);
  // A fixture's own package.json does not make a nested package.
  assert.deepEqual(nestedPackageRoots([...FILES, "test/fixtures/pkg/package.json"]), ["services/inner"]);
});

test("check reads the package's own JavaScript, runtime and test, not TypeScript", () => {
  assert.deepEqual(testPlan({ files: FILES }).check, ["src/a.mjs", "src/a.test.mjs", "src/old.cjs", "src/web/b.test.js", "test/deep/two.test.mjs", "test/helper.mjs", "test/one.test.mjs"]);
});

test("testRequires declares requirements by kind; a declared test stays in the plan", () => {
  const plan = testPlan({ files: FILES, manifest: { testRequires: {
    "test/one.test.mjs": { host: "/home/emsenn/info", reason: "reads the corpus" },
    "./test/deep/two.test.mjs": { env: ["HIVE_KEY_ROOT", "EVM_RPC_URL"], network: "calls an RPC endpoint", package: "@red-cup-engineering/absent" },
  } } });
  assert.equal(plan.tests.includes("test/one.test.mjs"), true);
  assert.deepEqual(plan.requirements["test/one.test.mjs"], { requires: [{ kind: "host", value: "/home/emsenn/info" }], reason: "reads the corpus" });
  assert.deepEqual(plan.requirements["test/deep/two.test.mjs"].requires.map(({ kind }) => kind), ["env", "env", "network", "package"]);
});

test("a declaration must name a test of the package and real requirements", () => {
  const { problems } = admitTestRequires({
    "test/gone.test.mjs": { host: "/x" },
    "test/one.test.mjs": { flaky: true },
    "src/a.test.mjs": { env: "" },
    "test/deep/two.test.mjs": {},
  }, ["test/one.test.mjs", "src/a.test.mjs", "test/deep/two.test.mjs"]);
  assert.equal(problems.length, 4);
  assert.match(problems.join("\n"), /not a test of this package/u);
  assert.match(problems.join("\n"), /unknown kind flaky/u);
  assert.match(problems.join("\n"), /env must name its variable/u);
  assert.match(problems.join("\n"), /declares no requirement/u);
  assert.deepEqual(admitTestRequires([], []).problems, ["testRequires must be an object from test path to its requirement"]);
});

test("a requirement is met by the path, the variable, the package or TEST_NETWORK=1, and only then", () => {
  const requirement = { requires: [{ kind: "host", value: "~/corpus" }, { kind: "env", value: "KEY" }, { kind: "package", value: "@x/y" }, { kind: "network", value: "calls out" }] };
  const none = unmetRequirements(requirement, { environment: { HOME: "/h" }, exists: () => false, hasPackage: () => false });
  assert.deepEqual(none.map(({ kind }) => kind), ["host", "env", "package", "network"]);
  const seen = [];
  const all = unmetRequirements(requirement, { environment: { HOME: "/h", KEY: "v", TEST_NETWORK: "1" }, exists: (path) => { seen.push(path); return true; }, hasPackage: () => true });
  assert.deepEqual(all, []);
  assert.deepEqual(seen, ["/h/corpus"]);
  assert.deepEqual(unmetRequirements(undefined, {}), []);
});

test("run-package-tests runs the plan, reports an unmet requirement as requires, and fails on a failing test", (t) => {
  const root = mkdtempSync(join(tmpdir(), "package-test-plan-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  write("package.json", JSON.stringify({ name: "@x/demo", testRequires: { "test/host.test.mjs": { host: join(root, "absent-corpus"), reason: "reads a corpus" } } }));
  write("test/pass.test.mjs", 'import { test } from "node:test"; test("passes", () => {});\n');
  write("src/deep/also.test.mjs", 'import { test } from "node:test"; test("also passes", () => {});\n');
  write("test/host.test.mjs", 'import { test } from "node:test"; test("would fail", () => { throw new Error("ran"); });\n');
  write("test/fixtures/f/test/index.test.mjs", 'throw new Error("a fixture is not a test");\n');
  const runner = fileURLToPath(new URL("../scripts/run-package-tests.mjs", import.meta.url));
  const ok = spawnSync(process.execPath, [runner], { cwd: root, encoding: "utf8", env: { ...process.env, TEST_NETWORK: "" } });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stderr, /requires test\/host\.test\.mjs: host /u);
  const report = (stdout) => JSON.parse(stdout.trim().split("\n").at(-1));
  const first = report(ok.stdout);
  assert.equal(first.ok, true);
  assert.deepEqual({ kind: first.kind, planned: first.planned, files: first.files, ran: first.ran, passed: first.passed, failed: first.failed, requires: first.requires.map(({ test }) => test) },
    { kind: "package-test-run.v1", planned: 3, files: 2, ran: 2, passed: 2, failed: 0, requires: ["test/host.test.mjs"] });
  // Where the requirement is met, the test runs, and its failure is a failure.
  mkdirSync(join(root, "absent-corpus"));
  const met = spawnSync(process.execPath, [runner], { cwd: root, encoding: "utf8" });
  assert.notEqual(met.status, 0);
  assert.deepEqual((({ ok, ran, passed, failed, requires }) => ({ ok, ran, passed, failed, requires }))(report(met.stdout)), { ok: false, ran: 3, passed: 2, failed: 1, requires: [] });
  // check-package-syntax reads the same own files.
  const check = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/check-package-syntax.mjs", import.meta.url))], { cwd: root, encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /3\/3 files parse/u);
});


test("the original installed package enrolls exactly its canonical source-owned test plan", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const plan = testPlan({ files: packageFiles(root), manifest });
  assert.deepEqual(plan.problems, []);
  assert.ok(plan.tests.length > 0, "original package must expose real executable tests");
  assert.deepEqual(manifest.receivingTests, plan.tests,
    "installed receiving enrollment must be generated from the ONE original test plan, never a separate hand-maintained list");
});
test("installed receiving refuses enrollment drift and all unavailable tests without discarding legacy empty plans", (t) => {
  const root = mkdtempSync(join(tmpdir(), "empty-test-receiving-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runner = fileURLToPath(new URL("../scripts/run-package-tests.mjs", import.meta.url));
  const report = output => JSON.parse(output.trim().split("\n").at(-1));
  const spawn = (available = "") => spawnSync(process.execPath, [runner], {
    cwd: root, encoding: "utf8", env: { ...process.env, EMPTY_PLAN_UNAVAILABLE: available },
  });
  const manifestPath = join(root, "package.json");
  writeFileSync(manifestPath, JSON.stringify({ name: "@x/empty-plan" }));
  const legacy = spawn();
  assert.equal(legacy.status, 0, legacy.stderr);
  assert.deepEqual(
    (({ ok, planned, files, ran, passed, failed, requires }) => ({ ok, planned, files, ran, passed, failed, requires }))(report(legacy.stdout)),
    { ok: true, planned: 0, files: 0, ran: 0, passed: 0, failed: 0, requires: [] },
    "a historical unenrolled empty package retains its original meaning",
  );
  writeFileSync(manifestPath, JSON.stringify({
    name: "@x/empty-plan", receivingTests: ["test/missing.test.mjs"],
  }));
  const missing = spawn();
  assert.notEqual(missing.status, 0, "a missing enrolled test must not be erased by discovery");
  assert.equal(report(missing.stdout).ok, false);
  assert.match(report(missing.stdout).error, /enrollment differs from canonical test plan/u);

  mkdirSync(join(root, "test"));
  writeFileSync(join(root, "test", "needs-host.test.mjs"),
    'import test from "node:test"; test("requires host", () => {});\n');
  const manifest = {
    name: "@x/empty-plan",
    receivingTests: ["test/needs-host.test.mjs"],
    testRequires: {
      "test/needs-host.test.mjs": { env: "EMPTY_PLAN_UNAVAILABLE", reason: "independent host prerequisite" },
    },
  };
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const withheld = spawn();
  assert.notEqual(withheld.status, 0, "all host-blocked tests must not yield an accepted receipt");
  const unreceived = report(withheld.stdout);
  assert.deepEqual(
    (({ ok, planned, files, ran, passed, failed }) => ({ ok, planned, files, ran, passed, failed }))(unreceived),
    { ok: false, planned: 1, files: 0, ran: 0, passed: 0, failed: 0 },
  );
  assert.deepEqual(unreceived.requires.map(({ test }) => test), ["test/needs-host.test.mjs"]);
  assert.match(unreceived.error, /no admitted tests available under current requirements/u);

  const received = spawn("admitted");
  assert.equal(received.status, 0, received.stdout + received.stderr);
  const accepted = report(received.stdout);
  assert.deepEqual(
    (({ ok, planned, files, ran, passed, failed, requires }) => ({ ok, planned, files, ran, passed, failed, requires }))(accepted),
    { ok: true, planned: 1, files: 1, ran: 1, passed: 1, failed: 0, requires: [] },
  );

  writeFileSync(join(root, "test", "unexpected.test.mjs"),
    'import test from "node:test"; test("unexpected", () => {});\n');
  const drift = spawn("admitted");
  assert.notEqual(drift.status, 0, "new undisclosed native test cannot silently alter the receiving plan");
  assert.equal(report(drift.stdout).ok, false);
  assert.match(report(drift.stdout).error, /enrollment differs from canonical test plan/u);
});
