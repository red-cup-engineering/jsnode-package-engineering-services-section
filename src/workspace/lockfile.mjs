/**
 * @packageDocumentation
 *
 * admission/lockfile - package-phase pnpm-lock.yaml admission.
 *
 * Reads a host mark already supplied as pnpm-lock.yaml text and either admits
 * its `importers:` subtree as an admission record or returns a carried failure.
 * Discovering the lockfile on disk stays in services.
 */
import { decodePnpmLockfileImporters } from "./pnpm-lockfile.mjs";
import {
  validationFailureValidator,
  pnpmLockfileValidationValidator,

} from "./schemas/admission.mjs";

function lockfileValidationFailure(source, reason) {
  return validationFailureValidator.assert({
    kind: "metroplat.admission.failure",
    source,
    reason,
  }, "pnpm lockfile admission failure");
}

/**
 * Admit a `pnpm-lock.yaml` host mark. `mark` is the lockfile text. Total over
 * host input: a document outside the codec's accepted `importers:` shape
 * returns an admission failure record rather than throwing.
 */
export function validatePnpmLockfile(mark, source = "pnpm-lock.yaml") {
  let decoded;
  try {
    decoded = decodePnpmLockfileImporters(mark);
  } catch (error) {
    return lockfileValidationFailure(source, error instanceof Error ? error.message : "unreadable pnpm lockfile");
  }

  try {
    return pnpmLockfileValidationValidator.assert({
      kind: "metroplat.admission.pnpm-lockfile",
      source,
      lockfileVersion: decoded.lockfileVersion,
      importers: decoded.importers,
    }, "pnpm lockfile admission");
  } catch (error) {
    return lockfileValidationFailure(source, error instanceof Error ? error.message : "invalid pnpm lockfile admission");
  }
}

/** Admit a pnpm lockfile or throw with the carried failure reason. */
export function requirePnpmLockfile(mark, source = "pnpm-lock.yaml") {
  const validated = validatePnpmLockfile(mark, source);
  if (validated.kind === "metroplat.admission.failure") throw new TypeError(`${source}: ${validated.reason}`);
  return validated;
}
