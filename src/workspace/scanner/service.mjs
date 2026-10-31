/**
 * @packageDocumentation
 *
 * integrations/filesystem/services/workspace-scanner - live workspace host-mark scanning.
 *
 * This service owns filesystem traversal. It reads package roots as host marks
 * and emits admitted package records from `src/workspace/schemas/admission`; it does not define
 * package-manifest law itself.
 */
import path from "node:path";

import {
  admissionFailure,
  admitPackageManifest,

} from "@red-cup-engineering/jsnode-package-services-section/workspace/package-manifest";
import {
  admitPnpmLockfile,

} from "@red-cup-engineering/jsnode-package-services-section/workspace/lockfile";
import {
  admitWorkspaceDeclaration,

} from "@red-cup-engineering/jsnode-package-services-section/workspace/workspace-declaration";
import { binSurfaceOfPackageManifest } from "@red-cup-engineering/jsnode-package-services-section/workspace/bins";

import { exportSurfaceOfPackageManifest } from "@red-cup-engineering/jsnode-package-services-section/workspace/exports";
import { packageSurfaceOf } from "@red-cup-engineering/jsnode-package-services-section/workspace/package-surface";
import { publicationArtifactTargetPathsOf, publicationReleasePolicyOf, publicationStatusProofOf } from "@red-cup-engineering/jsnode-package-services-section/workspace/publication-status";
import {
  packageRootScan,
  workspacePackageManifestPath,
  workspaceScan as workspaceScanMaterial,
  workspaceScannerShouldSkip,

} from "./index.mjs";

/** Options for bounded recursive workspace scans. */

function scanPackageRootMaterial(root, options) {
  const absoluteRoot = path.resolve(root);
  const source = workspacePackageManifestPath(absoluteRoot);
  let mark;
  try {
    mark = options.readFileUtf8(source);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unreadable package manifest";
    return packageRootScan(absoluteRoot, source, admissionFailure(source, reason));
  }
  return packageRootScan(absoluteRoot, source, admitPackageManifest(mark, source));
}

function requirePackageManifestAdmission(result) {
  if (result.kind === "metroplat.admission.package-manifest") return result;
  throw new TypeError(`scanPackagePublicationStatus: package manifest admission failed at ${result.source}: ${result.reason}`);
}

function artifactPath(root, target) {
  return path.resolve(root, target.startsWith("./") ? target.slice(2) : target);
}

function targetPatternExists(root, target, options) {
  const relativeTarget = target.startsWith("./") ? target.slice(2) : target;
  const [prefix, suffix] = relativeTarget.split("*");
  if (prefix === undefined || suffix === undefined) return false;
  const base = path.resolve(root, prefix);
  const start = prefix.endsWith("/") ? base : path.dirname(base);
  const matches = (current) => {
    let entries;
    try {
      entries = options.readDirectoryEntries(current);
    } catch {
      return false;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory() && matches(entryPath)) return true;
      if (!entry.isFile()) continue;
      const relative = path.relative(root, entryPath).split(path.sep).join("/");
      if (relative.startsWith(prefix) && relative.endsWith(suffix)) return true;
    }
    return false;
  };
  return matches(start);
}

function isExecutable(mode) {
  return (mode & 0o111) !== 0;
}

function artifactFact(root, target, options) {
  if (target.includes("*")) {
    return Object.freeze({
      target,
      exists: targetPatternExists(root, target, options),
    });
  }
  const stats = options.statPathOrNull(artifactPath(root, target));
  return Object.freeze({
    target,
    exists: stats?.isFile() ?? false,
    ...(stats === null ? {} : { executable: stats.isFile() && isExecutable(stats.mode) }),
  });
}

/** Read one package root's `package.json` as a lensed admission observation. */

export function scanPackageRoot(root, options) {
  const scan = scanPackageRootMaterial(root, options);
  return Object.freeze({ operation: "scan-package-root", scan });
}

/** Read one package root's emitted targets and prove its package publication status. */
export function scanPackagePublicationStatus(root, options) {
  const scan = scanPackageRootMaterial(root, options);
  const admission = requirePackageManifestAdmission(scan.admission);
  const surface = packageSurfaceOf(exportSurfaceOfPackageManifest(admission), binSurfaceOfPackageManifest(admission));
  const proof = publicationStatusProofOf(surface, publicationArtifactTargetPathsOf(surface).map((target) => artifactFact(scan.root, target, options)));
  const policy = publicationReleasePolicyOf(admission, proof);
  return Object.freeze({
    kind: "metroplat.workspace-scanner.package-publication-status",
    root: scan.root,
    surface,
    proof,
    policy,
  });
}

/** Scan a workspace tree for package roots as a lensed admission observation. */
export function scanWorkspace(root, options) {
  const absoluteRoot = path.resolve(root);
  const maxDepth = options.maxDepth ?? 4;
  const ignore = new Set(options.ignore ?? []);
  const packages = [];

  const walk = (current, depth) => {
    if (options.pathExists(workspacePackageManifestPath(current))) packages.push(scanPackageRootMaterial(current, options));
    if (depth >= maxDepth) return;

    let entries;
    try {
      entries = options.readDirectoryEntries(current);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || workspaceScannerShouldSkip(entry.name, ignore)) continue;
      walk(path.join(current, entry.name), depth + 1);
    }
  };

  walk(absoluteRoot, 0);
  const scan = workspaceScanMaterial(absoluteRoot, packages);
  return Object.freeze({ operation: "scan-workspace", scan });
}

/** Read one workspace root's `pnpm-workspace.yaml` host mark. */
export function scanWorkspaceDeclaration(root, options) {
  const source = path.join(path.resolve(root), "pnpm-workspace.yaml");
  let mark;
  try {
    mark = options.readFileUtf8(source);
  } catch (error) {
    return admissionFailure(source, error instanceof Error ? error.message : "unreadable workspace declaration");
  }
  return admitWorkspaceDeclaration(mark, source);
}

/** Read one workspace root's `pnpm-lock.yaml` host mark. */
export function scanLockfile(root, options) {
  const source = path.join(path.resolve(root), "pnpm-lock.yaml");
  let mark;
  try {
    mark = options.readFileUtf8(source);
  } catch (error) {
    return admissionFailure(source, error instanceof Error ? error.message : "unreadable pnpm lockfile");
  }
  return admitPnpmLockfile(mark, source);
}

/** Resolve package manifests using the admitted workspace's complete glob declaration.
 * Negated selections remain exclusions. The host supplies glob expansion as an effect;
 * unsupported selection syntax fails at that boundary rather than becoming an empty graph. */
export function packageRootsOfWorkspaceDeclaration(root, declaration, options) {
  const absoluteRoot = path.resolve(root);
  const includes = declaration.packages.filter((pattern) => !pattern.startsWith("!"));
  const exclusions = declaration.packages.filter((pattern) => pattern.startsWith("!")).map((pattern) => pattern.slice(1));
  const manifestPatterns = includes.map((pattern) => `${pattern.replace(/\/$/u, "")}/package.json`);
  const roots = options.globPaths(absoluteRoot, manifestPatterns, exclusions)
    .map((manifest) => path.dirname(path.resolve(absoluteRoot, manifest)));
  return Object.freeze({ roots: Object.freeze([...new Set(roots)].sort()), unsupportedPatterns: Object.freeze([]) });
}

/**
 * Scan the workspace by its declared `pnpm-workspace.yaml` member patterns
 * rather than a depth-bounded directory walk, so packages nested deeper than
 * `scanWorkspace`'s default `maxDepth` are still admitted. The workspace root
 * itself is always included (pnpm treats it as an implicit importer). Falls
 * back to `scanWorkspace`'s bounded walk when no workspace declaration is
 * admitted at `root`.
 */
export function scanDeclaredWorkspace(root, options) {
  const absoluteRoot = path.resolve(root);
  const declaration = scanWorkspaceDeclaration(absoluteRoot, options);
  if (declaration.kind !== "metroplat.admission.workspace-declaration") {
    return scanWorkspace(absoluteRoot, options).scan;
  }
  const { roots } = packageRootsOfWorkspaceDeclaration(absoluteRoot, declaration, options);
  const candidates = [absoluteRoot, ...roots.filter((candidate) => candidate !== absoluteRoot)];
  const packages = candidates
    .filter((candidate) => options.pathExists(workspacePackageManifestPath(candidate)))
    .map((candidate) => scanPackageRootMaterial(candidate, options));
  return workspaceScanMaterial(absoluteRoot, packages);
}
