/**
 * The house packages a package's own code uses. The manifest generator, interface
 * checker and Guix design-rule reader share this classification.
 *
 * Real import/export, require, resolver and literal route nodes name suppliers.
 * Comments and generated source text are data; executable template/JSX expressions
 * are still traversed. Type-only imports remain dependency demand.
 *
 * This module has no imports. Its caller must explicitly supply the qualified
 * TypeScript 5.9.3 parser, including at the committed-source bootstrap boundary.
 * It never discovers an ambient workspace, acquires packages or falls back to text matching.
 */

/** House scopes governed by the original dependency-wiring rule. */
export const HOUSE_SCOPE = /^@(?:561-group|causeway-services|coesite-operations|emsenn|emsweb|harmonious-union|koios-news|lenticule-science|red-cup-engineering|red-cup-science|rsc-quiescent|turntide-islands|union-officer-academy)\//u;
/** Source languages admitted by this reader. */
export const CODE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const TEST_PATH = /(?:^|\/)(?:test|tests|__tests__|fixtures|examples)\//u;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const NOT_CODE_PATH = /(?:^|\/)(?:legacy|vendor|vendored|node_modules)\//u;
const RESOLVER_NAME = /^[\w$]*[Rr]esolve[\w$]*$/u;
const ROUTE = /^(@[a-z0-9][\w.-]*\/[a-z0-9][\w.-]*(?:\/[^'"\s:]*)?):[A-Za-z_$][\w$]*$/u;

/** The package named by a package/subpath specifier. */
export function packageNameOf(specifier) {
  const [scope, name] = String(specifier).split("/");
  return scope?.startsWith("@") && name ? `${scope}/${name}` : String(specifier).split("/")[0];
}

/** Whether a package-relative file is its own runtime or test code. */
export function codeRole(path) {
  if (!CODE_FILE.test(path) || NOT_CODE_PATH.test(path) || /\.d\.[cm]?ts$/u.test(path)) return null;
  return TEST_PATH.test(path) || TEST_FILE.test(path) ? "test" : "runtime";
}

/** Bind the original reader to an explicitly selected native parser resource. */
export function createPackageImportReader(typescript) {
  const ts = typescript;
  const methods = ["createSourceFile", "forEachChild", "isStringLiteralLike", "isIdentifier",
    "isPropertyAccessExpression", "isElementAccessExpression", "isImportDeclaration", "isExportDeclaration",
    "isImportEqualsDeclaration", "isExternalModuleReference", "isImportTypeNode", "isLiteralTypeNode",
    "isCallExpression", "flattenDiagnosticMessageText"];
  if (ts?.version !== "5.9.3" || methods.some(name => typeof ts[name] !== "function")
    || !Number.isInteger(ts.ScriptTarget?.ES2024) || !Number.isInteger(ts.SyntaxKind?.ImportKeyword)
    || ["JS", "JSX", "TS", "TSX"].some(name => !Number.isInteger(ts.ScriptKind?.[name]))) {
    throw new TypeError("package import reading requires an explicitly qualified TypeScript 5.9.3 parser");
  }
  const stringOf = node => node && ts.isStringLiteralLike(node) ? node.text : null;
  const calledName = node => {
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isPropertyAccessExpression(node)) return node.name.text;
    if (ts.isElementAccessExpression(node)) return stringOf(node.argumentExpression);
    return null;
  };
  const scriptKindOf = fileName => /\.tsx$/u.test(fileName) ? ts.ScriptKind.TSX
    : /\.jsx$/u.test(fileName) ? ts.ScriptKind.JSX
      : /\.[cm]?ts$/u.test(fileName) ? ts.ScriptKind.TS : ts.ScriptKind.JS;

  /** Sorted, distinct house specifiers in one syntactically admitted module. */
  function houseSpecifiersOfText(text, { fileName = "module.js" } = {}) {
    if (typeof text !== "string" || typeof fileName !== "string" || !CODE_FILE.test(fileName)) {
      throw new TypeError("source text and a supported JS/TS/JSX filename are required");
    }
    const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2024, true, scriptKindOf(fileName));
    if (source.parseDiagnostics.length) {
      const diagnostic = source.parseDiagnostics[0];
      const position = source.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      throw new SyntaxError(`${fileName}:${position.line + 1}:${position.character + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`);
    }
    const found = new Set();
    const add = value => { if (typeof value === "string" && HOUSE_SCOPE.test(value)) found.add(value); };
    const visit = node => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(stringOf(node.moduleSpecifier));
      if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        add(stringOf(node.moduleReference.expression));
      }
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(stringOf(node.argument.literal));
      if (ts.isCallExpression(node)) {
        const name = calledName(node.expression);
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword || name === "require" || name === "getBuiltinModule"
          || typeof name === "string" && RESOLVER_NAME.test(name)) add(stringOf(node.arguments[0]));
      }
      const value = stringOf(node), route = value === null ? null : ROUTE.exec(value);
      if (route) add(route[1]);
      ts.forEachChild(node, visit);
    };
    visit(source);
    return [...found].sort();
  }

  /** Original runtime/test package ownership over package-relative source files. */
  function importsOfFiles(files, { nestedRoots = [] } = {}) {
    const runtime = new Map(), test = new Map();
    const nested = nestedRoots.filter(root => root && root !== ".");
    for (const { path, text } of files) {
      if (nested.some(root => path === root || path.startsWith(`${root}/`))) continue;
      const role = codeRole(path);
      if (!role) continue;
      for (const specifier of houseSpecifiersOfText(text, { fileName: path })) {
        const into = role === "runtime" ? runtime : test, name = packageNameOf(specifier);
        if (!into.has(name)) into.set(name, new Set());
        into.get(name).add(path);
      }
    }
    for (const name of runtime.keys()) test.delete(name);
    const sorted = map => new Map([...map].sort(([a], [b]) => a.localeCompare(b)).map(([name, paths]) => [name, [...paths].sort()]));
    return Object.freeze({ runtime: sorted(runtime), test: sorted(test) });
  }
  return Object.freeze({ houseSpecifiersOfText, importsOfFiles });
}

/** Existing direct entrypoint, with explicit parser selection rather than ambient loading. */
export function houseSpecifiersOfText(text, { typescript, ...options } = {}) {
  return createPackageImportReader(typescript).houseSpecifiersOfText(text, options);
}

/** Existing direct entrypoint, with explicit parser selection rather than ambient loading. */
export function importsOfFiles(files, { typescript, ...options } = {}) {
  return createPackageImportReader(typescript).importsOfFiles(files, options);
}
