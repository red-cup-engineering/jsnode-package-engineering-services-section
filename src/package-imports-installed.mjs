/** Installed package entrypoint preserving the original direct reader API. */
import typescript from "typescript";
import { createPackageImportReader } from "./package-imports.mjs";
export { HOUSE_SCOPE, CODE_FILE, packageNameOf, codeRole, createPackageImportReader } from "./package-imports.mjs";

const reader = createPackageImportReader(typescript);

/** Read house specifiers using the installed package's declared parser dependency. */
export function houseSpecifiersOfText(text, options) {
  return reader.houseSpecifiersOfText(text, options);
}

/** Classify package-owned imports using the installed package's declared parser dependency. */
export function importsOfFiles(files, options) {
  return reader.importsOfFiles(files, options);
}
