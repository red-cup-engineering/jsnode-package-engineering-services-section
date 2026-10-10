#!/usr/bin/env node
/**
 * sync-package-manifest: every package manifest of a repository with its house wiring set to what its code
 * uses (src/sync-package-manifest.mjs over src/package-imports.mjs).
 *
 *   node scripts/sync-package-manifest.mjs --check [REPOSITORY]   report packages out of sync; exit 1 if any
 *   node scripts/sync-package-manifest.mjs --write [REPOSITORY]   remove and move declarations, keeping each file's formatting
 *   node scripts/sync-package-manifest.mjs --write --add [REPOSITORY]   also declare house packages used but undeclared
 *
 * Packages are the tracked package.json files outside legacy, vendor, node_modules and test fixtures. A house
 * package used but undeclared takes the range the repository already declares it with, `workspace:*` when the
 * repository itself defines it, and is otherwise reported unresolved.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { importsOfFiles } from "../src/package-imports.mjs";
import { formatManifestLike, syncPackageManifest } from "../src/sync-package-manifest.mjs";

const mode = process.argv.includes("--write") ? "write" : "check";
const adding = process.argv.includes("--add");
const repository = resolve(process.argv.slice(2).find((argument) => !argument.startsWith("--")) ?? ".");
const tracked = execFileSync("git", ["-C", repository, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 1 << 30 }).split("\0").filter(Boolean);
const NOT_PACKAGE = /(?:^|\/)(?:legacy|vendor|vendored|node_modules|test|tests|__tests__|fixtures|examples)\//u;
const roots = tracked.filter((file) => /(?:^|\/)package\.json$/u.test(file) && !NOT_PACKAGE.test(file)).map((file) => file.replace(/\/?package\.json$/u, "") || ".");
const manifests = new Map(roots.map((root) => [root, JSON.parse(readFileSync(join(repository, root, "package.json"), "utf8"))]));
const members = new Set([...manifests.values()].map((manifest) => manifest.name).filter(Boolean));
const declaredRanges = new Map();
for (const manifest of manifests.values()) for (const key of ["dependencies", "optionalDependencies", "devDependencies"]) {
  for (const [name, range] of Object.entries(manifest[key] ?? {})) {
    const counts = declaredRanges.get(name) ?? new Map();
    counts.set(range, (counts.get(range) ?? 0) + 1);
    declaredRanges.set(name, counts);
  }
}
const rangeOf = (name) => {
  const counts = declaredRanges.get(name);
  if (counts) return [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0][0];
  return members.has(name) ? "workspace:*" : null;
};
const under = (root, file) => root === "." || file.startsWith(`${root}/`);
const report = [];
for (const [root, manifest] of manifests) {
  const nestedRoots = roots.filter((other) => other !== root && under(root, other) && other !== ".").map((other) => root === "." ? other : other.slice(root.length + 1));
  const files = tracked.filter((file) => under(root, file)).map((file) => ({ path: root === "." ? file : file.slice(root.length + 1), file }))
    .filter(({ path }) => /\.(?:[cm]?[jt]s|[jt]sx)$/u.test(path))
    .map(({ path, file }) => ({ path, text: readFileSync(join(repository, file), "utf8") }));
  const { manifest: synced, changes, undeclared, unresolved } = syncPackageManifest(manifest, importsOfFiles(files, { nestedRoots }), { rangeOf, add: adding });
  if (!changes.length && !undeclared.length && !unresolved.length) continue;
  report.push({ package: manifest.name, path: root, changes, undeclared, unresolved });
  if (mode === "write" && changes.length) {
    const file = join(repository, root, "package.json");
    writeFileSync(file, formatManifestLike(readFileSync(file, "utf8"), synced));
  }
}
process.stdout.write(JSON.stringify({ kind: "sync-package-manifest", mode, add: adding, repository, packages: report }, null, 2) + "\n");
if (mode === "check" && report.some((entry) => entry.changes.length)) process.exitCode = 1;
