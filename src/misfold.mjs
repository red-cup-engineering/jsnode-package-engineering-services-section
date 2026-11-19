/**
 * Misfold detection for a derived JSNode module (stage 10 of the fabrication line, read at
 * derivation so the line refuses the misfold before it is born).
 *
 * Lenticule Science, 2026-07-24 "The Union EVM chain as a folding protein", section 5: "A misfold is
 * a wrapper, certificate, or subsystem deposited beside the territory instead of folded from the
 * proof." The fabrication line's high-level design (2026-10-10, section 4) reads it for code: a
 * module that re-exports or wraps a capability a declared dependency already exports adds nothing
 * the order needed; the order should use the dependency, or thicken it.
 *
 * Three shapes are read from the module's ESTree, on an operation's export only:
 * - re-export: `export { x as op } from "dep"` or `export * from "dep"`;
 * - alias: `export const op = x` where `x` is imported from a dependency;
 * - delegation: `export (async) function op(a, b) { return (await) x(a, b); }`, the body one return
 *   of a call to a dependency import with the operation's own parameters, in order.
 * A relative import is the package's own territory and never a misfold.
 */
import { parseJavaScript, bindJavaScript } from "@red-cup-engineering/javascript-parser-service";

const isDependency = (specifier) => typeof specifier === "string" && !specifier.startsWith(".") && !specifier.startsWith("/") && !specifier.startsWith("node:");

/** Local names bound by imports from dependencies, each with its module request. */
function dependencyBindings(program, references) {
  const bindings = new Map();
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration" || !isDependency(statement.source.value)) continue;
    for (const specifier of statement.specifiers) bindings.set(references.get(specifier.local), statement.source.value);
  }
  return bindings;
}

const unwrapAwait = (node) => (node?.type === "AwaitExpression" ? node.argument : node);

/** Whether a function only forwards its own parameters, in order, to one dependency binding. */
function delegatedTo(fn, bindings, references) {
  const body = fn.body;
  let returned;
  if (body.type !== "BlockStatement") returned = body;
  else if (body.body.length === 1 && body.body[0].type === "ReturnStatement") returned = body.body[0].argument;
  else return undefined;
  const call = unwrapAwait(returned);
  if (call?.type !== "CallExpression" || call.callee.type !== "Identifier" || !bindings.has(references.get(call.callee))) return undefined;
  const params = fn.params.map((param) => (param.type === "Identifier" ? param.name : null));
  const args = call.arguments.map((arg) => (arg.type === "Identifier" ? arg.name : null));
  if (params.includes(null) || args.includes(null) || params.length !== args.length || params.some((name, i) => name !== args[i])) return undefined;
  return bindings.get(references.get(call.callee));
}

/** The misfolds among a module's exports of `exportNames`: `[{ export, kind, dependency }]`. */
export function misfoldsOfModule(text, fileName, exportNames) {
  if (typeof text !== "string") throw new TypeError("source text must be a string");
  if (typeof fileName !== "string" || fileName.length === 0) throw new TypeError("fileName must be a nonempty string");
  if (/\.(?:[cm]?tsx?|jsx)$/iu.test(fileName)) throw new SyntaxError(`${fileName}: TypeScript and JSX are not JavaScript`);
  let program;
  try {
    // JSON has no module exports. Preserve admission rather than treating data as JS.
    if (/\.json$/iu.test(fileName)) { JSON.parse(text); return Object.freeze([]); }
    program = parseJavaScript(text);
  } catch (error) {
    if (error instanceof SyntaxError) error.message = `${fileName}: ${error.message}`;
    throw error;
  }
  const { references } = bindJavaScript(program);
  const bindings = dependencyBindings(program, references);
  const wanted = new Set(exportNames);
  const found = [];
  for (const statement of program.body) {
    if (statement.type === "ExportAllDeclaration" && isDependency(statement.source?.value)) {
      found.push({ export: "*", kind: "re-export", dependency: statement.source.value });
    }
    if (statement.type !== "ExportNamedDeclaration") continue;
    if (statement.source && isDependency(statement.source.value)) {
      for (const specifier of statement.specifiers) {
        const name = specifier.exported.name ?? specifier.exported.value;
        if (wanted.has(name)) found.push({ export: name, kind: "re-export", dependency: statement.source.value });
      }
      continue;
    }
    for (const specifier of statement.specifiers ?? []) {
      const name = specifier.exported.name ?? specifier.exported.value;
      if (wanted.has(name) && bindings.has(references.get(specifier.local))) found.push({ export: name, kind: "alias", dependency: bindings.get(references.get(specifier.local)) });
    }
    const declaration = statement.declaration;
    if (declaration?.type === "FunctionDeclaration" && wanted.has(declaration.id.name)) {
      const dependency = delegatedTo(declaration, bindings, references);
      if (dependency !== undefined) found.push({ export: declaration.id.name, kind: "delegation", dependency });
    }
    if (declaration?.type === "VariableDeclaration") {
      for (const declarator of declaration.declarations) {
        if (declarator.id.type !== "Identifier" || !wanted.has(declarator.id.name)) continue;
        const init = declarator.init;
        if (init?.type === "Identifier" && bindings.has(references.get(init))) found.push({ export: declarator.id.name, kind: "alias", dependency: bindings.get(references.get(init)) });
        else if (["ArrowFunctionExpression", "FunctionExpression"].includes(init?.type)) {
          const dependency = delegatedTo(init, bindings, references);
          if (dependency !== undefined) found.push({ export: declarator.id.name, kind: "delegation", dependency });
        }
      }
    }
  }
  return Object.freeze(found.map((item) => Object.freeze(item)));
}

/** A refusal reason for a module's misfolds, or undefined when it folded. */
export function misfoldRefusal(misfolds) {
  if (misfolds.length === 0) return undefined;
  return "misfold: " + misfolds.map((item) => `${item.export} is a ${item.kind} of ${item.dependency}, deposited beside the capability it should use`).join("; ");
}
