# ADR 003 — Order Funds And Vendor Balance Ledger Split

## Status

Accepted for launch.

## Context

Vendora needs two things at once:

1. current money state per order
2. durable historical money evidence for audit, disputes and payout reasoning

One mutable table alone is weak for:

- dispute freeze/release reasoning;
- balance visibility;
- later payout reconciliation;
- audit-heavy financial review.

## Decision

Vendora uses a split model:

- `order_funds` = current per-order escrow/payout eligibility state
- `vendor_balance_ledger` = append-only money history per vendor

Meaning:

- stateful decisions read `order_funds`;
- balance reasoning and durable history rely on ledger entries;
- runtime checks must prove both state correctness and historical evidence.

## Consequences

Плюсы:

- clearer separation of current state vs durable history;
- stronger support for disputes, refunds and later payouts;
- better fit for `R1` money invariants without needing full finance platform depth.

Минусы:

- more writes on state changes;
- implementation must keep state row and ledger entries consistent.

## Impacted Artifacts

- `schema_drafts.md`
- `runtime_checklists.md`
- `test_matrix.md`
- `cut_register.md`
- runtime phase `06`
