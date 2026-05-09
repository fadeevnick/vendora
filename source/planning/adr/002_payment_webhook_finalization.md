# ADR 002 — Payment Webhook Finalization

## Status

Accepted for launch.

## Context

Vendora не может позволить:

- partial order creation after payment;
- duplicate orders on retry or webhook replay;
- optimistic money truth before trusted payment confirmation.

Checkout flow already assumes:

- checkout session is created before final payment success;
- vendor-specific orders appear only after trusted payment finalization;
- idempotency is mandatory.

## Decision

Vendora treats trusted payment finalization event as the authoritative trigger for:

- vendor-specific order creation;
- escrow hold creation;
- checkout success completion.

Implementation meaning:

- `POST /api/checkout/sessions` creates validated payment intent/session, but not final active orders;
- trusted provider callback or equivalent verified finalization path creates orders atomically;
- replayed webhook must be idempotent no-op;
- no alternate UI submit path may bypass this model.

## Consequences

Плюсы:

- cleaner atomicity model;
- clearer idempotency boundary;
- easier reconciliation with provider evidence.

Минусы:

- runtime and local dev need provider sandbox or equivalent simulation;
- webhook path becomes launch-critical, not optional.

## Impacted Artifacts

- `api_contracts.md`
- `schema_drafts.md`
- `test_matrix.md`
- `runtime_checklists.md`
- runtime phases `04`, `05`, `06`
