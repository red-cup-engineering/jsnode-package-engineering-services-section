import path from "node:path";


import {
  workspacePackageRootScanValidator,
  workspaceScanValidator,

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

export function packageRootScan(root, source, validation) {
  return workspacePackageRootScanValidator.assert(Object.freeze({
    kind: "metroplat.workspace.package-root",
    root,
    source,
    admission: validation,
  }), "workspace package-root scan");
}

export function workspaceScan(root, packages) {
  return workspaceScanValidator.assert(Object.freeze({
    kind: "metroplat.workspace.scan",
    root,
    packages: Object.freeze([...packages]),
  }), "workspace scan");
}
