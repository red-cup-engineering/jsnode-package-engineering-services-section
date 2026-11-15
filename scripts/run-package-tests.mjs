#!/usr/bin/env node
// run-package-tests: run the current package's test plan with node --test. Arguments are node flags
// (--test-concurrency=1, --test-timeout=15000, --max-old-space-size=256 …) passed through as given. A test
// whose declared requirement this environment does not meet is not run: it is named on stderr as a `requires`
// line and listed in the report. The last line on stdout is one JSON report,
//   {"kind":"package-test-run.v1","ok":…,"package":…,"planned":…,"files":…,"ran":…,"passed":…,"failed":…,"requires":[…]}
// counting the tests node ran (ran = passed + failed + skipped + todo), so a caller can tell "requires" from
// "fails". A receiving run is incomplete if any enrolled program has unmet
// requirements, even when the runnable programs passed. Source runs may
// still report partial progress successfully.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { testPlan, unmetRequirements } from "../src/package-test-plan.mjs";
import { packageFiles, packageResolvesFrom } from "../src/package-files.mjs";
import { packageCheckExecutionProblem, receivePackageTestReport } from "../src/package-check-outcome.mjs";
import { assertUnfilteredPackageTestOptions, composePackageTestReporters } from "../src/package-test-reporters.mjs";

const directory = resolve(process.env.PACKAGE_TEST_DIRECTORY ?? process.cwd());
const manifestBytes = readFileSync(join(directory, "package.json"));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
// The profile selector is leading-only, so native option operands are never consumed.
const flags = process.argv.slice(2);
if (flags[0] === "--check-receiving-enrollment") {
  let stage = "source";
  let planned = 0;
  try {
    if (flags.length !== 1) throw new Error("enrollment preflight does not accept Node test flags");
    const committedManifest = execFileSync("git", ["-C", directory, "show", "HEAD:./package.json"],
      { maxBuffer: 2 ** 24, stdio: ["ignore", "pipe", "pipe"] });
    if (!committedManifest.equals(manifestBytes)) throw new Error("package.json differs from the selected Git revision");
    const tracked = execFileSync("git", ["-C", directory, "ls-tree", "-r", "-z", "HEAD", "--", "."],
      { encoding: "utf8", maxBuffer: 2 ** 24, stdio: ["ignore", "pipe", "pipe"] });
    const owns = new Map();
    for (const record of tracked.split("\0")) {
      const entry = /^100(?:644|755) blob ([0-9a-f]{40,64})\t(.+)$/su.exec(record);
      if (entry && lstatSync(join(directory, entry[2]), { throwIfNoEntry: false })?.isFile())
        owns.set(entry[2], entry[1]);
    }
    const admission = testPlan({ files: [...owns.keys()], manifest, profile: "receiving" });
    planned = admission.tests.length;
    if (admission.problems.length) throw new Error(admission.problems.join("; "));
    for (const path of admission.tests) {
      const actual = execFileSync("git", ["-C", directory, "hash-object", "--no-filters", "--", path],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
      if (actual !== owns.get(path)) throw new Error(`receiving program differs from the selected Git revision: ${path}`);
    }

    stage = "pack";
    const cache = mkdtempSync(join(tmpdir(), "package-enrollment-"));
    try {
      const packed = JSON.parse(execFileSync("npm",
        ["pack", ".", "--dry-run", "--json", "--offline", "--ignore-scripts", "--workspaces=false", "--cache", cache],
        { cwd: directory, encoding: "utf8", maxBuffer: 2 ** 24, timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] }));
      if (!Array.isArray(packed) || packed.length !== 1 || packed[0].name !== manifest.name ||
          packed[0].version !== manifest.version || !Array.isArray(packed[0].files) ||
          packed[0].files.some(entry => typeof entry?.path !== "string")) {
        throw new Error("npm did not report one file listing for the selected package identity");
      }
      const carrier = testPlan({ files: packed[0].files.map(entry => entry.path), manifest, profile: "receiving" });
      if (carrier.problems.length) throw new Error(carrier.problems.join("; "));
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
    process.stdout.write(JSON.stringify({ kind: "package-receiving-enrollment.v1", ok: true,
      package: manifest.name, planned, testsExecuted: false }) + "\n");
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    process.stderr.write(`run-package-tests: ${stage} receiving enrollment: ${detail}\n`);
    process.stdout.write(JSON.stringify({ kind: "package-receiving-enrollment.v1", ok: false,
      package: manifest.name ?? null, stage, planned, testsExecuted: false, error: detail }) + "\n");
    process.exitCode = 2;
  }
  process.exit(process.exitCode ?? 0);
}
const profile = flags[0] === "--receiving" ? (flags.shift(), "receiving") : "source";
const plan = testPlan({ files: packageFiles(directory), manifest, profile });
if (plan.problems.length) {
  for (const problem of plan.problems) process.stderr.write(`run-package-tests: ${problem}\n`);
  process.stdout.write(JSON.stringify({ kind: "package-test-run.v1", ok: false,
    package: manifest.name ?? null, profile, planned: plan.tests.length, files: 0,
    ran: 0, passed: 0, failed: 0, requires: [], error: plan.problems.join("; ") }) + "\n");
  process.exit(2);
}
const requires = [], run = [];
for (const test of plan.tests) {
  const unmet = unmetRequirements(plan.requirements[test], { environment: process.env, exists: existsSync, hasPackage: (name) => packageResolvesFrom(directory, name) });
  if (unmet.length) requires.push({ test, unmet });
  else run.push(test);
}
for (const { test, unmet } of requires) process.stderr.write(`requires ${test}: ${unmet.map(({ kind, value }) => `${kind} ${value}`).join("; ")}\n`);

const report = (counts, status, error = null, files = run.length) => {
  process.stdout.write(`\n${JSON.stringify({ kind: "package-test-run.v1", ok: status === 0, package: manifest.name ?? null, profile, planned: plan.tests.length, files, ...counts, requires, ...(error === null ? {} : { error }) })}\n`);
  process.exit(status);
};
// Preserve the historical empty, un-enrolled package case. By contrast, a
// declared test that is not runnable due to host/environment requirements
// cannot supply successful receiving evidence.
if (run.length === 0) {
  const emptyLegacyPlan = plan.tests.length === 0 && profile === "source" && !Object.hasOwn(manifest, "receivingTests");
  report({ ran: 0, passed: 0, failed: 0 }, emptyLegacyPlan ? 0 : 2,
    emptyLegacyPlan ? null : "no admitted tests available under current requirements");
}

if (profile === "receiving") {
  try { assertUnfilteredPackageTestOptions(flags, process.env.NODE_OPTIONS); }
  catch (error) {
    process.stderr.write(`run-package-tests: ${error.message}\n`);
    report({ ran: 0, passed: 0, failed: 0 }, 2, error.message, 0);
  }
}

// Retain the caller's combined inherited/CLI reporter bindings, then append a
// private TAP copy. Invalid original bindings remain invalid before additions.
const scratch = mkdtempSync(join(tmpdir(), "run-package-tests-"));
const tap = join(scratch, "report.tap");
// Its own test run, even when started from inside another (node --test marks a child with NODE_TEST_CONTEXT).
const { NODE_TEST_CONTEXT, ...environment } = process.env;
let result;
try {
  const composed = composePackageTestReporters({
    arguments: flags, nodeOptions: environment.NODE_OPTIONS,
    defaultReporter: process.stdout.isTTY ? "spec" : "tap",
    additionalReporters: [{ reporter: "tap", destination: tap }],
  });
  result = spawnSync(process.execPath, [...composed.arguments, "--test", "--", ...run], { cwd: directory, stdio: "inherit", env: environment });
}
catch (error) { result = { error }; }
const summary = (() => { try { return readFileSync(tap, "utf8"); } catch { return ""; } })();
rmSync(scratch, { recursive: true, force: true });
const received = receivePackageTestReport(summary, { files: run });
const incompleteReceiving = profile === "receiving" && requires.length > 0;
const nonPassingReceiving = profile === "receiving" && received.problem === null &&
  (received.counts.passed < 1 || received.counts.ran !== received.counts.passed);
const problems = [
  packageCheckExecutionProblem(result),
  received.problem,
  incompleteReceiving ? "receiving test requirements are unmet" : null,
  nonPassingReceiving ? "receiving tests must all pass; skipped, todo and empty runs do not qualify" : null,
].filter(problem => problem !== null);
const error = problems.length ? problems.join("; ") : null;
if (error !== null) process.stderr.write(`run-package-tests: ${error}\n`);
const passed = error === null && received.counts.failed === 0;
const failureStatus = Number.isInteger(result.status) && result.status > 0 && result.status <= 255 ? result.status : 1;
report(received.counts, passed ? 0 : failureStatus, error);
