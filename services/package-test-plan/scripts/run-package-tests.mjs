#!/usr/bin/env node
// run-package-tests: run the current package's test plan with node --test. Arguments are node flags
// (--test-concurrency=1, --test-timeout=15000, --max-old-space-size=256 …) passed through as given. A test
// whose declared requirement this environment does not meet is not run; it is reported on stderr as a
// `requires` line, and the plan as one `package-test-plan {json}` line, so a caller can tell it from a failure.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { testPlan, unmetRequirements } from "../src/package-test-plan.mjs";
import { packageFiles, packageResolvesFrom } from "../src/package-files.mjs";

const directory = resolve(process.env.PACKAGE_TEST_DIRECTORY ?? process.cwd());
const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
const plan = testPlan({ files: packageFiles(directory), manifest });
if (plan.problems.length) {
  for (const problem of plan.problems) process.stderr.write(`run-package-tests: ${problem}\n`);
  process.exit(2);
}
const requires = [], run = [];
for (const test of plan.tests) {
  const unmet = unmetRequirements(plan.requirements[test], { environment: process.env, exists: existsSync, hasPackage: (name) => packageResolvesFrom(directory, name) });
  if (unmet.length) requires.push({ test, unmet });
  else run.push(test);
}
for (const { test, unmet } of requires) process.stderr.write(`requires ${test}: ${unmet.map(({ kind, value }) => `${kind} ${value}`).join("; ")}\n`);
process.stderr.write(`package-test-plan ${JSON.stringify({ package: manifest.name ?? null, tests: plan.tests.length, run: run.length, requires: requires.map(({ test, unmet }) => ({ test, unmet })) })}\n`);
if (run.length === 0) { process.stdout.write(`run-package-tests: ${manifest.name ?? directory} has no test to run here\n`); process.exit(0); }
// Its own test run, even when started from inside another (node --test marks a child with NODE_TEST_CONTEXT).
const { NODE_TEST_CONTEXT, ...environment } = process.env;
const result = spawnSync(process.execPath, [...process.argv.slice(2), "--test", ...run], { cwd: directory, stdio: "inherit", env: environment });
process.exit(result.status ?? 1);
