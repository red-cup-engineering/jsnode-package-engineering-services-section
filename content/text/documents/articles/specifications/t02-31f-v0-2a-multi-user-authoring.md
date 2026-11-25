---
kind: task
title: "t02-31f — Member-role authoring fixture (paired)"
description: "Paired fixture-authoring task for t02-31. Authors tests/conformance/test_t02_31f_member_authoring.py — pins the member role's capability fiber, the member's authority to assert + retract, the member's positive control on signal:session-scope:set, the non-amplification denial on signal:mount:attach, and byte-identical replay of the member slice."
slug: task:t02-31f
of-goal: goal:v0.2a-multi-user-authoring
of-milestone: milestone:v0.2a-multi-user-single-node
kind-of-task: engineering
status: complete
owned-by-office: office:engineering
assigned-to-personnel: null
priority: 3
estimated-effort-hours: null
actual-effort-hours: null
deadline-by-ord: null
depends-on-tasks: [task:t02-31, task:t02-30f]
area: engineering
horizon: doing
authored-at: 2026-05-03
authority: "decisions/fixture-authoring-paired-task.md"
---

# t02-31f — Member-role authoring fixture (paired)

## Description

Per [decisions/fixture-authoring-paired-task.md](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/docs/dev/decisions/fixture-authoring-paired-task.md), every `t02-NN` task that ships normative substrate behaviour has a paired `t02-NNf` fixture-authoring task with its own conformance gate. This is that pair for [t02-31](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/docs/dev/tasks/engineering/t02-31-v0.2a-multi-user-authoring.md) — the **member-role slice** of the multi-user authoring surface.

The umbrella fixture [`test_t02_34f_multi_user_authoring.py`](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/tests/conformance/test_t02_34f_multi_user_authoring.py) already exercises admin → member → observer end-to-end against the role-default capability fibers from [`init_boot.bootstrap_users.ROLE_CAPABILITIES`](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/src/init_boot/bootstrap_users.py); this paired fixture is the **per-role refinement** asked for by [t02-31](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/docs/dev/tasks/engineering/t02-31-v0.2a-multi-user-authoring.md)'s acceptance — member authority alone, without entanglement with the admin-assert or observer-deny legs. The narrower scope makes the member's capability fiber the single named hypothesis on test, so a future change that quietly weakens the member role (or accidentally widens it past the §6.4 spec literal) is the only thing that can break this fixture.

The fixture lives at `tests/conformance/test_t02_31f_member_authoring.py` and witnesses the load-bearing acceptance items from [t02-31](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/docs/dev/tasks/engineering/t02-31-v0.2a-multi-user-authoring.md):

- *"`bootstrap_users` emits the member role + member-scoped grants from the bootstrap-user manifest per `boot-sequence.md` §4.1"* — pinned by asserting the member's persisted `granted:*` cells on the boundary entity match the §6.4 spec literal `{respond:*, shell:read, shell:write, signal:session-scope:set, signal:session-message:*}` (not the runtime `ROLE_CAPABILITIES["member"]` constant), and the four boundary-projection cells (`projects-auth-fiber`, `projects-authz-fiber`, `projects-attention-fiber`, `projects-history-fiber`) plus `kind-user` and `role-member` are all present at value `True` per [decisions/identity-is-boundary-projection.md](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/docs/dev/decisions/identity-is-boundary-projection.md).
- *"a member can retract a cell it previously asserted"* — the member opens a session, asserts `(task:demo, status-open) = TRUE`, then retracts the same predicate. The post-retract fiber value is exactly `Both` per the cell-record monotonicity rule (`stdlib.retract_cell` docstring); both cell ids are real and distinct.
- *"member assert succeeds within scope"* — member positive control on the `signal:session-scope:set` surface: the member's `signal:session-scope:set` grant covers `set_current_scope`, the call advances the event log and writes the binary cell to the member's session-scope fiber. This is the load-bearing positive-side claim that distinguishes member from observer — same surface, different outcome, gated by the role-default fiber alone.
- *"a member CANNOT grant authority — an attempt to assert into another user's authz-fiber projection restricts to ⊥"* — capability non-amplification per row 8 of [references/theory-for-developers.md](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/docs/dev/references/theory-for-developers.md). Member attempting `attach_mount` (which gates on `signal:mount:attach`, not in the member's role-default fiber) raises `PCA_SCOPE_INSUFFICIENT` with `needed = signal:mount:attach`, and the denied call advances neither the event log nor the mount fiber. `signal:mount:attach` is the load-bearing target because the admin's `signal:*` super-grant covers it but the member's `signal:session-scope:set` + `signal:session-message:*` grants do not — same shape of capability, different prefix coverage, exactly the non-amplification claim t02-31 makes.
- *"byte-identical fiber state across two runs"* — the member slice (assert + retract + scope-set) is replayed against two fresh substrates with `process.session.secrets` monkeypatched to a deterministic counter; `events.jsonl` is byte-identical between runs.

The fixture's scope is **member authority**, not the full three-role surface. The umbrella `t02-34f` remains the cross-role conformance gate; this fixture is the regression fence for the member slice in isolation, complementing the admin slice in [`test_t02_30f_admin_authoring.py`](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/tests/conformance/test_t02_30f_admin_authoring.py).

## Acceptance

- The fixture file exists, is collected by pytest, and all six tests pass against the current implementation.
- The fixture exercises the spec's acceptance claims (member role-default fiber, four boundary-projection cells, member assert+retract producing `Both`, member `signal:session-scope:set` positive control, non-amplification denial on `signal:mount:attach`, byte-identical replay), not just the implementation's incidental behaviour, per [decisions/fixture-authoring-paired-task.md](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/docs/dev/decisions/fixture-authoring-paired-task.md) §"Why".

## Progress cells

Predcat-aware progress observations on this task per [specs/work-orchestration/progress-tracking.md](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/docs/dev/specs/work-orchestration/progress-tracking.md). Each entry is a substrate cell `(s, p, o, v)` recording one observation; appended in chronological order.

- `(task:t02-31f, status, open, true)` — recorded 2026-05-03 on first authoring of the paired record.
- `(task:t02-31f, horizon, doing, true)` — recorded 2026-05-03.
- `(task:t02-31f, fixture-passes, test_member_role_carries_default_capability_fiber, true)` — recorded 2026-05-03 on first green run.
- `(task:t02-31f, fixture-passes, test_member_user_boundary_emits_four_projection_cells, true)` — recorded 2026-05-03 on first green run.
- `(task:t02-31f, fixture-passes, test_member_asserts_then_retracts_own_cell_yields_both, true)` — recorded 2026-05-03 on first green run.
- `(task:t02-31f, fixture-passes, test_member_drives_signal_session_scope_set_surface, true)` — recorded 2026-05-03 on first green run.
- `(task:t02-31f, fixture-passes, test_member_denied_signal_mount_attach_no_state_advance, true)` — recorded 2026-05-03 on first green run; pins capability non-amplification per row 8 of references/theory-for-developers.md.
- `(task:t02-31f, fixture-passes, test_member_slice_replays_byte_identical, true)` — recorded 2026-05-03 on first green run.
- `(task:t02-31f, architect-review-fixed, true, true)` — recorded 2026-05-03; addressed three architect findings on the t02-31 review: (i) top docstring corrected from "five legs" to "six legs"; (ii) leg-1 docstring corrected from "admin's persisted" to "member's persisted" (copy/edit error from the t02-30f template); (iii) added an explicit out-of-scope note for the t02-31 description-text claim "member cannot read other users' history-fiber cells", citing that v0.2a `storage.storage_layout.StorageLayout.get_fiber` performs no capability check and per-fiber read gates are a v0.4 federation slice deliverable — adding a leg now would either tautologically test absence of a gate or ratify a not-yet-shipped surface.
- `(task:t02-31f, status, complete, true)` — recorded 2026-05-03 once all six legs were green and architect-review fixes landed.
