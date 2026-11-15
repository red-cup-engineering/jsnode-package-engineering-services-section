# Authored package module-reference projection

The package specification admits authored operation modules and behavioral tests.
When its existing legacy-operation normalization moves `scripts/name.mjs` to
`src/name.mjs`, source-local references must continue to denote the same supplied
targets. This is package fabrication, not publication or general source editing.

The private `projectJsnodeModuleReferences` receives source text, its original
package-relative path and explicit from/to file mappings. It returns projected
text atomically. It reads no filesystem, executes no supplied code, discovers no
packages and accepts no persisted edit plan. Invalid/escaping/duplicate source
mappings refuse. There is no independently supplied stale source or edit list:
all replacement spans originate from this call's admitted source.

The existing JavaScript parser owns lexical bindings and module-request sites.
Static imports/reexports, literal dynamic imports, global require and direct
const same-source loaders from named `createRequire` imports use that shared API.
Package projection additionally recognizes global `new URL(literal, import.meta.url)`
and valid quoted `import(...)` references inside comments. Invalid import-looking
comment prose remains untouched. Surrounding comments, strings, CRLF, Unicode,
quote style and query/hash suffixes retain their bytes. Computed expressions,
ordinary strings, bare dependencies and shadowed callables are not inferred.
Other loader forms and mutable `.resolve`/provider methods are not modeled.

Moving an importer rebases unchanged relative targets as well as mapped targets.
Generated replacements use Node relative specifiers even for dot-prefixed files.
Spans are sorted and checked for valid, disjoint UTF-16 intervals before assembly.
No general exact-edit API or deleted JavaScriptNode `/syntax` facade is restored.

Acceptance includes actual execution of a projected operation and authored test,
original package admission regression, lexical shadow controls, same-source loader
aliases, no-op byte identity, malformed mapping refusals and untouched invalid
comment prose. Native source/archive composition is prerequisite evidence only:
the existing full lock and registry activation remain separate gates.
