---
kind: task
title: "t02-141f — Bootstrap-users idempotence fixture (paired)"
description: "Paired fixture-authoring task for t02-141. Authors tests/conformance/test_t02_141f_bootstrap_users_idempotence.py — events.jsonl byte-identity across reboot with unchanged manifest, surgical-delta append on changed manifest."
slug: task:t02-141f
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
depends-on-tasks: [task:t02-141]
area: engineering
horizon: doing
authored-at: 2026-05-03
authority: "decisions/fixture-authoring-paired-task.md"
---

# t02-141f — Bootstrap-users idempotence fixture (paired)

## Description

Per [decisions/fixture-authoring-paired-task.md](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/docs/dev/decisions/fixture-authoring-paired-task.md), every `t02-NN` task that ships normative substrate behaviour has a paired `t02-NNf` fixture-authoring task with its own conformance gate. This is that pair for [t02-141](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/docs/dev/tasks/engineering/t02-141-v0.2a-multi-user-authoring.md) — the **byte-identity** determinism gate for the bootstrap-users phase of boot.

The fixture lives at `tests/conformance/test_t02_141f_bootstrap_users_idempotence.py` and witnesses the load-bearing acceptance from [t02-141](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/docs/dev/tasks/engineering/t02-141-v0.2a-multi-user-authoring.md): *"a second boot against an unchanged manifest produces ZERO new events in `events.jsonl`; the file is byte-identical to its post-first-boot state."* This is strictly stronger than the joint [`test_t02_145f_bootstrap_reconcile_joint.py`](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/tests/conformance/test_t02_145f_bootstrap_reconcile_joint.py)'s assertion that respond-event count is unchanged — byte-identity rules out same-kind/different-timestamp appends that would silently break the [boot-determinism theorem](../../../../../../../../../../../../../../../../../theories/engineering/theories/tech/theories/computing/theories/predicated-computing/theorems/boot-determinism.md).

Three legs cover the spec acceptance:

- **Unchanged-manifest leg** (`test_unchanged_manifest_reboot_is_byte_identical`) — boots a 3-user manifest, snapshots `events.jsonl` bytes / sha256 / lines, re-boots, asserts byte-identical and sha256-identical and line-identical. Repeats for a third boot to confirm steady-state, not one-shot. Verifies the hash chain still validates. Cross-checks the `BootstrapResult` shape (no creates, manifest unchanged, no tokens re-issued).
- **Diagnostic sibling** (`test_unchanged_manifest_reboot_emits_zero_responds_in_bootstrap_phase`) — narrows any future failure to the bootstrap_users phase by counting respond events contributed across the second boot.
- **Changed-manifest leg** (`test_changed_manifest_reboot_appends_only_the_delta`) — boots manifest-A (3 users), snapshots bytes, swaps to manifest-B (adds `user:carol`), re-boots, asserts (a) **append-only**: the post-A byte prefix is preserved verbatim per [decisions/event-log-is-jsonl.md](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/docs/dev/decisions/event-log-is-jsonl.md); (b) **surgical delta**: the appended lines target only `user:carol` and `deployment` — no existing user appears as a target; (c) existing users still authenticate with their original tokens (bootstrap did not touch their auth-fiber records); (d) hash chain still verifies through the delta.
- **New steady state** (`test_changed_manifest_reaches_new_steady_state`) — after a manifest change, subsequent boots against the same (changed) manifest are themselves byte-identical no-ops. Idempotence is preserved through the change, not just before it.

No determinism patching is required: the second boot's bootstrap_users phase emits zero events on the unchanged path because every per-user predicate is already True (per [`_assert_if_changed`](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/src/init_boot/bootstrap_users.py)) and the manifest-hash record is gated on change-or-first-boot. Byte-identity follows from the implementation's structural idempotence, not from monkeypatched RNG / clock.

## Acceptance

- The fixture file exists, is collected by pytest, and all four tests pass against the current implementation.
- The fixture exercises the spec's acceptance claims (events.jsonl byte-identity, append-only, surgical delta, existing users untouched, hash chain valid), not just the implementation's incidental behaviour, per [decisions/fixture-authoring-paired-task.md](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/docs/dev/decisions/fixture-authoring-paired-task.md) §"Why".

## Progress cells

Predcat-aware progress observations on this task per [specs/work-orchestration/progress-tracking.md](../../../../../../../../../../../../../../../../../lib/legacy/2026-10-24-archived-snapshot-code/lenticule-science/emsenn-pypredcomp/docs/dev/specs/work-orchestration/progress-tracking.md). Each entry is a substrate cell `(s, p, o, v)` recording one observation; appended in chronological order.

- `(task:t02-141f, status, open, true)` — recorded 2026-05-03 on first authoring of the paired record.
- `(task:t02-141f, horizon, doing, true)` — recorded 2026-05-03.
- `(task:t02-141f, fixture-passes, test_unchanged_manifest_reboot_is_byte_identical, true)` — recorded 2026-05-03 on first green run.
- `(task:t02-141f, fixture-passes, test_unchanged_manifest_reboot_emits_zero_responds_in_bootstrap_phase, true)` — recorded 2026-05-03 on first green run.
- `(task:t02-141f, fixture-passes, test_changed_manifest_reboot_appends_only_the_delta, true)` — recorded 2026-05-03 on first green run.
- `(task:t02-141f, fixture-passes, test_changed_manifest_reaches_new_steady_state, true)` — recorded 2026-05-03 on first green run.
- `(task:t02-141f, fixture-passes, test_reboot_against_unchanged_manifest_is_byte_identical, true)` — recorded 2026-05-03; added per architect-review follow-up to pin *true reboot semantics* (re-open `StorageLayout` and `EventLog` from disk between calls), not just in-process re-call semantics.
- `(task:t02-141f, fixture-passes, test_reboot_after_manifest_change_does_not_re_emit_hash, true)` — recorded 2026-05-03; reboot variant of the steady-state test, exercising the exact disk-state path the original `_read_prior_manifest_hash` bug broke.
- `(task:t02-141f, status, complete, true)` — recorded 2026-05-03 once all six legs were green and the parent task's gate-3 byte-identity acceptance was met.
