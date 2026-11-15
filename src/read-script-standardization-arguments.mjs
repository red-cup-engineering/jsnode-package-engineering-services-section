import { parseJavaScript, jsdocOf, walkJavaScript, bindJavaScript } from '@red-cup-engineering/javascript-parser-service';
import { readJavascriptFileExportDocumentation } from '@red-cup-engineering/read-javascript-file-export-documentation-service';

/** Read the existing standardizer's bounded source projection, not a general
 * operation or syntax API. Unrepresented statements remain explicit residue,
 * so the application cannot discard them when applying its current rule. */
export function readScriptStandardizationArguments({ path, text, inputSchema = null, outputSchema = null }) {
  if (typeof path !== 'string' || !/^(?:scripts|src)\/[a-z][a-z0-9-]*\.mjs$/u.test(path)) throw new TypeError('standardization requires a flat scripts/ or src/ .mjs path');
  if (typeof text !== 'string') throw new TypeError('standardization source must be text');
  const program = parseJavaScript(text);
  const exports = program.body.filter(node => node.type.startsWith('Export'));
  const functions = exports.filter(node => node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration' && node.declaration.id);
  const selected = functions.length === 1 ? functions[0] : null;
  const name = selected?.declaration.id.name ?? null;
  const documentation = name === null ? null : readJavascriptFileExportDocumentation({ type:'TextFileRead', path, text }).find(record => record.name === name);
  const imports = program.body.filter(node => node.type === 'ImportDeclaration').map(node => {
    const record = { source:node.source.value };
    const bindings = [];
    for (const specifier of node.specifiers) {
      if (specifier.type === 'ImportDefaultSpecifier') record.default = specifier.local.name;
      else if (specifier.type === 'ImportNamespaceSpecifier') record.namespace = specifier.local.name;
      else bindings.push({ imported:specifier.imported.name ?? specifier.imported.value, local:specifier.local.name });
    }
    if (bindings.length) { record.names = bindings.map(item => item.local); record.bindings = bindings; }
    // The source spelling retains import attributes, evaluation order and aliases.
    record.text = text.slice(node.start,node.end);
    return record;
  });
  const mainGuard = node => node.type === 'IfStatement' && node.test.type === 'MemberExpression' && !node.test.computed
    && node.test.property.name === 'main' && node.test.object.type === 'MetaProperty'
    && node.test.object.meta.name === 'import' && node.test.object.property.name === 'meta';
  const guards = program.body.filter(mainGuard);
  const residueNodes = program.body.filter(node => node.type !== 'ImportDeclaration' && node !== selected && !mainGuard(node));
  // Multiple guards are not the single command face supported by this app.
  if (guards.length > 1) residueNodes.push(...guards.slice(1));
  const { references } = bindJavaScript(program);
  let readsStdin = false, writesStdout = false;
  // Eligibility belongs to the selected command guard, not the operation body.
  if (guards[0]) walkJavaScript(guards[0], node => {
    if (node.type !== 'MemberExpression' || node.computed || node.object.type !== 'Identifier' || node.object.name !== 'process' || references.get(node.object) !== null) return;
    if (node.property.name === 'stdin') readsStdin = true;
    if (node.property.name === 'stdout') writesStdout = true;
  });
  const block = selected && (jsdocOf(program, selected) ?? jsdocOf(program, selected.declaration));
  const shebangText = text.startsWith('#!') ? text.slice(0,text.indexOf('\n') < 0 ? text.length : text.indexOf('\n')) : null;
  return {
    type:'JsnodeOperationArguments', version:1, path, exportName:name, exportCount:exports.length,
    description:documentation?.description ?? '', params:documentation?.parameters ?? [], returns:documentation?.returns ?? null, throws:documentation?.throws ?? [],
    imports, bodyText:selected ? text.slice(block?.start ?? selected.start,selected.end) : '',
    isAsync:selected?.declaration.async ?? false, inputSchema, outputSchema,
    residue:residueNodes.map(node => text.slice(node.start,node.end)), residueStatements:residueNodes.map(node => text.slice(node.start,node.end)),
    hasMainGuard:guards.length > 0, mainGuardText:guards[0] ? text.slice(guards[0].start,guards[0].end) : null,
    readsStdin, writesStdout, shebang:shebangText !== null, shebangText,
  };
}
