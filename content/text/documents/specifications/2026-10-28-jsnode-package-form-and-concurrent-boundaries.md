---
title: "JSNode package form: boundary signatures, directory roles, and concurrent receiving"
date-created: 2026-10-28
status: proposed engineering specification; source and consumer receiving required
owner: red-cup-engineering/jsnode-package-engineering-services-section
related-owners:
  - red-cup-engineering/javascript-node-engineering-services-section
  - red-cup-engineering/jsnode-package-check-service
  - red-cup-engineering/computer-deployment-engine
---

# JSNode package form and concurrent receiving

## 1. Scope and source of authority

This is the **package-fabrication owner's** proposed form for an ES-module Node.js package, not a replacement for Node.js, npm, the package checker, the software capability-placement rule, or LAGOON. In [Science's definition](https://github.com/lenticule-science/561-theory-science-services-section/blob/main/engineering/theories/tech/concepts/package.md), a package is a named carrier with an explicit exported boundary signature. For this implementation, distinguish (1) the package's source identity and revision, (2) its internal carriers, (3) the manifest-declared public interface, (4) the actual packed distribution, and (5) an installed and exercised receiver. These identities and observations are not interchangeable.

The existing [JSNode owner](https://github.com/red-cup-engineering/javascript-node-engineering-services-section) supplies reusable operations and process apertures; this package owner supplies projection, manifests and fabrication; the original [read-only package checker](https://github.com/red-cup-engineering/jsnode-package-check-service) observes conformance; [LAGOON](https://github.com/red-cup-engineering/computer-deployment-engine) forms and receives Guix-backed releases. Follow [capability placement](https://github.com/red-cup-engineering/engineering-services-section/blob/main/content/text/documents/specifications/software-ecosystem-boundaries.md): a package may compose earlier suppliers but MUST NOT own a duplicate implementation of their capabilities.

**Normative terms** MUST, MUST NOT and SHOULD apply to packages claiming this proposed profile, once accepted by the original owners; they do not retroactively render all existing packages conformant. The role of a path is determined by its admitted contract and declared relations, not merely its spelling.

## 2. The package boundary

Let `P=(N,C,Σ,Q)` describe a **qualified package reading**, where `N` is the npm package name and source revision, `C` the admitted carrier inventory, `Σ` the manifest's externally resolvable export/command signature, and `Q` the context recording registry, runtime, source owner and dependency closure. This is an engineering reading of Science's package concept, **not** a claim that arbitrary npm packages form concurrent games.

- `package.json` MUST declare `name`, `version`, `type`, `exports` where there are importable entrypoints, relevant `bin` faces, `files` when publishing an explicitly selected subset, `engines`, dependencies and lifecycle scripts. Where `private: true` intentionally prevents publication, that restriction MUST NOT silently be removed by packaging automation. An executable-only package can have a `bin` without fabricating a library export. The effective manifest is observed, not guessed from README prose.
- `exports` is the public import surface; `bin` is the installed command surface. An internal path being importable by a relative source path does not make it public. `files` selects packed contents subject to npm's own packing rules. No one of these fields proves the other two.
- Each exported operation SHOULD name input/output carriers or schemas, precondition, postcondition, preserved frame, effects, refusal, and an independent receiving method. A TypeScript type, JSON Schema shape, and a successfully resolved module name alone do not prove behavior.
- A package MUST NOT treat its own `dist/` build, registry version, Guix store path, and live process as equivalent identifiers. Source/manifest, package tarball bytes, installed closure and actual effects require separately witnessed transitions.
- Source-only package inspection MUST NOT claim that every dynamic export, peer dependency, runtime permission, or post-install behavior was exercised. Unobserved cases remain unknown in SignCell evidence.

## 3. Internal directory roles (relative to **one package**)

| Path | Admitted responsibility | Prohibited inference |
| --- | --- | --- |
| `src/` | Maintained importable implementation: modules, operations, pure transformations, source-level adapters and explicit contract/schema definitions. One owning implementation per capability. | A source file is not exported, a safe command, or a verified morphism merely by being under `src/`. |
| `scripts/` | Thin executable process apertures and development/maintenance tooling; arguments, standard streams, exit codes, cancellation and effect scope are their interface. Prefer delegation to an owned `src/` operation. | The folder `scripts/` is **not** the manifest's `"scripts"` lifecycle map. Neither location automatically grants deployment authority. |
| `bin/` | Optional command shims mapped by `package.json#bin`; the command's actual target MAY instead be an explicitly declared `scripts/*.mjs` file. | A file called `bin/foo` is not installed as a command without a valid manifest binding and packed target. |
| `lib/` | **No implicit Node.js role.** May contain explicitly owned, admitted support data, historical/agency sources, or a declared compiler output; a generated library only exists if its production and consumption are specified. `lib/legacy/` MUST NOT be selected as an executable fallback merely because it is present. | Do not equate package-internal `lib/` with the repository-topology layer `lib/` (alongside `apps/`, `services/`, `sites/`), or assume `lib/` means a category-theoretic library. |
| `dist/` / `build/` | Optional reproducible derived outputs; their generating source, runtime/toolchain and exact distribution inclusion MUST be declared. | Compilation output is neither the source owner nor a qualified release by itself. |
| `test/` | Independent positive/negative conformance, protocol and regression tests; include incomplete/uncertain cases for effects. | A test pass is not a host-health, registry-publication or customer-receiving receipt. |
| `fixtures/`, `examples/` | Inert assay inputs and documented examples; test fixtures with real effects require isolation. | Fixtures are not substitute live observations. |
| `data/records/` | Persistent authored or observed records **only when this package is their actual owner**, with a declared mutable/immutable distinction. Other owners' state stays with those owners. | Checkout-relative location cannot establish custody; mutable process data MUST NOT be silently baked into a Guix product. |
| `content/`, `docs/`, `README.md` | Specification, rationale, examples, requirements and documentation linked to tests/receivers. | Documenting an operation never installs or proves it. |
| `apps/`, `services/` | Only when the owning services-section topology actually composes/selects such constituents; each nested package has its own independent manifest/signature. | Names alone do not justify moving a domain capability into an application. |
| `node_modules/`, caches, generated worktrees | Materialized dependencies or scratch outside the authored package source. | An incidental checkout/cache is not an admissible immutable supplier or a safe release. |

There is **no mandatory empty directory** rule. A one-file `src/index.mjs` package can be complete. The topological `lib/apps/services/sites` classification used by the legacy-adapted checker is distinct from these *intra-package* paths. Do not add thin shims or second copies merely to fill a directory.

## 4. Concurrent-games research as bounded *operational* obligations

Science's [CGS research](https://github.com/lenticule-science/561-theory-science-services-section/blob/main/engineering/theories/tech/theories/computing/code/structures/cgs.md) models events, causality, conflict, event symmetry and polarity. [Games and Strategies as Event Structures](https://www.repository.cam.ac.uk/items/4224b6f1-44b4-4d28-94e7-4892809b5381) provides a theoretical point of comparison. A package process is **not** automatically a CGS object or strategy; a game Player/Opponent polarity is not the identity or authority of a MetroPlat Actor. Here a trace model is a **candidate engineering projection** whose laws must be checked for the selected operation class.

For one *admitted* operation invocation, the receiver should be able to distinguish:

```text
qualified source + carrier + context
    -> admission / refusal
    -> invocation (issuer, operation, capabilities, input identity)
    -> observed effect(s) and terminal result OR unknown outcome
    -> independent receiving witness tied to source, target, issuer and time
```

Represent a trace event with its stable original identity, type, issuer/actor binding, causal predecessor references, resources read/written or leased, admitted input and result identities, target context and observation/receipt references. Do not put credentials in public events. A trace whose reply was lost records **uncertainty**, not a successful identity operation or a retry grant.

Two events `e` and `f` MAY be declared independent *only if* neither causes the other, neither conflicts with the other's resource claim, and their effects commute under a separately stated receiving equivalence, with unchanged authority and source/target context. **Symmetry** is an admissible bijection between configurations preserving causality, conflict, roles, effect labels and witnesses. Merely running two promises concurrently does not supply this bijection; permuting distinct receipt identifiers away destroys provenance.

A bounded game-style conformance suite SHOULD supply these countermodels:

1. **Identity/composition**: a pure admitted identity returns the same carrier; compatible total pure functions compose with the expected result. Mismatched codomain and domain refuse. Do not claim a functor on arbitrary effectful functions.
2. **Independent shuffle**: independent read-only validations A and B in either order yield the same admitted *semantic projection*, while both original event and receipt identities remain preserved. Compare the same input revisions and authority contexts.
3. **Conflict**: two actors attempting to promote the same target generation under the same exclusive lease cannot be treated as permutable. A refused lease or uncertain activation must remain visible; any valid second attempt needs its own fresh admission.
4. **Causal order**: source admission precedes Guix formation; selected product precedes target activation; process observation follows the attempt it witnesses. Reordering these is not symmetry.
5. **Failure**: cancellation, signal loss, process crash or lost reply after a possible effect creates an unknown state requiring original-attempt reconciliation, not blind re-execution. An idempotency key without retained target evidence does not prove idempotence.
6. **Name permutation**: replacing an *incidental* local variable/channel name may preserve observable meaning only when source IDs, actor rights, target identities, paths with external effect and receipt bindings are unaffected. Renaming the actual owner, issuer or target is not permissible alpha-equivalence.

These are proposed acceptance properties, **not** presently implemented CGS verification and not evidence that an arbitrary software call is a strategy in the formal category.

## 5. Checkable receiving gates

| Gate | Existing source owner | Required assay before claiming success |
| --- | --- | --- |
| Source boundary | JSNode package owner | Parse the actual ESM and resolve declared export names; refuse malformed source and out-of-package targets. |
| Installed commands | JSNode package checker | Verify each explicit `bin` target is a real file within the package boundary; absence of `bin` is not a failure for a library. This verifies a source path, **not** command safety. |
| Distribution boundary | npm/PNPM packaging owner | Compare actual `npm pack --dry-run --json` manifest with expected public exports, bins, licenses and retained data; no implicit `lib/legacy` entry. Use an admitted offline registry/runtime when relevant. |
| Functional contract | Operation owner + independent test | Positive/negative carrier, refusal, effects, concurrency, cancellation and incomplete observation tests against the *real* export and CLI when declared. |
| Release formation | Original LAGOON/Guix owner | Source-qualified immutable inputs, off-target capacity admission and an exact independently checked product; no target effects during formation. |
| Deployment receiving | Original LAGOON target/beneficiary | Fresh physical capacity, exact original attempt/lease, observed running process generation and beneficiary outcome; failed/unknown are not silently retried. |

Current implementation status: the module projector and package checker exist; the checker does **not yet** prove every role and concurrency obligation here. LAGOON's [LG-01–LG-09](https://github.com/red-cup-engineering/computer-deployment-engine/blob/main/content/text/documents/specifications/2026-10-24-deployment-relations-as-lagoon-cells.md) remain the original source/receiving programme. Requirements derived from this document MUST be received there rather than grown into another package manager.

## 6. Immediate independent reception

The first bounded implementation target is **manifest `bin` path conformance** in the existing `jsnode-package-check-service`, including missing file, escaped symlink, directory target and legitimate executable script under `scripts/`. This closes a concrete uninspected edge between the public command signature and its source carrier. The next consumer is the existing package form projector/checker, not a new checker or “game-runtime” fork. A third-party npm `pack` observation and a LAGOON release receipt are separate subsequent tests.

References: [Node.js package exports and module packages](https://nodejs.org/api/packages.html); [npm `package.json` and `files`/`bin` contracts](https://docs.npmjs.com/cli/configuring-npm/package-json/); [Science's Guix/Guile/Node.js distinction](https://github.com/lenticule-science/561-theory-science-services-section/blob/main/engineering/theories/tech/theories/computing/prose/learning/guix-guile-composition-layer.md).
