import path from "node:path";


import {
  workspacePackageRootScanContract,
  workspaceScanContract,

} from "./schema.mjs";

/** Filesystem workspace-scanner move exposed by this service boundary. */

export const workspaceScannerIgnoredDirectories = Object.freeze([
  ".git",
  ".hg",
  ".svn",
  ".tmp",
  "coverage",
  "dist",
  "node_modules",
]);

export function workspacePackageManifestPath(root) {
  return path.join(root, "package.json");
}

export function workspaceScannerShouldSkip(name, ignore = new Set()) {
  return workspaceScannerIgnoredDirectories.includes(name) || ignore.has(name);
}

export function packageRootScan(root, source, admission) {
  return workspacePackageRootScanContract.assert(Object.freeze({
    kind: "metroplat.workspace.package-root",
    root,
    source,
    admission,
  }), "workspace package-root scan");
}

export function workspaceScan(root, packages) {
  return workspaceScanContract.assert(Object.freeze({
    kind: "metroplat.workspace.scan",
    root,
    packages: Object.freeze([...packages]),
  }), "workspace scan");
}
