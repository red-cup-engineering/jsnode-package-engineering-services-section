/**
 * @packageDocumentation
 *
 * admission/package-manifest - package-phase host mark admission.
 *
 * This module does not discover files. It reads a host mark already supplied as
 * JSON text or JSON-shaped data and either admits it as a package-manifest
 * admission record or returns a carried failure. That keeps host discovery in services
 * while giving package code a coherent admission boundary.
 */
import {
  isJsonRecord,
  parse as parseJson,
  requireJsonValue,

} from "@red-cup-engineering/json-engine";
import {
  validationFailureValidator,
  packageManifestValidationValidator,

} from "./schemas/admission.mjs";

/** A package manifest mark admitted or rejected by the package phase. */

/** Build a carried admission failure for package-phase readers and services. */
export function validationFailure(source, reason) {
  return validationFailureValidator.assert({
    kind: "metroplat.admission.failure",
    source,
    reason,
  }, "package manifest admission failure");
}

function readHostMark(mark) {
  return typeof mark === "string" ? parseJson(mark) : requireJsonValue(mark, "package manifest host mark");
}

function manifestName(mark) {
  const name = mark["name"];
  return typeof name === "string" && name.trim() !== "" ? name : undefined;
}

/**
 * Admit a package manifest host mark.
 *
 * `mark` may be JSON text or an already materialized JSON value. The function is
 * total over host input: failed parsing or invalid manifest shape returns an
 * admission failure record rather than throwing.
 */
export function validatePackageManifest(mark, source = "package.json") {
  let value;
  try {
    value = readHostMark(mark);
  } catch (error) {
    return validationFailure(source, error instanceof Error ? error.message : "unreadable host mark");
  }

  if (!isJsonRecord(value)) return validationFailure(source, "package manifest must be a JSON object");
  if (manifestName(value) === undefined) return validationFailure(source, "package manifest requires a non-empty name");

  try {
    return packageManifestValidationValidator.assert({
      kind: "metroplat.admission.package-manifest",
      source,
      manifest: value,
    }, "package manifest admission");
  } catch (error) {
    return validationFailure(source, error instanceof Error ? error.message : "invalid package manifest admission");
  }
}

/** Admit a package manifest or throw with the carried failure reason. */
export function requirePackageManifest(mark, source = "package.json") {
  const validated = validatePackageManifest(mark, source);
  if (validated.kind === "metroplat.admission.failure") throw new TypeError(`${source}: ${validated.reason}`);
  return validated;
}
