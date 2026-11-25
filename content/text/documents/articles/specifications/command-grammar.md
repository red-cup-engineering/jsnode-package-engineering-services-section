---
title: "Command grammar"
description: "The formal grammar of OS shell commands. Parser, AST, error messages."
kind: spec
status: normative
version: "0.2"
---

# Command grammar

Formal grammar for shell commands. Used by REPL, CLI, and TUI.

## 1. Grammar (EBNF-style)

```
command        ::= verb_invocation
                 | respond_call
                 | runbook_call
                 | meta_command
                 | pipe

pipe           ::= command ("|" command)+

verb_invocation ::= verb_name arg*

verb_name      ::= "project" | "filter" | "fold" | "materialize" | "hash"
                 | "fork" | "await" | "settle" | "witness" | "audit"
                 | "retract" | "assert"

respond_call   ::= "respond" target_arg payload_arg [sender_arg]

runbook_call   ::= "runbook" runbook_slug runbook_arg*

meta_command   ::= ":" meta_name arg*

meta_name      ::= "help" | "quit" | "session" | "set" | "history"
                 | "replay" | "source" | "cancel" | ...

arg            ::= positional_arg | named_arg

positional_arg ::= entity_slug | predicate_slug | bilattice_value | literal

named_arg      ::= "--" name "=" value

entity_slug    ::= [a-z][a-z0-9-]* (":" [a-z][a-z0-9-]*)*

predicate_slug ::= same as entity_slug

bilattice_value ::= "None" | "True" | "False" | "Both"

literal        ::= number | string | bool

string         ::= '"' [^"]* '"' | "'" [^']* "'"

number         ::= ["-"]? [0-9]+ ("." [0-9]+)? ([eE] [+-]? [0-9]+)?
```

## 2. Examples

```
project task:* status
project (task:*, status, *, True)
respond task:write-spec status open
respond task:write-spec --status=open --priority=5
runbook weekly-ledger-close --week=2026-W18
project task:* | filter status=open | fold count
:help
:set output-format=json
```

## 3. Bind variables

In rules and patterns, `$name` introduces a bind variable:

```
project ($task, status, $value)
```

The shell's evaluator unifies bindings as it walks the cell list.

## 4. Error reporting

Parse errors return `PCS_REPL_PARSE_ERROR` with:

- The line and column of the error.
- A human-readable description.
- Suggested correction (e.g., "expected `=` after named-arg name").

## 5. Quoting and escaping

- Strings with spaces use `"..."` or `'...'`.
- Escape characters: `\n`, `\t`, `\\`, `\"`, `\'`.
- Multi-line strings use triple-quoted: `"""..."""` or `'''...'''`.

## 6. Comments

`#` to end-of-line: comment.

In multi-line input (heredocs), `#` at line start is a comment.

## 7. Implementation

### Python (v0.2+)

- Parser combinators or `lark` grammar.
- AST as pydantic models for type safety.

### Rust (v0.2+)

- `nom` or `pest` for parsing.
- AST as enum + struct.

## 8. Conformance

Command grammar passes:

1. All examples in §2 parse correctly.
2. Parse errors include correct line/column.
3. Same input parses to same AST in Python and Rust.
4. Round-trip: parse to AST, render to text, parse again, AST identical.
