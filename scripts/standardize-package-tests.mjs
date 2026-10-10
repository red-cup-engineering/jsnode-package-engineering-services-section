#!/usr/bin/env node
// standardize-package-tests: apply the STD-TEST codemod to every package of the repository the current
// directory is in. Dry run by default: prints the report as JSON. --write rewrites each changed package.json in
// its own formatting. The devDependency on @red-cup-engineering/jsnode-package-services-section is declared workspace:*, as
// every house dependency is: house packages are composed in workspaces, not installed standalone.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ownedFiles, packageRoots } from "../src/package-tree.mjs";
import { formatManifestLike } from "../src/sync-package-manifest.mjs";
import { standardizePackageTests } from "../src/standardize-package-tests.mjs";
import { testPlan } from "../src/package-test-plan.mjs";

const argv = process.argv.slice(2);
const write = argv.includes("--write");
const repository = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const tracked = execFileSync("git", ["-C", repository, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 1 << 30 }).split("\0").filter(Boolean);
const roots = packageRoots(tracked);
const manifests = new Map(roots.map((root) => [root, join(repository, root, "package.json")]));
const range = "workspace:*";

const report = { repository, range, packages: [] };
for (const root of roots) {
  let text; try { text = readFileSync(manifests.get(root), "utf8"); } catch { continue; }
  const manifest = JSON.parse(text);
  const files = ownedFiles(root, roots, tracked).map(({ path }) => path);
  const plan = testPlan({ files, manifest, nestedRoots: [] });
  const result = standardizePackageTests(manifest, plan, { range });
  if (plan.problems.length || result.changed || result.kept) {
    report.packages.push({ root, name: manifest.name ?? null, tests: plan.tests.length, problems: plan.problems, test: result.test, check: result.check, newlyRun: result.newlyRun, kept: result.kept });
  }
  if (write && result.changed) writeFileSync(manifests.get(root), formatManifestLike(text, result.manifest));
}
report.summary = {
  packages: roots.length,
  testChanged: report.packages.filter((p) => p.test).length,
  checkChanged: report.packages.filter((p) => p.check).length,
  kept: report.packages.filter((p) => p.kept).length,
  newlyRun: report.packages.reduce((n, p) => n + p.newlyRun.length, 0),
  problems: report.packages.reduce((n, p) => n + p.problems.length, 0),
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
