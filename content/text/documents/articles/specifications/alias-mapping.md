---
title: "Alias mapping"
description: "Human-readable name → cell-id resolver."
kind: spec
status: normative
version: "0.1"
---

# Alias mapping

Aliases are mutable name → cell-id mappings, useful when humans (or tools) need to refer to "the current X" rather than a specific content hash. The cell pointed to is immutable; the alias's pointer is what changes.

## 1. Schema

An alias is a file entry:

```
$ROOT/aliases/<name>
```

The file content is the canonical JSON object `{"target": "<id>"}`. The
target is one of:

1. A **cell-id** (64 lowercase hex chars) — the most common case; the
   alias is a stable handle for "the current X".
2. An **entity-slug** (e.g. `office:planner`) — re-pointed when the
   incumbent changes; resolution carries on with that slug.
3. An **entity-kind prefix** ending in `:` (e.g. `task:`, `entry:`) —
   used by `paths-and-resolution.md` §3 to bind a sub-scope path
   (`scope:engineering/tasks`) to the entity-kind whose instances live
   in that sub-scope. Resolution at `./tasks/<leaf>` under
   `scope:engineering` yields `task:<leaf>`. ERP-module bindings
   (`scope:engineering/tasks → task:`, `scope:accounting/entries →
   entry:`) live in this class.

Reading an alias: read the file, decode the canonical JSON object,
return the `target` string. Callers validate the target's shape
against their use-site (cell-resolvers require 64-hex; the path
resolver tolerates the kind-prefix form).

## 2. Name alphabet

Alias names are lower-kebab-case strings, optionally containing `:` and `/`:

```
name = ["a"-"z" "0"-"9" "-"]+ ( ":" | "/" ["a"-"z" "0"-"9" "-"]+ )*
```

Examples: `current-charter`, `office:planner`, `rules/auto-dispatch`.

Names containing `..`, leading `-`, NUL bytes, or other path-traversal characters are rejected (`PCS_INVALID_ID_FORMAT`).

## 3. Mutation

Aliases mutate via `alias` events:

```json
{
  "kind": "alias",
  "name": "current-charter",
  "cell_id": "<cell-id-or-empty>",
  "ord": <integer>,
  ...
}
```

Empty `cell_id` (empty string) means the alias is removed; the file is deleted. Non-empty re-points the alias.

The substrate writes the file after the event is appended. On crash mid-write, replay regenerates the file deterministically.

## 4. Resolution

`alias/<name>` HTTP request:

1. Validate name.
2. Read `$ROOT/aliases/<name>`. If absent → 404.
3. Read target from file (canonical JSON `{"target": "..."}`).
4. If the target is a 64-hex cell-id, return 302 redirect to
   `cell/<cell-id>`. If it's an entity slug, redirect to
   `entity/<slug>`. If it's a kind prefix (`<kind>:`), return 422 — the
   alias is structural, not directly resolvable on its own; the path
   resolver consumes it together with a leaf.

Programmatic resolution (MCP tool, CLI):

```text
resolve_alias(name) → cell_id | NotFound | InvalidName
```

A resolver SHOULD cache aliases with short TTL (default 60s); aliases are mutable but seldom in tight loops.

## 5. Convention

Common alias patterns:

- `current-charter` — the current charter's cell-id. Re-pointed when the charter is amended.
- `office:<office-name>` — the cell-id of the office's current incumbent (a persona-agent or personnel entry).
- `rules/active` — a manifest cell listing currently-active rule-ids.
- `views/<module>` — a manifest cell defining a projection view (messaging, tasks, ledger, etc.).

These are conventions, not requirements. The system permits any name in the alphabet.

## 6. Why aliases

The substrate is content-addressed: every cell has a stable hash-identity. Aliases give names where humans need them without compromising the immutability story. Alias mutation is recorded in the event log; the history of "what current-charter pointed to over time" is queryable.

This is the same shape as Git refs vs Git objects.

## 7. Conflict on federation

Two peers may both define an alias `current-charter` pointing to different cell-ids. Federation merge produces $\top$ at `(node:peer, alias:current-charter, ?)`; the substrate honestly records the disagreement. The local resolution preference is per-node configuration: prefer-local, prefer-most-recent, or surface-as-disagreement (the alias `current-charter` returns 409 with both candidates).

The default is prefer-local: each node's own `current-charter` is what its `alias/current-charter` returns.
