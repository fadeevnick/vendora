# Runtime Profiles

Vendora uses three runtime depths after artifact completion.

## `R1` — Launch Runtime

Goal:

- get the project to a working launch-critical state

Scope:

- launch-critical slices only
- manual or admin fallback is allowed
- verify happy path and critical invariants

Completion meaning:

- launch version works

## `R2` — Strong Runtime

Goal:

- strengthen the launch build with higher confidence

Scope:

- everything in `R1`
- key alternative paths
- negative paths
- role-sensitive checks
- state transition checks

Completion meaning:

- launch and the main operational edge cases are verified

## `R3` — Full Runtime

Goal:

- push runtime coverage toward the full depth of the artifacts

Scope:

- everything in `R2`
- target-critical flows beyond bare launch
- admin/compliance/audit-sensitive paths
- deeper hardening and broader verification

Completion meaning:

- runtime is substantially aligned with the full artifact set, not only launch

## Rule

Runtime depth is chosen only after artifact completion is done.
