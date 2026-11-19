/**
 * codecs/text/pnpm-lockfile — the `importers:` subtree of a pnpm-lock.yaml v9
 * document, decoded to a normal form.
 *
 * A pnpm lockfile's `packages:`/`snapshots:` registry-resolution sections use
 * flow-map keys, parenthesized peer-resolution suffixes, and content hashes —
 * a wire shape well outside `codecs/text/yaml`'s frontmatter subset. This
 * codec accepts only the bounded, regular shape of the `importers:` subtree
 * (workspace-relative importer keys, each with `dependencies`/
 * `devDependencies`/`optionalDependencies` maps of `{specifier, version}`)
 * and rejects a document that lacks it. Pure string -> value; TypeError is
 * the only failure mode, same discipline as `codecs/text/yaml`.
 */

const DEPENDENCY_FIELDS = Object.freeze(["dependencies", "devDependencies", "optionalDependencies"]);

function indentOf(line) {
  return line.length - line.trimStart().length;
}

function isBlank(line) {
  return line !== undefined && line.trim() === "";
}

function unquoteKey(token) {
  if (token.startsWith("'") && token.endsWith("'") && token.length >= 2) return token.slice(1, -1);
  if (token.startsWith('"') && token.endsWith('"') && token.length >= 2) return token.slice(1, -1);
  return token;
}

/** Split a `key: rest` or bare `key:` line into its key and remaining text,
 *  honoring a single- or double-quoted key. Returns null when the line is not
 *  a key line at all. */
function splitKeyLine(body) {
  if (body.startsWith("'") || body.startsWith('"')) {
    const quote = body[0];
    const close = body.indexOf(quote, 1);
    if (close === -1) return null;
    const after = body.slice(close + 1);
    if (!after.startsWith(":")) return null;
    return { key: unquoteKey(body.slice(0, close + 1)), rest: after.slice(1) };
  }
  const colon = body.indexOf(":");
  if (colon === -1) return null;
  return { key: body.slice(0, colon), rest: body.slice(colon + 1) };
}

function requireLockfileVersion(lines) {
  const line = lines.find((candidate) => candidate.startsWith("lockfileVersion:"));
  if (line === undefined) throw new TypeError("pnpm-lockfile: missing lockfileVersion — not a pnpm-lock.yaml document");
  return unquoteKey(line.slice("lockfileVersion:".length).trim());
}

function dependencyBlock(lines, cursor, indent, field, strict) {
  const uses = [];
  const seen = new Set();
  for (;;) {
    const line = lines[cursor.pos];
    if (isBlank(line)) { cursor.pos += 1; continue; }
    if (line === undefined || indentOf(line) < indent) break;
    if (indentOf(line) !== indent) {
      if (strict) throw new TypeError("pnpm-lockfile: unsupported dependency indentation");
      break;
    }
    const split = splitKeyLine(line.slice(indent));
    if (split === null || (strict && split.rest.trim() !== "")) {
      if (strict) throw new TypeError("pnpm-lockfile: unsupported dependency entry");
      break;
    }
    if (!split.key || seen.has(split.key))
      throw new TypeError("pnpm-lockfile: duplicated or unnamed dependency in " + field);
    seen.add(split.key);
    cursor.pos += 1;
    let specifier = "";
    let version = "";
    while (indentOf(lines[cursor.pos] ?? "") > indent || isBlank(lines[cursor.pos])) {
      const detailLine = lines[cursor.pos];
      if (isBlank(detailLine)) { cursor.pos += 1; continue; }
      if (detailLine === undefined) break;
      const detail = splitKeyLine(detailLine.trim());
      if (strict && (indentOf(detailLine) !== indent + 2 || !detail ||
          !["specifier", "version"].includes(detail.key) ||
          (detail.key === "specifier" && specifier) || (detail.key === "version" && version)))
        throw new TypeError("pnpm-lockfile: unsupported or repeated dependency detail");
      if (detail?.key === "specifier") {
        specifier = detail.rest.trim();
        if (strict && !literalSpecifier(unquoteKey(specifier)))
          throw new TypeError("pnpm-lockfile: unsupported dependency scalar");
      }
      else if (detail?.key === "version") version = detail.rest.trim();
      cursor.pos += 1;
    }
    if (!specifier || !version)
      throw new TypeError("pnpm-lockfile: dependency lacks specifier or selected version");
    uses.push(Object.freeze({
      name: split.key,
      field,
      specifier,
      version,
      workspaceLink: version.startsWith("link:"),
    }));
  }
  return Object.freeze(uses);
}

function importerDependencies(lines, cursor, importerIndent, strict) {
  const fieldIndent = importerIndent + 2;
  const uses = [];
  const seenFields = new Set();
  for (;;) {
    const line = lines[cursor.pos];
    if (isBlank(line)) { cursor.pos += 1; continue; }
    if (line === undefined || indentOf(line) < fieldIndent) break;
    if (indentOf(line) !== fieldIndent) {
      if (strict) throw new TypeError("pnpm-lockfile: unsupported importer indentation");
      break;
    }
    const key = line.slice(fieldIndent).replace(/:\s*$/u, "");
    if (!DEPENDENCY_FIELDS.includes(key) || (strict && seenFields.has(key))) {
      if (strict) throw new TypeError("pnpm-lockfile: unsupported or repeated importer field");
      break;
    }
    seenFields.add(key);
    cursor.pos += 1;
    uses.push(...dependencyBlock(lines, cursor, fieldIndent + 2, key, strict));
  }
  return Object.freeze(uses);
}

/** Decode the `importers:` subtree of a pnpm-lock.yaml v9 document. Throws
 *  when the document has no `lockfileVersion` or `importers:` root key — the
 *  representation this codec witnesses as membership. */
export function decodePnpmLockfileImporters(text, { strict = false } = {}) {
  if (typeof text !== "string") throw new TypeError("pnpm-lockfile: document must be a string");
  const lines = text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  const lockfileVersion = requireLockfileVersion(lines);
  if (strict && lines.filter(line => line.startsWith("lockfileVersion:")).length !== 1)
    throw new TypeError("pnpm-lockfile: repeated lockfile version");

  const importersLineIndex = lines.findIndex((line) => line === "importers:");
  if (importersLineIndex === -1) throw new TypeError("pnpm-lockfile: missing importers: root key");
  if (lines.filter(line => line === "importers:").length !== 1)
    throw new TypeError("pnpm-lockfile: duplicate importers root keys");

  const cursor = { pos: importersLineIndex + 1 };
  const importers = [];
  const seenImporters = new Set();
  const importerIndent = 2;
  for (;;) {
    const line = lines[cursor.pos];
    if (isBlank(line)) { cursor.pos += 1; continue; }
    if (line === undefined || indentOf(line) === 0) break;
    const split = indentOf(line) === importerIndent ? splitKeyLine(line.slice(importerIndent)) : null;
    if (split === null || (strict && !["", "{}"].includes(split.rest.trim()))) {
      if (strict) throw new TypeError("pnpm-lockfile: unsupported importer entry");
      break;
    }
    if (!split.key || seenImporters.has(split.key))
      throw new TypeError("pnpm-lockfile: duplicate or unnamed importer");
    seenImporters.add(split.key);
    cursor.pos += 1;
    const dependencies = split.rest.trim() === "{}" ? Object.freeze([]) : importerDependencies(lines, cursor, importerIndent, strict);
    importers.push(Object.freeze({ path: split.key, dependencies }));
  }

  return Object.freeze({ lockfileVersion, importers: Object.freeze(importers) });
}

/**
 * Compare a manifest's declared specifiers with a selected v9 importer.
 * This preflight does not check resolution, integrity or artifact availability.
 */
const literalSpecifier = value => typeof value === "string" && /^[a-zA-Z0-9*^~.<>=| +_-]{1,160}$/u.test(value);
const requireUniqueNames = (dependencies) => {
  if (new Set(dependencies).size !== dependencies.length)
    throw new TypeError("pnpm-lockfile: declaration shadowing requires native policy");
};

// A selected registry version may be displayed as a bounded literal. Full
// pnpm locators (links, peer suffixes, or URLs) are not release identities.
const displayableSelection = value => /^\d+(?:\.\d+){2}(?:[-+][A-Za-z0-9.+-]+)?$/u.test(value) && value.length <= 160;

export function comparePnpmImporterManifest(text, manifest, path = ".", { includeSelection = false } = {}) {
  const lock = decodePnpmLockfileImporters(text, { strict: true });
  if (lock.lockfileVersion !== "9.0") throw new TypeError("pnpm-lockfile: manifest preflight requires version 9.0");
  const importer = lock.importers.find(entry => entry.path === path);
  if (importer === undefined) throw new TypeError("pnpm-lockfile: missing importer " + path);
  const dependencyKey = ({ field, name }) => JSON.stringify([field, name]);
  requireUniqueNames(importer.dependencies.map(entry => entry.name));
  requireUniqueNames(DEPENDENCY_FIELDS.flatMap(field => Object.keys(manifest[field] ?? {})));
  const locked = new Map(importer.dependencies.map(entry => [dependencyKey(entry), entry]));
  const differences = [];
  const difference = (kind, field, name, declaredSpecifier, entry) => {
    const result = { kind, field, name };
    if (includeSelection) {
      const selection = unquoteKey(entry?.version ?? "");
      Object.assign(result, {
        declaredSpecifier: literalSpecifier(declaredSpecifier) ? declaredSpecifier : null,
        lockedSpecifier: entry ? unquoteKey(entry.specifier) : null,
        lockedVersion: displayableSelection(selection) ? selection : null,
      });
    }
    return result;
  };
  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, specifier] of Object.entries(manifest[field] ?? {})) {
      const key = dependencyKey({ field, name });
      const entry = locked.get(key);
      locked.delete(key);
      if (entry === undefined) differences.push(difference("manifest-only", field, name, specifier, null));
      else if (unquoteKey(entry.specifier) !== specifier) differences.push(difference("specifier-mismatch", field, name, specifier, entry));
    }
  }
  for (const entry of locked.values()) differences.push(difference("lock-only", entry.field, entry.name, null, entry));
  return differences;
}

/** A top-level section's entries (two-space-indented keys), each with the lines it spans. */
function sectionEntries(lines, start) {
  const entries = new Map();
  const lead = [];
  let key;
  let end = start;
  for (; end < lines.length && (isBlank(lines[end]) || indentOf(lines[end]) > 0); end += 1) {
    const line = lines[end];
    if (!isBlank(line) && indentOf(line) === 2) {
      key = splitKeyLine(line.slice(2))?.key;
      if (key === undefined) throw new TypeError(`pnpm-lockfile: unreadable entry at line ${end + 1}`);
      entries.set(key, []);
    }
    (key === undefined ? lead : entries.get(key)).push(line);
  }
  return { lead, entries, end };
}

/** Each top-level section of the document, in order, with its entries. */
function sections(text) {
  const lines = text.split("\n");
  const parts = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (/^[^\s#][^:]*:\s*$/u.test(line)) {
      const { lead, entries, end } = sectionEntries(lines, index + 1);
      parts.push({ name: line.slice(0, -1).trim(), head: line, lead, entries });
      index = end;
    } else {
      parts.push({ text: line });
      index += 1;
    }
  }
  return parts;
}

/** Entries of `entries` with `key` set to `block`, a new key placed before the first greater one. */
function withEntry(entries, key, block) {
  if (entries.has(key) || [...entries.keys()].every((other) => other < key)) return new Map(entries).set(key, block);
  const placed = new Map();
  for (const [other, lines] of entries) {
    if (!placed.has(key) && other > key) placed.set(key, block);
    placed.set(other, lines);
  }
  return placed;
}

/**
 * The lockfile `base` with the named importers as `source` has them: the cut
 * of a shared workspace lockfile that one change owns. Every other importer
 * stays as `base` has it, whatever other writers have done to `source`; an
 * importer `source` no longer has is removed. `packages:` and `snapshots:`
 * entries `source` adds are carried, since a named importer may resolve them;
 * entries `source` dropped stay until a whole-lockfile install prunes them.
 */
export function cutPnpmLockfile(base, source, importers) {
  decodePnpmLockfileImporters(base);
  decodePnpmLockfileImporters(source);
  const from = new Map(sections(source).filter(({ name }) => name !== undefined).map((part) => [part.name, part.entries]));
  const parts = sections(base).map((part) => {
    if (part.name === "importers") {
      let entries = part.entries;
      for (const importer of importers) {
        const block = from.get("importers")?.get(importer);
        if (block) entries = withEntry(entries, importer, block);
        else { entries = new Map(entries); entries.delete(importer); }
      }
      return { ...part, entries };
    }
    if (part.name === "packages" || part.name === "snapshots") {
      let entries = part.entries;
      for (const [key, block] of from.get(part.name) ?? []) if (!entries.has(key)) entries = withEntry(entries, key, block);
      return { ...part, entries };
    }
    return part;
  });
  return parts.map((part) => (part.name === undefined ? part.text : [part.head, ...part.lead, ...[...part.entries.values()].flat()].join("\n"))).join("\n");
}

/**
 * Observe literal direct-declaration agreement at one exact PNPM v9 importer.
 * This early preflight is NOT PNPM frozen-install, resolution, integrity or
 * release admission. Policy-sensitive inputs are unchecked, not mismatches.
 * Native YAML parsing belongs to the declared YAML codec; the older bounded
 * decoder and source-cut operations do not load that supplier.
 * Diagnostics retain field/name addresses, never dependency values or YAML
 * errors that may contain credential-bearing URLs.
 */
export async function pnpmImporterManifestAgreement(manifest, lockText, importerPath = ".") {
  const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
  if (!record(manifest) || typeof lockText !== "string" || typeof importerPath !== "string" || !importerPath)
    throw new TypeError("pnpm agreement requires a manifest, lock text and exact importer key");
  const result = (ok, issues) => Object.freeze({
    kind: "pnpm-importer-manifest-agreement/v1", importerPath,
    scope: "literal-direct-declarations-only", ok,
    issues: Object.freeze(issues.map(issue => Object.freeze(issue))),
  });
  let lock;
  // Import failure remains a supplier failure; malformed source is a carried
  // unreadable result. Do not mistake either for a witnessed disagreement.
  const { decodeYaml } = await import("@red-cup-engineering/yaml-frontmatter-codec-service");
  try { lock = decodeYaml(lockText); }
  catch { return result(null, [{ reason: "unreadable-lockfile" }]); }
  if (!record(lock) || String(lock.lockfileVersion) !== "9.0" || !record(lock.importers))
    return result(null, [{ reason: "unsupported-lockfile-shape" }]);
  if (!Object.hasOwn(lock.importers, importerPath))
    return result(false, [{ reason: "missing-importer" }]);
  const importer = lock.importers[importerPath];
  if (!record(importer)) return result(null, [{ reason: "unreadable-importer" }]);
  // These can change PNPM's effective declarations. Leave their interpretation
  // to the native manager rather than rejecting a potentially valid graph.
  if (manifest.pnpm !== undefined || Object.keys(manifest.peerDependencies ?? {}).length ||
      lock.overrides !== undefined || lock.catalogs !== undefined ||
      lock.patchedDependencies !== undefined || lock.settings?.excludeLinksFromLockfile === true)
    return result(null, [{ reason: "requires-native-policy-check" }]);
  const expected = new Map(), recorded = new Map();
  for (const field of ["devDependencies", "dependencies", "optionalDependencies"]) {
    const declarations = manifest[field] ?? {}, entries = importer[field] ?? {};
    if (!record(declarations) || !record(entries)) return result(null, [{ field, reason: "invalid-dependency-field" }]);
    for (const [name, specification] of Object.entries(declarations)) {
      if (typeof specification !== "string") return result(null, [{ field, name, reason: "invalid-specifier" }]);
      // Git equivalence, catalog substitution and local/workspace selection
      // require the native manager. Do not invent a second specifier dialect.
      if (/^(?:git(?:\+|:)|github:|gitlab:|bitbucket:|https?:|ssh:|file:|link:|workspace:|catalog:)/u.test(specification) || specification.includes("/"))
        return result(null, [{ field, name, reason: "requires-native-specifier-check" }]);
      expected.set(name, { field, specification });
    }
    for (const [name, entry] of Object.entries(entries)) {
      if (!record(entry) || typeof entry.specifier !== "string" || typeof entry.version !== "string" || !entry.version)
        return result(null, [{ field, name, reason: "invalid-lock-dependency" }]);
      if (recorded.has(name)) return result(null, [{ field, name, reason: "duplicate-lock-dependency" }]);
      recorded.set(name, { field, specification: entry.specifier });
    }
  }
  const issues = [];
  for (const name of [...new Set([...expected.keys(), ...recorded.keys()])].sort()) {
    const wanted = expected.get(name), found = recorded.get(name);
    if (!wanted) issues.push({ name, field: found.field, reason: "extra-lock-dependency" });
    else if (!found) issues.push({ name, field: wanted.field, reason: "missing-lock-dependency" });
    else if (wanted.field !== found.field) issues.push({ name, field: wanted.field, recordedField: found.field, reason: "dependency-field-differs" });
    else if (wanted.specification !== found.specification) issues.push({ name, field: wanted.field, reason: "literal-specifier-differs" });
  }
  return result(issues.length === 0, issues);
}
