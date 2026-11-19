import { posix as path } from "node:path";
import { parseJavaScript, walkJavaScript, bindJavaScript } from "@red-cup-engineering/javascript-parser-service";
import { readJavaScriptModuleRequestSites } from "@red-cup-engineering/javascript-parser-service/module-reference-sites";

function packagePath(value, label) {
  if (typeof value !== "string" || !value || value.includes("\\") || path.isAbsolute(value)) throw new TypeError(`${label} must be package-relative`);
  const normalized = path.normalize(value);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) throw new TypeError(`${label} must stay within the package`);
  return normalized;
}

const literal = node => node?.type === "Literal" && typeof node.value === "string";
const importMetaUrl = node => node?.type === "MemberExpression" && !node.computed
  && node.property.name === "url" && node.object.type === "MetaProperty"
  && node.object.meta.name === "import" && node.object.property.name === "meta";

/**
 * Project relative references when authored operation files move within a package.
 * Only caller-supplied file mappings participate; no files, package exports or
 * dependency targets are discovered. Source-derived spans are applied atomically
 * to this exact text, never accepted as a reusable or arbitrary edit plan.
 * Static import/re-export, literal dynamic import, global require, canonical
 * named createRequire const same-source loaders, and global
 * new URL(..., import.meta.url) references are recognized. Comment import("...")
 * type references retain their surrounding bytes. Computed requests, bare
 * dependencies, shadowed callables and ordinary strings are not rewritten.
 */
export function projectJsnodeModuleReferences(text, sourcePath, files) {
  if (typeof text !== "string") throw new TypeError("source text must be a string");
  const originalPath = packagePath(sourcePath, "sourcePath");
  if (!Array.isArray(files)) throw new TypeError("file mappings must be an array");
  const targets = new Map();
  for (const file of files) {
    const from = packagePath(file?.from, "mapping.from");
    const to = packagePath(file?.to, "mapping.to");
    if (targets.has(from)) throw new TypeError(`duplicate file mapping ${from}`);
    targets.set(from, to);
  }
  const outputPath = targets.get(originalPath) ?? originalPath;
  const program = parseJavaScript(text);
  const { references } = bindJavaScript(program);
  const requests = readJavaScriptModuleRequestSites(program).filter(site => site.specifier !== null)
    .map(site => ({ value: site.specifier, start: site.start, end: site.end }));
  const add = node => { if (literal(node)) requests.push(node); };
  walkJavaScript(program, node => {
    if (node.type === "NewExpression" && node.callee.type === "Identifier"
      && node.callee.name === "URL" && references.get(node.callee) === null
      && importMetaUrl(node.arguments[1])) add(node.arguments[0]);
  });
  for (const comment of program.comments) {
    for (const match of comment.value.matchAll(/\bimport\(\s*((?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'))\s*\)/gu)) {
      let node;
      try { node = parseJavaScript(`import(${match[1]})`).body[0].expression.source; }
      catch (error) { if (error instanceof SyntaxError) continue; throw error; }
      const start = comment.start + 2 + match.index + match[0].indexOf(match[1]);
      requests.push({ value: node.value, start, end: start + match[1].length });
    }
  }
  const edits = requests.flatMap(request => {
    const marker = request.value.search(/[?#]/u);
    const pathname = marker < 0 ? request.value : request.value.slice(0, marker);
    const suffix = marker < 0 ? "" : request.value.slice(marker);
    if (!pathname.startsWith("./") && !pathname.startsWith("../")) return [];
    const resolved = path.normalize(path.join(path.dirname(originalPath), pathname));
    const target = targets.get(resolved) ?? resolved;
    const relative = path.relative(path.dirname(outputPath), target);
    const replacement = `${relative === ".." || relative.startsWith("../") ? relative : `./${relative}`}${suffix}`;
    if (replacement === request.value) return [];
    const quote = text[request.start];
    if (quote !== '"' && quote !== "'") throw new Error("parser module request is not a quoted literal");
    const escaped = replacement.replaceAll("\\", "\\\\").replaceAll(quote, `\\${quote}`).replaceAll("\n", "\\n").replaceAll("\r", "\\r");
    return [{ start: request.start, end: request.end, text: `${quote}${escaped}${quote}` }];
  }).sort((a, b) => a.start - b.start);
  let cursor = 0, output = "";
  for (const edit of edits) {
    if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end) || edit.start < cursor || edit.end <= edit.start || edit.end > text.length) throw new Error("parser returned overlapping or invalid module-reference spans");
    output += text.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  return output + text.slice(cursor);
}
