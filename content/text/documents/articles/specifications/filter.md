---
title: "filter — refine a fiber by predicate value"
description: "Refines an existing cell list by additional value-matching constraints. Composable with `project`."
kind: spec
status: normative
version: "0.2"
---

# filter

`filter` takes a list of cells and refines it by an additional predicate-value constraint.

## 1. Signature

```
filter(cells: list[Cell], by: ValueConstraint) → list[Cell]
```

ValueConstraint:

- `=v` — exact match.
- `!=v` — not equal.
- `≤_t v`, `≥_t v` — bilattice truth-order comparison.
- `≤_k v`, `≥_k v` — bilattice knowledge-order comparison.
- `is-stale` — has a `stale-since-ord` predicate.

## 2. Examples

```sh
project task:* status > filter ==True
```

Equivalent to `project (task:*, status, *, "True")` (project supports value match too); filter is for cases where the cell list comes from elsewhere.

```sh
project (task:*, status, *) > filter is-stale
```

Returns task status cells that are marked stale.

## 3. Composability

`filter` is a stdlib pipe stage:

```
cmd-a | filter <constraint> | cmd-b
```

The filter narrows the cell stream between A and B.

## 4. Conformance

`filter` passes:

1. Filtering by `=v` returns exactly cells with that value.
2. Bilattice-order constraints respect $\le_t$ / $\le_k$.
3. Stale-cell filter returns only cells with `stale-since-ord` predicate.
