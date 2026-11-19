#!/usr/bin/env node
/**
 * sync-package-manifest: every package manifest of a repository with its house wiring set to what its code
 * uses (src/sync-package-manifest.mjs over src/package-imports.mjs).
 *
 *   node scripts/sync-package-manifest.mjs --check [REPOSITORY]   report packages out of sync; exit 1 if any
 *   node scripts/sync-package-manifest.mjs --write [REPOSITORY]   remove and move declarations, keeping each file's formatting
 *   node scripts/sync-package-manifest.mjs --write --add [REPOSITORY]   also declare house packages used but undeclared
 *   node scripts/sync-package-manifest.mjs --check-pnpm-root [REPOSITORY]   check literal root declarations only
 *   node scripts/sync-package-manifest.mjs --check-pnpm-release [PACKAGE]  check the declared frozen release product
 *   --receiving-tests explicitly projects installed receiving enrollment from the same canonical source test plan
 *
 * Packages are the tracked package.json files outside legacy, vendor, node_modules and test fixtures. A house
 * package used but undeclared takes the range the repository already declares it with, `workspace:*` when the
 * repository itself defines it, and is otherwise reported unresolved.
 */
import { execFileSync } from "node:child_process";
import { constants, openSync, closeSync, fstatSync, lstatSync, readSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
const argv = process.argv.slice(2);
const pnpmMode = argv.find(argument => argument === "--check-pnpm-root" || argument === "--check-pnpm-release");
if (pnpmMode) process.exitCode = await checkPnpmContract(argv, pnpmMode);
else await syncRepositoryManifests();

async function checkPnpmContract(args, mode) {
  const release = mode === "--check-pnpm-release";
  const lockfile = release ? "release/pnpm-lock.yaml" : "pnpm-lock.yaml";
  const operands = args.filter(argument => argument !== mode);
  const record = (status, details = {}) => {
    process.stdout.write(JSON.stringify({
      kind: "pnpm-importer-manifest-agreement/v1", importer: ".", scope: "literal-direct-declarations-only", status,
      ...(release ? { lockfile } : {}), ...details,
    }) + "\n");
    return status === "agreement" ? 0 : status === "drift" ? 1 : 2;
  };
  if (args.length !== operands.length + 1 || operands.length > 1 || operands.some(arg => arg.startsWith("-")))
    return record("unchecked", { reason: "invalid-arguments" });
  const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const read = path => {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
    try {
      const start = fstatSync(fd, { bigint: true });
      if (!start.isFile() || start.size > 8n * 1024n * 1024n) throw new Error();
      const size = Number(start.size), buffer = Buffer.alloc(size + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const count = readSync(fd, buffer, offset, buffer.length - offset, null);
        if (!count) break;
        offset += count;
      }
      const end = fstatSync(fd, { bigint: true });
      if (offset !== size || end.size !== start.size || end.ctimeNs !== start.ctimeNs || end.mtimeNs !== start.mtimeNs)
        throw new Error();
      return buffer.subarray(0, size).toString("utf8");
    } finally { closeSync(fd); }
  };
  const repository = resolve(operands[0] ?? ".");
  let manifest, lock;
  try {
    manifest = JSON.parse(read(join(repository, "package.json")));
  } catch { return record("unchecked", { reason: "unreadable-input" }); }
  if (!isRecord(manifest)) return record("unchecked", { reason: "invalid-manifest" });
  if (release && (manifest.registryConsumption?.frozenLockfile !== "./" + lockfile ||
      manifest.exports?.["./frozen-lockfile"] !== "./" + lockfile))
    return record("unchecked", { reason: "frozen-lock-product-not-declared" });
  try {
    if (release && !lstatSync(join(repository, "release")).isDirectory()) throw new Error();
    lock = read(join(repository, lockfile));
  } catch { return record("unchecked", { reason: "unreadable-input" }); }
  const requiresNativePolicy = manifest.pnpm !== undefined || manifest.peerDependencies !== undefined ||
    /^(?:overrides|catalogs|patchedDependencies)\s*:/mu.test(lock) || /^ +excludeLinksFromLockfile:\s*true\s*$/mu.test(lock);
  if (requiresNativePolicy && !release) return record("unchecked", { reason: "requires-native-policy-check" });
  const knownLiteral = value => typeof value === "string" && /^[a-zA-Z0-9*^~.<>=| +_-]{1,160}$/u.test(value);
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const declarations = manifest[field];
    if (declarations === undefined) continue;
    if (!isRecord(declarations) || Object.values(declarations).some(value => !knownLiteral(value)))
      return record("unchecked", { reason: "requires-native-specifier-check" });
  }
  try {
    const { comparePnpmImporterManifest } = await import("../src/workspace/pnpm-lockfile.mjs");
    // Observed keys under native policy are diagnostics, not an install verdict.
    if (requiresNativePolicy) return record("unchecked", {
      reason: "requires-native-policy-check",
      observedDifferences: comparePnpmImporterManifest(lock, manifest),
    });
    const differences = comparePnpmImporterManifest(lock, manifest, ".", { includeSelection: true });
    return record(differences.length ? "drift" : "agreement", { differences });
  } catch { return record("unchecked", { reason: "unreadable-or-unsupported-importer" }); }
}

async function syncRepositoryManifests() {
  const [
    { default: typescript }, { createPackageImportReader }, { ownedFiles, packageRoots },
    { formatManifestLike, syncPackageManifest }, { testPlan },
  ] = await Promise.all([
    import("typescript"), import("../src/package-imports.mjs"), import("../src/package-tree.mjs"),
    import("../src/sync-package-manifest.mjs"), import("../src/package-test-plan.mjs"),
  ]);
  const { importsOfFiles } = createPackageImportReader(typescript);
  const mode = process.argv.includes("--write") ? "write" : "check";
  const adding = process.argv.includes("--add");
  const enrolling = process.argv.includes("--receiving-tests");
  const repository = resolve(process.argv.slice(2).find((argument) => !argument.startsWith("--")) ?? ".");
  const tracked = execFileSync("git", ["-C", repository, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 1 << 30 }).split("\0").filter(Boolean);
  const roots = packageRoots(tracked);
  const sources = new Map(roots.map(root => {
    const path = root === "." ? "package.json" : `${root}/package.json`;
    const file = join(repository, path), text = readFileSync(file, "utf8");
    return [root, { path, file, text, manifest: JSON.parse(text) }];
  }));
  const manifests = new Map([...sources].map(([root, source]) => [root, source.manifest]));
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
  const report = [], rewrites = [], writtenManifestPaths = [];
  for (const [root, manifest] of manifests) {
    const owned = ownedFiles(root, roots, tracked);
    const files = owned.filter(({ path }) => /\.(?:[cm]?[jt]s|[jt]sx)$/u.test(path))
      .map(({ path, file }) => ({ path, text: readFileSync(join(repository, file), "utf8") }));
    const receiving = enrolling ? testPlan({ files: owned.map(item => item.path), manifest }) : null;
    if (receiving?.problems.length) throw new TypeError(`source test plan refused: ${receiving.problems.join("; ")}`);
    const { manifest: synced, changes, undeclared, unresolved } = syncPackageManifest(manifest, importsOfFiles(files), {
      rangeOf, add: adding, ...(receiving?.tests.length ? { receivingTests: receiving.tests } : {}),
    });
    if (!changes.length && !undeclared.length && !unresolved.length) continue;
    report.push({ package: manifest.name, path: root, changes, undeclared, unresolved });
    if (mode === "write" && changes.length) {
      const source = sources.get(root);
      const after = formatManifestLike(source.text, synced);
      if (source.text !== after) rewrites.push({ source, after });
    }
  }
  // Refused plans must not leave a misleading partial rewrite. Finish every
  // source read, import analysis and receiving-plan check before any write.
  for (const { source } of rewrites) {
    if (readFileSync(source.file, "utf8") !== source.text)
      throw new Error(`manifest changed during planning: ${source.path}`);
  }
  for (const { source, after } of rewrites) {
    writeFileSync(source.file, after);
    writtenManifestPaths.push(source.path);
  }
  process.stdout.write(JSON.stringify({ kind: "sync-package-manifest", mode, add: adding, repository, packages: report, writtenManifestPaths: writtenManifestPaths.sort() }, null, 2) + "\n");
  if (mode === "check" && report.some((entry) => entry.changes.length)) process.exitCode = 1;
}
