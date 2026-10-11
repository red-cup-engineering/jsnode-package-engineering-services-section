/**
 * @packageDocumentation
 *
 * exports/resolve - a package's `exports` map read the way Node resolves it, with no file access.
 *
 * `exportSubpaths` lists the subpaths a map declares; `resolveExportSubpath` answers which file
 * one requested subpath reaches under a condition set (exact keys first, then the longest `*`
 * pattern prefix, then longest suffix; condition objects in key order; arrays try each
 * non-null match; direct `null` excludes); and
 * `exportTargets` lists every file target a map can name, under any condition, so a checker can
 * confirm each exists.
 */

/** The conditions a house ESM import resolves under. */
export const IMPORT_CONDITIONS = Object.freeze(["node", "import", "default"]);

const isConditionObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** A map normalized to subpath keys: a string, array or condition object stands for ".". */
function subpathMap(exportsValue) {
  if (exportsValue === undefined || exportsValue === null) return {};
  if (typeof exportsValue === "string" || Array.isArray(exportsValue)) return { ".": exportsValue };
  if (!isConditionObject(exportsValue)) return {};
  const keys = Object.keys(exportsValue);
  return keys.length > 0 && keys.every((key) => !key.startsWith(".")) ? { ".": exportsValue } : exportsValue;
}

/**
 * The subpaths an `exports` map declares, each with whether it is a `*` pattern.
 * @param {unknown} exportsValue the manifest's `exports` field
 * @returns {ReadonlyArray<{ subpath: string, pattern: boolean }>}
 */
export function exportSubpaths(exportsValue) {
  return Object.freeze(Object.keys(subpathMap(exportsValue))
    .filter((key) => key === "." || key.startsWith("./"))
    .map((subpath) => Object.freeze({ subpath, pattern: subpath.includes("*") })));
}

/** The target a value reaches under CONDITIONS: a string, null (excluded) or undefined (no match). */
function targetOf(value, conditions, replacement) {
  if (typeof value === "string") return replacement === undefined ? value : value.replaceAll("*", replacement);
  if (value === null) return null;
  if (Array.isArray(value)) {
    // PACKAGE_TARGET_RESOLVE skips null within arrays, but preserves an all-null
    // (or empty) array as an exclusion. A null condition outside an array stops.
    let last = value.length === 0 ? null : undefined;
    for (const item of value) {
      const target = targetOf(item, conditions, replacement);
      if (target === undefined) continue;
      if (target === null) { last = null; continue; }
      return target;
    }
    return last;
  }
  if (isConditionObject(value)) {
    for (const [condition, nested] of Object.entries(value)) {
      if (condition !== "default" && !conditions.includes(condition)) continue;
      const target = targetOf(nested, conditions, replacement);
      if (target !== undefined) return target;
    }
  }
  return undefined;
}

/**
 * Resolve one requested subpath ("." or "./x") against an `exports` map.
 * @param {unknown} exportsValue the manifest's `exports` field
 * @param {string} subpath the requested subpath
 * @param {ReadonlyArray<string>} [conditions] the active conditions
 * @returns {{ status: "exported", key: string, target: string } | { status: "excluded", key: string } | { status: "unexported" }}
 */
export function resolveExportSubpath(exportsValue, subpath, conditions = IMPORT_CONDITIONS) {
  const map = subpathMap(exportsValue);
  let key, replacement;
  if (Object.hasOwn(map, subpath) && !subpath.includes("*") && !subpath.endsWith("/")) key = subpath;
  else {
    let bestPrefix = -1, bestLength = -1;
    for (const candidate of Object.keys(map)) {
      const star = candidate.indexOf("*");
      if (star < 0 || candidate.indexOf("*", star + 1) >= 0) continue;
      const prefix = candidate.slice(0, star), suffix = candidate.slice(star + 1);
      if (subpath.length >= candidate.length && subpath.startsWith(prefix) && subpath.endsWith(suffix) &&
          (prefix.length > bestPrefix || (prefix.length === bestPrefix && candidate.length > bestLength))) {
        bestPrefix = prefix.length;
        bestLength = candidate.length;
        key = candidate;
        replacement = subpath.slice(prefix.length, subpath.length - suffix.length);
      }
    }
  }
  if (key === undefined) return Object.freeze({ status: "unexported" });
  const target = targetOf(map[key], conditions, replacement);
  if (target === null) return Object.freeze({ status: "excluded", key });
  if (target === undefined) return Object.freeze({ status: "unexported" });
  return Object.freeze({ status: "exported", key, target });
}

/**
 * Every file target an `exports` map names under any condition, with the subpath and condition
 * path that names it. Pattern targets keep their `*`.
 * @param {unknown} exportsValue the manifest's `exports` field
 * @returns {ReadonlyArray<{ subpath: string, conditions: ReadonlyArray<string>, target: string }>}
 */
export function exportTargets(exportsValue) {
  const found = [];
  const walk = (subpath, value, conditions) => {
    if (typeof value === "string") found.push(Object.freeze({ subpath, conditions: Object.freeze([...conditions]), target: value }));
    else if (Array.isArray(value)) for (const item of value) walk(subpath, item, conditions);
    else if (isConditionObject(value)) for (const [condition, nested] of Object.entries(value)) walk(subpath, nested, [...conditions, condition]);
  };
  for (const [subpath, value] of Object.entries(subpathMap(exportsValue))) walk(subpath, value, []);
  return Object.freeze(found);
}
