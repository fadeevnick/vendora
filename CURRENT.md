# CURRENT — Vendora

Этот файл нужен как handoff-state для новой AI-сессии, потому что workflow migration ещё не завершена.

## Current Mode

Сейчас проект находится в режиме:

```text
Runtime Realization (R1 unblock pass complete; H1-H3 local hardening in progress)
```

Это значит:

- staged workflow already exists and remains the project reading model;
- artifact/design truth is already strong enough and no longer blocks runtime;
- runtime has formally started with chosen depth `R1`;
- this first pass is intentionally reset-friendly and can be replayed later from clean runtime data;
- `Phase 01 — Auth`, `Phase 02 — Vendor Gate`, `Phase 03 — Catalog`, `Phase 04 — Checkout`, `Phase 05 — Orders` and `Phase 06 — Disputes And Money` now have live runtime evidence for the numbered `R1` phase pack;
- the auth slice is still not the final launch-grade implementation because email delivery remains temporary;
- the KYC slice is still not the final launch-grade compliance/storage implementation because document storage remains local/dev metadata;
- the catalog slice now has local media metadata/UI proof, local Meilisearch indexing, admin-triggered full-replace reindex and a local catalog-search worker, but hosted object storage/CDN/image processing and hosted search operations remain open;
- the checkout slice is still not the final launch-grade payment implementation because payment finalization uses a local/dev provider webhook;
- the orders slice is still not the final launch-grade fulfillment implementation because current H2/H3 proof is local/operator proof for delivery, shipment metadata, timeout jobs, API/UI timeline, admin/backend ops and backend RMA inspection endpoints, not hosted/deployed scheduler proof or deep RMA workflow automation;
- local worker process entrypoints now exist for notification outbox, order maintenance, dispute SLA escalation and catalog search reindex, but hosted/deployed worker liveness evidence is still open;
- local Compose `workers` profile now wires `notification-worker`, `order-maintenance-worker`, `dispute-sla-worker` and `catalog-search-worker`;
- the disputes/money slice is still not the final launch-grade money-ops implementation because refund, payout and reconciliation evidence is local/internal `dev_mock` evidence surfaced through backend ops APIs, not live provider-integrated execution or provider dashboard/API proof;
- dispute messages, evidence metadata, local protected raw dispute evidence storage/read, vendor-response SLA escalation command, SLA worker and admin-triggered SLA dry-run/execute now have local proof, but hosted private-bucket evidence, hosted worker proof and richer escalation/review workflow remain open.

## Current Checkpoint — 2026-05-10

The current dirty tree is an H3 local-hardening bundle over the completed R1/H1/H2 base.

High-level groups:

- admin/web surfaces:
  - `/admin/ops`
  - `/admin/kyc`
  - `/admin/disputes`
  - `/vendor/application`
  - `/vendor/balance`
  - buyer/vendor order timeline and dispute detail/response surfaces
- catalog/search:
  - `ProductMedia` migration and local inline media metadata/UI proof
  - `ProductModerationStatus` migration and local admin suspend/approve lifecycle
  - local Meilisearch adapter
  - full-replace `catalog:reindex-search`
  - admin-triggered catalog search reindex
  - local `catalog:search-worker`
- disputes/evidence/SLA:
  - `DisputeMessage` and `DisputeEvidence` metadata migration
  - local raw dispute evidence storage/read migration
  - buyer/vendor evidence upload in dispute create/respond flows
  - admin evidence read/preview
  - vendor-response SLA command
  - local dispute SLA worker
  - admin-triggered dispute SLA dry-run/execute
- worker/ops:
  - Compose workers profile includes notification, order maintenance, dispute SLA and catalog search workers
  - `/admin/ops/workers` and `/admin/ops/queues` include the new worker/backlog snapshots

Important latest verification:

Post-commit audit on `2026-05-10` passed after commits `efbff92`, `643e6b2` and `140c96b`:

- `npm run build --workspace apps/api`
- `npm run lint --workspace apps/web`
- `npm run build --workspace apps/web`
- `npm run runtime:r1 --workspace apps/api`
- `npm run runtime:phase03 --workspace apps/api`
- `npm run runtime:phase06 --workspace apps/api`
- `npm run runtime:h3-catalog-moderation --workspace apps/api`
- `npm run runtime:h3-catalog-search --workspace apps/api`
- `npm run runtime:h3-catalog-search-ops --workspace apps/api`
- `npm run runtime:h3-catalog-search-worker --workspace apps/api`
- `npm run runtime:h3-dispute-sla --workspace apps/api`
- `npm run runtime:h3-dispute-sla-worker --workspace apps/api`
- `npm run runtime:h3-dispute-sla-ops --workspace apps/api`
- `npm run runtime:h2-admin-worker-queue-ops --workspace apps/api`
- `docker compose --profile workers config`
- `npx prisma migrate status`
- `npm run db:migrate:status:compose`

Local DB status at checkpoint: `npx prisma migrate status` originally reported 21 migrations and schema
up to date. After the H3 moderation migration, Compose-network migration status on `2026-05-10` reports
23 migrations and schema up to date via `npm run db:migrate:status:compose`.

Replay discipline note: host-side Prisma/Node access to `127.0.0.1:55432` can fail in this environment
even when the Docker Postgres service is healthy. The stable local verification path is the Compose-network
Prisma status command above, which connects to `postgres:5432`.

Process hygiene: Vendora web dev servers on ports `3004`, `3005` and `3006` must be kept stopped. A non-Vendora `next dev` on port `4000` from `/home/nickf/Documents/ai_limits/app` may exist and should not be touched.

## Input References In Use

- substrate: `source/context/substrate_reference.md`
- domain: `source/context/domain_reference.md`
- standards:
  - original external standards have been removed
  - their project-relevant decisions are now internalized in `source/design/` and `source/planning/`

## What Is Already Complete

- project-level staged workflow entrypoint exists in `README.md`
- new `source/`, `execution/`, `tracking/`, `prototypes/` layers exist
- runtime depth model exists in `execution/runtime/runtime_profiles.md`
- runtime entry gate exists in `source/planning/runtime_entry_gate.md`
- access matrix exists in `source/planning/access_matrix.md`
- state machines exist in `source/planning/state_machines.md`
- API contracts exist in `source/planning/api_contracts.md`
- schema drafts exist in `source/planning/schema_drafts.md`
- runtime checklists exist in `source/planning/runtime_checklists.md`
- cut register exists in `source/planning/cut_register.md`
- test matrix exists in `source/planning/test_matrix.md`
- R1 closeout/hardening plan exists in `source/planning/r1_closeout_hardening_plan.md`
- runtime phase docs now cover launch phases `00` through `06`
- R1 replay runbook exists in `execution/runtime/r1_replay_runbook.md`
- ADR pack exists in `source/planning/adr/`
- runtime gate review exists in `source/planning/runtime_gate_review.md`
- implementation tracking is now rewritten into the new runtime phase model
- launch-required HTML prototype coverage now exists for `B-1`, `B-2`, `B-3`, `B-4`, `B-5`, `V-1`, `V-2`, `V-3`
- second-priority / target-first HTML prototype coverage now also exists for `V-4`
- second-priority / target-first HTML prototype coverage now also exists for `B-6`
- hosted/manual/admin-side HTML prototype coverage now also exists for `V-5`, `V-6`, `A-1` and `A-2`
- core design chain has been rewritten into the new workflow shape:
  - `source/design/business_requirements.md`
  - `source/design/user_journeys.md`
  - `source/design/functional_requirements.md`
  - `source/design/architecture.md`
  - `source/design/tech_stack.md`
  - `source/planning/launch_roadmap.md`
  - `source/planning/implementation_guide.md`

## Codebase State

`vendora_codebase/`:

- remains physically in place;
- is the active runtime work surface;
- is still not reorganized into the new folder model.

Important:

- do not move `vendora_codebase/` yet;
- do not let existing code redefine product truth;
- do not treat current `R1` unblock-pass edits as if every launch-grade auth, KYC, catalog or payment requirement is already final.

## What This Session Was Doing

The current workstream is:

```text
continue Runtime Realization with a reset-friendly R1 unblock pass, prove phase_06_disputes_money live, and complete the numbered R1 runtime phase pack
```

We explicitly chose:

- start runtime without requiring deep project immersion from the user right now;
- keep the pass reset-friendly so runtime data can later be wiped and re-run from scratch;
- implement only the `Phase 06` dispute recovery and money-state foundation that completes the numbered R1 phase pack;
- keep artifact/design truth unchanged while runtime begins;
- record live runtime evidence honestly instead of overclaiming completion.

The latest session sequence was:

1. read current status files and `execution/runtime/phase_06_disputes_money.md`
2. read dispute/money-relevant access matrix, state machines, API contracts and schema drafts
3. inspect current dispute routes/service/schema and existing order/fund state
4. add Phase 06 migration for dispute resolution metadata and `VendorBalanceLedger`
5. add vendor dispute response endpoint with tenant scoping
6. add admin dispute queue/detail/resolve endpoints
7. add vendor balance endpoint with aggregate fund state and recent ledger evidence
8. wire buyer dispute open to freeze funds and create `FROZEN` ledger entries
9. wire admin vendor-favor and buyer-favor resolutions to release/refund fund states and ledger entries
10. keep legacy dispute endpoints available while adding contract-style endpoints
11. run Prisma format/generate, migration deploy, API build, seed, live `R1-DISP/MONEY/AUDIT-*` checks, web lint and web production build
12. stop the API process and record the current runtime fact in status files

## Last Completed Runtime Slice

The last completed runtime bundle is:

- [`vendora_codebase/apps/api/prisma/schema.prisma`](vendora_codebase/apps/api/prisma/schema.prisma)
- [`vendora_codebase/apps/api/prisma/migrations/20260507230000_phase01_auth_foundation/migration.sql`](vendora_codebase/apps/api/prisma/migrations/20260507230000_phase01_auth_foundation/migration.sql)
- [`vendora_codebase/apps/api/prisma/migrations/20260508010000_phase02_vendor_gate/migration.sql`](vendora_codebase/apps/api/prisma/migrations/20260508010000_phase02_vendor_gate/migration.sql)
- [`vendora_codebase/apps/api/prisma/migrations/20260508020000_phase03_catalog/migration.sql`](vendora_codebase/apps/api/prisma/migrations/20260508020000_phase03_catalog/migration.sql)
- [`vendora_codebase/apps/api/prisma/migrations/20260508030000_phase04_checkout/migration.sql`](vendora_codebase/apps/api/prisma/migrations/20260508030000_phase04_checkout/migration.sql)
- [`vendora_codebase/apps/api/prisma/migrations/20260508050000_phase06_disputes_money/migration.sql`](vendora_codebase/apps/api/prisma/migrations/20260508050000_phase06_disputes_money/migration.sql)
- [`vendora_codebase/apps/api/prisma/seed.ts`](vendora_codebase/apps/api/prisma/seed.ts)
- [`vendora_codebase/apps/api/src/modules/auth/auth.routes.ts`](vendora_codebase/apps/api/src/modules/auth/auth.routes.ts)
- [`vendora_codebase/apps/api/src/modules/auth/auth.service.ts`](vendora_codebase/apps/api/src/modules/auth/auth.service.ts)
- [`vendora_codebase/apps/api/src/modules/auth/auth.schema.ts`](vendora_codebase/apps/api/src/modules/auth/auth.schema.ts)
- [`vendora_codebase/apps/api/src/plugins/authenticate.ts`](vendora_codebase/apps/api/src/plugins/authenticate.ts)
- [`vendora_codebase/apps/api/src/modules/vendor/vendor.routes.ts`](vendora_codebase/apps/api/src/modules/vendor/vendor.routes.ts)
- [`vendora_codebase/apps/api/src/modules/vendor/vendor.service.ts`](vendora_codebase/apps/api/src/modules/vendor/vendor.service.ts)
- [`vendora_codebase/apps/api/src/modules/vendor/vendor.schema.ts`](vendora_codebase/apps/api/src/modules/vendor/vendor.schema.ts)
- [`vendora_codebase/apps/api/src/modules/catalog/catalog.routes.ts`](vendora_codebase/apps/api/src/modules/catalog/catalog.routes.ts)
- [`vendora_codebase/apps/api/src/modules/catalog/catalog.service.ts`](vendora_codebase/apps/api/src/modules/catalog/catalog.service.ts)
- [`vendora_codebase/apps/api/src/modules/catalog/catalog.schema.ts`](vendora_codebase/apps/api/src/modules/catalog/catalog.schema.ts)
- [`vendora_codebase/apps/api/src/modules/orders/orders.routes.ts`](vendora_codebase/apps/api/src/modules/orders/orders.routes.ts)
- [`vendora_codebase/apps/api/src/modules/orders/orders.service.ts`](vendora_codebase/apps/api/src/modules/orders/orders.service.ts)
- [`vendora_codebase/apps/api/src/modules/orders/orders.schema.ts`](vendora_codebase/apps/api/src/modules/orders/orders.schema.ts)
- [`vendora_codebase/apps/api/src/modules/disputes/disputes.routes.ts`](vendora_codebase/apps/api/src/modules/disputes/disputes.routes.ts)
- [`vendora_codebase/apps/api/src/modules/disputes/disputes.service.ts`](vendora_codebase/apps/api/src/modules/disputes/disputes.service.ts)
- [`vendora_codebase/apps/api/scripts/runtime/runtime_helpers.mjs`](vendora_codebase/apps/api/scripts/runtime/runtime_helpers.mjs)
- [`vendora_codebase/apps/api/scripts/runtime/phase01_auth_check.mjs`](vendora_codebase/apps/api/scripts/runtime/phase01_auth_check.mjs)
- [`vendora_codebase/apps/api/scripts/runtime/phase02_vendor_gate_check.mjs`](vendora_codebase/apps/api/scripts/runtime/phase02_vendor_gate_check.mjs)
- [`vendora_codebase/apps/api/scripts/runtime/phase03_catalog_check.mjs`](vendora_codebase/apps/api/scripts/runtime/phase03_catalog_check.mjs)
- [`vendora_codebase/apps/api/scripts/runtime/phase04_checkout_check.mjs`](vendora_codebase/apps/api/scripts/runtime/phase04_checkout_check.mjs)
- [`vendora_codebase/apps/api/scripts/runtime/phase05_orders_check.mjs`](vendora_codebase/apps/api/scripts/runtime/phase05_orders_check.mjs)
- [`vendora_codebase/apps/api/scripts/runtime/phase06_disputes_money_check.mjs`](vendora_codebase/apps/api/scripts/runtime/phase06_disputes_money_check.mjs)
- [`vendora_codebase/apps/api/tmp_phase05_check.mjs`](vendora_codebase/apps/api/tmp_phase05_check.mjs)
- [`vendora_codebase/apps/api/tmp_phase06_check.mjs`](vendora_codebase/apps/api/tmp_phase06_check.mjs)
- [`vendora_codebase/apps/web/lib/api.ts`](vendora_codebase/apps/web/lib/api.ts)
- [`vendora_codebase/apps/web/app/layout.tsx`](vendora_codebase/apps/web/app/layout.tsx)
- [`vendora_codebase/apps/web/app/globals.css`](vendora_codebase/apps/web/app/globals.css)
- [`vendora_codebase/apps/web/app/auth/register/page.tsx`](vendora_codebase/apps/web/app/auth/register/page.tsx)
- [`vendora_codebase/apps/web/app/auth/login/page.tsx`](vendora_codebase/apps/web/app/auth/login/page.tsx)
- [`vendora_codebase/apps/web/app/buyer/layout.tsx`](vendora_codebase/apps/web/app/buyer/layout.tsx)
- [`vendora_codebase/apps/web/app/buyer/products/page.tsx`](vendora_codebase/apps/web/app/buyer/products/page.tsx)
- [`vendora_codebase/apps/web/app/buyer/orders/page.tsx`](vendora_codebase/apps/web/app/buyer/orders/page.tsx)
- [`vendora_codebase/apps/web/app/vendor/orders/page.tsx`](vendora_codebase/apps/web/app/vendor/orders/page.tsx)
- [`vendora_codebase/apps/web/lib/cart.tsx`](vendora_codebase/apps/web/lib/cart.tsx)
- [`tracking/implementation_status.md`](tracking/implementation_status.md)
- [`source/planning/r1_closeout_hardening_plan.md`](source/planning/r1_closeout_hardening_plan.md)
- [`execution/runtime/r1_replay_runbook.md`](execution/runtime/r1_replay_runbook.md)

It now defines or proves:

- `R1` registration with explicit `BUYER` / `VENDOR_OWNER` account type;
- email-verification-required register flow instead of immediate session issue;
- `POST /auth/verify-email`, `POST /admin/auth/login`, `GET /auth/session`;
- login blocking for unverified users;
- failed-login lockout after 5 attempts for 15 minutes;
- JWT/session payload with account type, actor type, email verification and platform-admin signal;
- backend access helpers for vendor/admin auth boundaries;
- local web auth flow adapted to the temporary dev verification token approach;
- web build no longer depends on Google Fonts network fetch;
- buyer catalog page no longer blocks production build by forcing API access during prerender;
- live runtime proof for:
  - `R1-AUTH-01`
  - `R1-AUTH-02`
  - `R1-AUTH-03`
  - `R1-AUTH-04`
  - `R1-AUTH-05`
  - `R1-AUTH-06` indirect self-scope proof
  - `R1-AUTH-07` indirect tenant-scope proof
  - `R1-AUTH-08`
- `R1` vendor owner KYC application lifecycle:
  - application starts as `DRAFT`
  - owner saves required business profile
  - owner creates KYC document upload metadata
  - owner completes document metadata
  - owner submits into `PENDING_REVIEW`
- admin KYC review surface:
  - admin-only pending queue
  - admin-only application detail
  - approve path to `APPROVED`
  - reject path to `REJECTED`
- protected KYC document boundary:
  - vendor application view does not expose `storageKey`
  - admin detail includes protected document metadata
- durable audit evidence for KYC read/update/submit/approve/reject actions
- sell gate:
  - unapproved vendor cannot create products
  - rejected vendor cannot create products
  - approved vendor can create and publish products
  - public product reads exclude non-approved vendors
- `R1` catalog/listing lifecycle:
  - approved vendor creates draft listing through `POST /vendor/listings`
  - approved vendor patches draft listing
  - draft listing stays hidden from public catalog
  - approved vendor publishes listing
  - buyer/public catalog discovers published listing through query/category/in-stock filters
  - buyer/public product detail exposes stock availability
  - vendor unpublishes listing and it disappears from public catalog
  - unapproved vendor is denied listing creation
  - blocked vendor listings disappear from public read paths
- `R1` checkout lifecycle:
  - buyer adds eligible published listings to persisted cart
  - cart groups items by vendor and tracks version
  - checkout session validates cart version, stock, eligibility and price snapshot
  - checkout submit is idempotent by `Idempotency-Key`
  - local/dev signed provider webhook finalizes payment
  - successful finalization creates one `PAYMENT_HELD` order per vendor
  - each created order receives a `HELD` order-fund row
  - provider webhook replay does not duplicate orders or provider events
  - finalized cart is cleared
  - unpublished and blocked-vendor listings are denied at cart-add time
- `R1` order operations lifecycle:
  - checkout-created vendor orders start as `PAYMENT_HELD` with `HELD` funds
  - vendor order queue and detail are tenant-scoped
  - buyer order detail is self-scoped
  - vendor can confirm `PAYMENT_HELD -> CONFIRMED`
  - vendor can ship `CONFIRMED -> SHIPPED`
  - buyer can confirm receipt from `SHIPPED`, completing the order and moving funds to `RELEASABLE`
  - vendor can cancel from `PAYMENT_HELD`, moving funds to `RETURNED_TO_BUYER`
  - invalid transitions return `ORDER_INVALID_STATE`
  - order transition audit events are persisted
- `R1` disputes/money lifecycle:
  - buyer opens dispute from a shipped order
  - dispute open moves order to `DISPUTED`, fund to `FROZEN_DISPUTE`, and writes `FROZEN` ledger evidence
  - vendor response is tenant-scoped and moves dispute to `PLATFORM_REVIEW`
  - admin dispute queue/detail is admin-only
  - admin vendor-favor resolution moves order to `COMPLETED`, fund to `RELEASABLE`, and writes `RELEASED` ledger evidence
  - admin buyer-favor resolution moves order to `CANCELLED`, fund to `RETURNED_TO_BUYER`, and writes `REFUNDED` ledger evidence
  - vendor balance endpoint reflects release/refund ledger evidence
  - dispute open/respond/resolve audit events are persisted
  - duplicate dispute resolution returns `DISPUTE_INVALID_STATE`

## Current Verification Limit

Current runtime fact:

- `Phase 01` is now strong enough to unblock downstream runtime work;
- `Phase 02` is now strong enough to unblock downstream runtime work;
- `Phase 03` is now strong enough to unblock downstream runtime work;
- `Phase 04` is now strong enough to unblock downstream runtime work;
- `Phase 05` is now strong enough to unblock downstream runtime work;
- `Phase 06` is now strong enough to complete the numbered `R1` phase pack;
- auth, vendor gate, catalog, checkout, orders and disputes/money are no longer purely imported assumptions;
- current live runtime used Docker Postgres on host port `55432` and API on `127.0.0.1:3001`.

Remaining auth gaps:

- no real email delivery yet:
  - local verification still uses dev token fallback instead of actual email send
- no refresh/logout/session revocation model yet
- no durable sessions table yet
- buyer/vendor isolation proof is partially indirect because the imported API surface is self-scoped

Remaining KYC gaps:

- local private storage now stores KYC raw bytes and checksum evidence;
  hosted S3/private-bucket deployment evidence remains open
- no real encrypted-at-rest raw document proof yet
- admin raw-document read is now API-protected and per-read audited; signed download URL remains open if needed
- durable notification outbox exists for KYC submit/approval/rejection; local `dev_log` worker shell exists, but no real external email provider delivery yet
- no `REQUEST_MORE_INFO`, rejected resubmission loop, blocked/revoked access handling or session invalidation yet
- no dedicated admin UI flow yet; current KYC review path is API-first

Remaining catalog gaps:

- catalog is still backed by the imported `Product` table rather than a renamed first-class `Listing` model
- no Meilisearch indexing integration yet; public search is database-backed
- no listing media upload/validation/CDN path yet
- no plan/quota enforcement for listing creation yet
- no moderation lifecycle yet
- no richer buyer-facing search UX/facets yet
- no dedicated web product detail page yet; proof is API-first plus existing buyer catalog UI compatibility

Remaining checkout gaps:

- local `dev_mock` payment provider adapter now creates checkout provider refs and parses signed webhook payloads, but no real Stripe/YooKassa/hosted provider integration yet
- provider webhook signing is local/dev shared-secret only
- no provider failure/recovery UI or interrupted checkout recovery yet
- stock reservation/decrement and expiry/reaper now have local H1 runtime proof; no deployed scheduler/cron or broader concurrency stress proof yet
- durable notification outbox exists for checkout/order confirmation; local `dev_log` worker shell exists, but no real external email provider delivery yet
- no guest checkout/cart merge yet
- no durable payment provider payload retention beyond hash/event id
- no price/stock race-condition stress proof beyond the local reservation oversell check

Remaining orders gaps:

- H2 local proof now adds dedicated `DELIVERED` state and shipment metadata capture; legacy R1 `SHIPPED -> COMPLETED` receipt shortcut remains for compatibility
- H2 local proof now adds an operator delivery-timeout auto-complete command for old `DELIVERED` orders with held funds; deployed scheduler/cron wiring remains open
- H2 local proof now adds an operator vendor-confirmation-timeout auto-cancel command for old `PAYMENT_HELD` orders with held funds; deployed scheduler/cron wiring remains open
- H2 local proof now adds one combined order-maintenance command that runs checkout expiry, vendor confirmation timeout and delivery timeout in one replay-safe pass; deployed scheduler/cron wiring remains open
- buyer/vendor order detail now exposes an API-level chronological `timeline` derived from durable order `AuditEvent` rows plus a payment-held order-created event; there is still no separate order timeline table
- durable notification outbox exists for order status changes; local `dev_log` worker shell exists, but no real external email provider delivery yet
- stock reservation commits on payment success and releases on payment failure; pre-shipment cancellation returns stock; buyer-favor refunds after shipment now explicitly do not auto-restock and require return inspection metadata
- no richer vendor operations tooling, reporting, pagination hardening or export path yet

Remaining disputes/money gaps:

- local `dev_mock` partial refund evidence now exists, but no real provider partial-refund API/dashboard evidence yet
- local `dev_mock` refund provider execution evidence now exists for buyer-favor disputes, but no real provider refund API/dashboard evidence yet
- local `dev_mock` payout provider execution evidence now exists for `RELEASABLE` funds, but no real payout provider API/dashboard/reconciliation evidence yet
- no vendor response SLA or auto-escalation job yet
- no dispute messages/evidence files or dispute UI yet
- no admin dispute UI yet; proof is API-first
- no immutable ledger hardening beyond application-level append-only behavior
- durable notification outbox exists for dispute open/respond/resolve; local `dev_log` worker shell exists, but no real external email provider delivery yet

Interpretation:

- auth is good enough for this unblock pass;
- vendor gate is good enough for this unblock pass;
- catalog is good enough for this unblock pass;
- checkout is good enough for this unblock pass;
- orders are good enough for this unblock pass;
- disputes/money is good enough for this unblock pass;
- auth, KYC, catalog, checkout, orders and disputes/money are not yet final launch-grade implementation chapters.

## Session Stop Point

We stopped exactly here:

- `Phase 06 — Disputes And Money` has live runtime evidence;
- the numbered `R1` runtime phase pack is complete;
- maintained Phase 01-06 runtime-check entrypoints now exist under `vendora_codebase/apps/api/scripts/runtime/`;
- non-clean live smoke on the current DB succeeded for `runtime:phase01` through `runtime:phase04`;
- the full clean-data `runtime:r1` replay was executed and recorded on `2026-05-08 12:09 MSK +0300`;
- clean replay evidence covered `R1-AUTH-*`, `R1-KYC-*`, `R1-CAT-*`, `R1-CHK-*`, `R1-ORD-*`, `R1-DISP-*`, `R1-MONEY-*` and `R1-AUDIT-01`;
- baseline verification also passed: API build, web lint and web build;
- first `H1` hardening target started with transactional notification outbox evidence:
  - migration `20260508110000_h1_notification_outbox`
  - `NotificationOutbox` durable email artifact table
  - runtime command `npm run runtime:h1-email --workspace apps/api`
  - evidence IDs `H1-EMAIL-01` through `H1-EMAIL-04`
- local email worker shell now drains `NotificationOutbox` with the `dev_log` provider:
  - command `npm run runtime:h1-email-worker --workspace apps/api`
  - evidence IDs `H1-EMAIL-WORKER-01` through `H1-EMAIL-WORKER-03`
  - rechecked on `2026-05-08 12:54 MSK +0300`
- Resend email provider adapter is wired behind `EMAIL_PROVIDER=resend` and runtime-checked against a local mock provider API:
  - command `npm run runtime:h1-email-provider --workspace apps/api`
  - evidence IDs `H1-EMAIL-PROVIDER-01` through `H1-EMAIL-PROVIDER-03`
  - checked on `2026-05-08 13:03 MSK +0300`
- live Resend provider proof harness now exists and intentionally requires real provider env:
  - command `npm run runtime:h1-email-live-provider:compose`
  - required env `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_LIVE_TEST_RECIPIENT`
  - evidence IDs `H1-EMAIL-LIVE-PROVIDER-01` through `H1-EMAIL-LIVE-PROVIDER-03` only count after a real provider send succeeds
- long-running NotificationOutbox worker entrypoint now exists:
  - command `npm run notifications:worker --workspace apps/api`
  - runtime command `npm run runtime:h1-email-worker-daemon --workspace apps/api`
  - evidence IDs `H1-EMAIL-WORKER-DAEMON-01` through `H1-EMAIL-WORKER-DAEMON-03`
  - checked on `2026-05-09`
- live external email provider delivery evidence remains open and must not be forgotten;
- second `H1` hardening target added protected KYC raw-document storage evidence:
  - migration `20260508113000_h1_kyc_private_storage`
  - local private storage driver for KYC object bytes
  - vendor upload endpoint `POST /vendor/application/documents/:documentId/upload`
  - admin-only read endpoint `GET /admin/kyc/documents/:documentId/content`
  - audit action `KYC_DOCUMENT_OBJECT_READ`
  - runtime command `npm run runtime:h1-storage --workspace apps/api`
  - evidence IDs `H1-KYC-STORAGE-01` through `H1-KYC-STORAGE-04`
- H1 stock reservation/decrement local proof now exists:
  - migration `20260508171000_h1_stock_reservation`
  - `StockReservation` rows reserve product stock at checkout session creation
  - payment failure releases `RESERVED` stock back to the product
  - payment success commits the reservation without double-decrementing stock
  - webhook replay leaves orders and stock unchanged
  - runtime command `npm run runtime:h1-stock-reservation --workspace apps/api`
  - evidence IDs `H1-STOCK-RESERVATION-01` through `H1-STOCK-RESERVATION-05`
  - post-change `runtime:phase04` and full `runtime:r1` passed on `2026-05-08`
- H1 checkout expiry/reaper local proof now exists:
  - migration `20260508173000_h1_checkout_expiry_reaper`
  - `CheckoutSession.expiresAt` records reservation TTL
  - command `npm run checkout:expire --workspace apps/api` expires abandoned awaiting-payment sessions
  - expiry releases reserved stock, marks reservations `RELEASED` and marks checkout session `EXPIRED`
  - replaying the expiry command does not release stock twice
  - late provider success/failure after expiry is a safe no-op and cannot create orders or re-consume stock
  - runtime command `npm run runtime:h1-stock-expiry --workspace apps/api`
  - evidence IDs `H1-STOCK-EXPIRY-01` through `H1-STOCK-EXPIRY-05`
  - post-change `runtime:h1-stock-reservation`, `runtime:phase04` and full `runtime:r1` passed on `2026-05-08`
- H2 order maintenance worker entrypoint now exists:
  - command `npm run orders:maintenance-worker --workspace apps/api`
  - runtime command `npm run runtime:h2-order-maintenance-worker --workspace apps/api`
  - evidence IDs `H2-ORDER-MAINTENANCE-WORKER-01` through `H2-ORDER-MAINTENANCE-WORKER-03`
  - checked on `2026-05-09`
  - full `runtime:h2-order-maintenance` regression passed after the shared-service refactor on API port `3002`
- local Compose worker profile now exists:
  - `docker compose --profile workers config` passed
  - one-shot `docker compose run --rm --no-deps notification-worker ... --once` passed
  - one-shot `docker compose run --rm --no-deps order-maintenance-worker ... --once` passed
  - this is local container wiring proof, not hosted/deployed scheduler evidence
- H2 fulfillment/delivery local proof now exists:
  - migration `20260509001000_h2_fulfillment_delivery`
  - `OrderStatus.DELIVERED` exists
  - vendor ship captures `shipmentCarrier`, `shipmentTrackingNumber`, optional shipment metadata and `shippedAt`
  - buyer can mark shipped order delivered via `POST /buyer/orders/:orderId/mark-delivered`
  - buyer receipt can complete the new `DELIVERED -> COMPLETED` path while the old R1 `SHIPPED -> COMPLETED` shortcut remains compatible
  - runtime command `npm run runtime:h2-fulfillment --workspace apps/api`
  - evidence IDs `H2-FULFILLMENT-01` through `H2-FULFILLMENT-06`
  - post-change `runtime:phase05` and full `runtime:r1` passed on `2026-05-09` using `RUNTIME_API_URL=http://127.0.0.1:3002` because port `3001` was occupied by a non-Vendora service
- H2 delivery timeout local/operator proof now exists:
  - command `npm run orders:auto-complete-delivered --workspace apps/api`
  - runtime command `npm run runtime:h2-delivery-timeout --workspace apps/api`
  - evidence IDs `H2-DELIVERY-TIMEOUT-01` through `H2-DELIVERY-TIMEOUT-04`
  - old `DELIVERED` orders with `HELD` funds move to `COMPLETED`
  - held funds move to `RELEASABLE`
  - replaying the command is a no-op for already completed/released orders
  - audit action `ORDER_AUTO_COMPLETED_DELIVERY_TIMEOUT` and buyer/vendor notification outbox evidence are written
  - post-change `runtime:h2-fulfillment`, `runtime:phase05` and full `runtime:r1` passed on `2026-05-09` using `RUNTIME_API_URL=http://127.0.0.1:3002`
- H2 vendor confirmation timeout local/operator proof now exists:
  - command `npm run orders:auto-cancel-unconfirmed --workspace apps/api`
  - runtime command `npm run runtime:h2-confirmation-timeout --workspace apps/api`
  - evidence IDs `H2-CONFIRMATION-TIMEOUT-01` through `H2-CONFIRMATION-TIMEOUT-04`
  - old `PAYMENT_HELD` orders with `HELD` funds move to `CANCELLED`
  - held funds move to `RETURNED_TO_BUYER`
  - replaying the command is a no-op for already cancelled/returned orders
  - late vendor confirm is blocked by order state
  - audit action `ORDER_AUTO_CANCELLED_CONFIRMATION_TIMEOUT` and buyer/vendor notification outbox evidence are written
  - post-change `runtime:h2-delivery-timeout`, `runtime:h2-fulfillment`, `runtime:phase05` and full `runtime:r1` passed on `2026-05-09` using `RUNTIME_API_URL=http://127.0.0.1:3002`
- H2 order maintenance local/operator proof now exists:
  - command `npm run orders:run-maintenance --workspace apps/api`
  - runtime command `npm run runtime:h2-order-maintenance --workspace apps/api`
  - evidence IDs `H2-ORDER-MAINTENANCE-01` through `H2-ORDER-MAINTENANCE-04`
  - one command runs abandoned checkout expiry, vendor confirmation timeout auto-cancel and delivery timeout auto-complete
  - replaying the command is a no-op across all three jobs after first processing
  - post-change `runtime:h2-confirmation-timeout`, `runtime:h2-delivery-timeout`, `runtime:h1-stock-expiry` and full `runtime:r1` passed on `2026-05-09` using `RUNTIME_API_URL=http://127.0.0.1:3002`
- H2 pre-shipment cancellation stock-return proof now exists:
  - vendor cancellation from `PAYMENT_HELD` returns held funds and restores ordered product stock
  - confirmation-timeout auto-cancel returns held funds and restores ordered product stock
  - auto-cancel replay does not restore stock twice
  - audit metadata records `returnedStockQuantity`
  - runtime command `npm run runtime:h2-cancel-stock --workspace apps/api`
  - evidence IDs `H2-CANCEL-STOCK-01` through `H2-CANCEL-STOCK-04`
  - post-change `runtime:phase05`, `runtime:h2-confirmation-timeout`, `runtime:h2-order-maintenance`, `runtime:h1-stock-reservation`, `runtime:h1-stock-expiry` and full `runtime:r1` passed on `2026-05-09` using `RUNTIME_API_URL=http://127.0.0.1:3002`
- H2 shipped/return stock policy proof now exists:
  - buyer-favor full refund after shipment does not automatically restock product inventory
  - dispute resolution audit/notification metadata records `stockPolicy=NO_AUTO_RESTOCK_AFTER_SHIPMENT`, `restockedQuantity=0` and `returnInspectionRequired=true`
  - runtime command `npm run runtime:h2-return-stock --workspace apps/api`
  - evidence IDs `H2-RETURN-STOCK-01` through `H2-RETURN-STOCK-04`
  - post-change `runtime:phase06` regression passed on API port `3002`
- H2 admin/backend ops proof now exists:
  - admin-only `GET /admin/ops/summary`
  - admin-only `GET /admin/ops/notifications`
  - admin-only `POST /admin/ops/notifications/:notificationId/retry`
  - runtime command `npm run runtime:h2-admin-ops --workspace apps/api`
  - evidence IDs `H2-ADMIN-OPS-01` through `H2-ADMIN-OPS-05`
  - post-change `money:reconcile` and `runtime:h1-money-failure-recovery` passed after treating late provider events after expired checkout as matched safe no-op evidence
- H2 backend RMA inspection proof now exists:
  - admin-only `GET /admin/ops/return-inspections`
  - admin-only `POST /admin/ops/return-inspections/:disputeId/complete`
  - return inspection state is durable via `RETURN_INSPECTION_COMPLETED` audit evidence
  - `RESTOCK` increments product stock exactly once; duplicate completion is rejected
  - runtime command `npm run runtime:h2-rma-inspection --workspace apps/api`
  - evidence IDs `H2-RMA-INSPECTION-01` through `H2-RMA-INSPECTION-05`
  - post-change `runtime:h2-admin-ops` regression passed on API port `3002`
- H2 admin order-maintenance ops proof now exists:
  - admin-only `POST /admin/ops/order-maintenance/run`
  - defaults to dry-run and reports checkout expiry, vendor confirmation timeout and delivery timeout backlog without mutation
  - execute mode runs the same shared maintenance service as the CLI/worker path
  - execute mode writes `ADMIN_ORDER_MAINTENANCE_RUN` audit evidence and remains replay-safe for already processed rows
  - runtime command `npm run runtime:h2-admin-maintenance-ops --workspace apps/api`
  - evidence IDs `H2-ADMIN-MAINTENANCE-OPS-01` through `H2-ADMIN-MAINTENANCE-OPS-05`
  - post-change `runtime:h2-admin-ops` and `runtime:h2-rma-inspection` regressions passed on API port `3002`
- H2 admin money ops proof now exists:
  - admin-only `GET /admin/ops/money/reconciliation`
  - admin-only `GET /admin/ops/money/failures`
  - reconciliation endpoint filters runs/items by run status, item status and item type
  - failures endpoint filters failed refund/payout executions by type and review state, with dispute/order/fund/vendor context
  - runtime command `npm run runtime:h2-admin-money-ops --workspace apps/api`
  - evidence IDs `H2-ADMIN-MONEY-OPS-01` through `H2-ADMIN-MONEY-OPS-05`
  - post-change `runtime:h2-admin-ops`, `runtime:h2-admin-maintenance-ops` and `runtime:h2-rma-inspection` regressions passed on API port `3002`
- H2 admin worker/queue ops proof now exists:
  - admin-only `GET /admin/ops/workers`
  - admin-only `GET /admin/ops/queues`
  - workers endpoint exposes notification worker and order maintenance worker DB/config snapshots plus latest audit-backed ops activity
  - queues endpoint aggregates notification, order maintenance, return inspection and money failure actionable backlog counts
  - runtime command `npm run runtime:h2-admin-worker-queue-ops --workspace apps/api`
  - evidence IDs `H2-ADMIN-WORKER-QUEUE-OPS-01` through `H2-ADMIN-WORKER-QUEUE-OPS-05`
  - post-change `runtime:h2-admin-ops`, `runtime:h2-admin-money-ops`, `runtime:h2-admin-maintenance-ops` and `runtime:h2-rma-inspection` regressions passed on API port `3002`
- H2 durable worker heartbeat proof now exists:
  - migration `20260509120000_h2_worker_heartbeat` adds `WorkerHeartbeat`
  - notification worker and order maintenance worker write `RUNNING`, `STOPPED` and `ERROR` heartbeat state with instance ID, run counts, processed counts, idle runs and timestamps
  - admin workers endpoint surfaces latest heartbeat instances and marks old `RUNNING` rows as `STALE`
  - runtime command `npm run runtime:h2-worker-heartbeat --workspace apps/api`
  - evidence IDs `H2-WORKER-HEARTBEAT-01` through `H2-WORKER-HEARTBEAT-05`
  - post-change `runtime:h1-email-worker-daemon`, `runtime:h2-order-maintenance-worker`, `runtime:h2-admin-worker-queue-ops` and `runtime:h2-admin-ops` regressions passed on API port `3002`
  - this is local/runtime heartbeat proof, not hosted/deployed worker liveness proof
- maintained `runtime:phase05` now restores its seed-vendor product stock before checkout so repeated local replays remain compatible with H1 stock reservation/decrement behavior
- clean post-H1 reset/reseed applied 8 migrations, then `runtime:h1-email`, `runtime:h1-storage` and `runtime:r1` all passed on `2026-05-08 12:37 MSK +0300`;
- Docker services were left running for reuse:
  - PostgreSQL on host port `55432`
  - Redis on `6379`
  - Meilisearch on `7700`
- the API process on `:3001` was stopped after verification;
- the API process on `:3002` was also stopped after H2 worker heartbeat verification; `curl http://127.0.0.1:3002/health` failed to connect afterward;
- the next session should start by reading the status files, `source/planning/r1_closeout_hardening_plan.md` and `execution/runtime/r1_replay_runbook.md`; then either run live external email provider proof with real credentials/dashboard evidence, run live payment/refund/payout provider sandbox proof, or choose the next `H2` fulfillment/admin-ops hardening target. There is no `phase_07` file.

## Next Exact Step

The numbered `R1` runtime phase pack is complete after:

[`execution/runtime/phase_06_disputes_money.md`](execution/runtime/phase_06_disputes_money.md)

The closeout/hardening plan now exists:

[`source/planning/r1_closeout_hardening_plan.md`](source/planning/r1_closeout_hardening_plan.md)

The replay runbook now exists:

[`execution/runtime/r1_replay_runbook.md`](execution/runtime/r1_replay_runbook.md)

The next exact step is to choose an execution target from those artifacts, not a new phase claim:

1. choose the first `H1` provider/storage target: email, payment/refund, payout, or object storage
2. keep local/dev proof clearly separated from production claims
3. rerun `runtime:r1` only when validating a new replay-sensitive change or re-baselining runtime data

Current `H1` email status:

- durable notification outbox exists and is runtime-checked for auth, KYC, checkout/order and dispute events;
- local `dev_log` worker shell is runtime-checked for success, retry-pending failure and exhausted failure handling;
- Resend adapter code is runtime-checked against a local mock provider API;
- live provider delivery is still not proven, so this is local outbox/worker/provider-adapter evidence, not Resend/SES dashboard/API delivery proof.

Current `H1` payment status:

- checkout creation now goes through a `PAYMENT_PROVIDER=dev_mock` adapter instead of hard-coded provider refs;
- provider webhook signature parsing now goes through the payment provider adapter;
- `npm run runtime:h1-payment-provider --workspace apps/api` passed with `H1-PAYMENT-PROVIDER-01` through `H1-PAYMENT-PROVIDER-04`;
- post-change `runtime:phase04` and full `runtime:r1` both passed on `2026-05-08 13:26 MSK +0300`;
- `PAYMENT_PROVIDER=stripe` adapter code now exists for Stripe Checkout Session creation and signed raw-body webhook verification;
- `npm run runtime:h1-stripe-payment-provider --workspace apps/api` passed with `H1-STRIPE-PAYMENT-PROVIDER-01` through `H1-STRIPE-PAYMENT-PROVIDER-03` on `2026-05-10`;
- live Stripe/YooKassa/hosted provider charge/session dashboard/API proof is still not done.

Current `H1` refund status:

- migration `20260508133000_h1_refund_provider_execution` added `RefundProviderExecution`;
- buyer-favor dispute resolution now creates `REFUND_PROVIDER=dev_mock` refund execution evidence;
- vendor-favor dispute resolution releases funds without refund execution;
- `npm run runtime:h1-refund-provider --workspace apps/api` passed with `H1-REFUND-PROVIDER-01` through `H1-REFUND-PROVIDER-03`;
- post-change `runtime:phase06` and full `runtime:r1` both passed on `2026-05-08 13:40 MSK +0300`;
- live Stripe/YooKassa/hosted provider refund dashboard/API proof is still not done.

Current `H1` partial refund status:

- migration `20260508160000_h1_partial_refunds` added `BUYER_FAVOR_PARTIAL_REFUND` and `OrderFund.refundedAmountMinor`;
- admin dispute resolution rejects invalid partial refund amounts without changing dispute/fund state;
- valid partial refund creates `REFUND_PROVIDER=dev_mock` evidence for only the requested amount;
- fund and ledger evidence split buyer refund amount from vendor-releasable remainder;
- payout drain pays only the vendor remainder after partial refund;
- reconciliation matches partial refund and partial-remainder payout evidence;
- `npm run runtime:h1-partial-refund --workspace apps/api` passed with `H1-PARTIAL-REFUND-01` through `H1-PARTIAL-REFUND-04`;
- post-change `runtime:h1-refund-provider`, `runtime:h1-payout-provider`, `runtime:h1-money-failure-recovery`, `runtime:h1-money-reconciliation` and full `runtime:r1` all passed by `2026-05-08 21:31 MSK +0300`;
- live provider partial-refund dashboard/API proof remains open.

Current `H1` payout status:

- migration `20260508134500_h1_payout_provider_execution` added `PayoutProviderExecution`, `OrderFundStatus.PAID_OUT` and `VendorLedgerEntryType.PAID_OUT`;
- `PAYOUT_PROVIDER=dev_mock` drain command now converts `RELEASABLE` funds into `PAID_OUT` with provider payout evidence;
- `npm run runtime:h1-payout-provider --workspace apps/api` passed with `H1-PAYOUT-PROVIDER-01` through `H1-PAYOUT-PROVIDER-04`;
- post-change `runtime:phase05`, `runtime:phase06` and full `runtime:r1` all passed on `2026-05-08 20:34 MSK +0300`;
- live Stripe/YooKassa/hosted provider payout dashboard/API/reconciliation proof is still not done.

Current `H1` money reconciliation status:

- migration `20260508144000_h1_money_reconciliation` added persisted reconciliation run/item evidence;
- `npm run runtime:h1-money-reconciliation --workspace apps/api` passed with `H1-MONEY-RECON-01` through `H1-MONEY-RECON-03`;
- the run checks payment provider events, refund executions and payout executions, then persists matched/mismatched item evidence;
- post-change full `runtime:r1` passed on `2026-05-08 20:50 MSK +0300`, then again after H1 money failure-recovery work;
- this is local/internal reconciliation over local `dev_mock` provider artifacts, not live provider dashboard/API reconciliation proof.

Current `H1` money failure-recovery status:

- migration `20260508152000_h1_money_failure_recovery` added `OrderFundStatus.PAYOUT_FAILED_REVIEW`;
- failed refund provider execution now persists `FAILED` evidence, leaves dispute in `PLATFORM_REVIEW` and leaves funds `FROZEN_DISPUTE`;
- failed payout provider execution now persists `FAILED` evidence, moves releasable funds to `PAYOUT_FAILED_REVIEW` and does not write a paid-out ledger entry;
- admin-only `GET /admin/money/provider-failures` exposes failed refund and payout executions;
- reconciliation treats controlled provider failures as matched operational evidence when state remains review-safe;
- `npm run runtime:h1-money-failure-recovery --workspace apps/api` passed with `H1-MONEY-FAILURE-01` through `H1-MONEY-FAILURE-04`;
- post-change `runtime:h1-money-reconciliation` and full `runtime:r1` both passed;
- live provider failure dashboard/API proof remains open.

Current `H1` money remediation status:

- migration `20260508164000_h1_money_remediation` added review metadata to refund and payout provider executions;
- admin-only retry endpoints now exist for failed refund and payout executions;
- admin-only mark-reviewed endpoints now persist review note/actor/time and write audit evidence;
- failed refund retry completes dispute/order/fund state, writes refund ledger evidence and clears failure state;
- failed payout retry moves funds to `PAID_OUT`, writes paid-out ledger evidence and clears failure state;
- `npm run runtime:h1-money-remediation --workspace apps/api` passed with `H1-MONEY-REMEDIATION-01` through `H1-MONEY-REMEDIATION-05`;
- post-change `runtime:h1-money-failure-recovery`, `runtime:h1-money-reconciliation`, `runtime:h1-partial-refund` and full `runtime:r1` all passed by `2026-05-08 21:47 MSK +0300`;
- this remains local/dev `dev_mock` operator remediation proof, not live provider dashboard/API remediation proof.

Current `H1` stock reservation status:

- migration `20260508171000_h1_stock_reservation` added `StockReservation` and `StockReservationStatus`;
- checkout session creation now atomically decrements available `Product.stock` and writes `RESERVED` reservation rows;
- payment failure releases `RESERVED` rows and increments available stock exactly once;
- payment success commits reservation rows and creates orders without a second stock decrement;
- provider webhook replay is idempotent for reservations, orders and available stock;
- `npm run runtime:h1-stock-reservation --workspace apps/api` passed with `H1-STOCK-RESERVATION-01` through `H1-STOCK-RESERVATION-05`;
- post-change `runtime:phase04` and full `runtime:r1` both passed on `2026-05-08`;
- migration `20260508173000_h1_checkout_expiry_reaper` added `CheckoutSession.expiresAt`;
- command `npm run checkout:expire --workspace apps/api` now releases abandoned `AWAITING_PAYMENT` reservations and marks sessions `EXPIRED`;
- `npm run runtime:h1-stock-expiry --workspace apps/api` passed with `H1-STOCK-EXPIRY-01` through `H1-STOCK-EXPIRY-05`;
- post-change `runtime:h1-stock-reservation`, `runtime:phase04` and full `runtime:r1` all passed on `2026-05-08`;
- remaining stock hardening is deployed scheduler/cron wiring and broader concurrency stress.

Current `H1` KYC storage status:

- KYC raw document bytes can now be uploaded to protected local private storage;
- vendor reads still hide raw storage references and content;
- admin raw read is API-only, integrity-checked and audit-recorded;
- real S3/private bucket deployment evidence remains open if launch requires hosted object storage proof.

Current `H2` fulfillment status:

- migration `20260509001000_h2_fulfillment_delivery` added `OrderStatus.DELIVERED`, shipment metadata fields, `shippedAt` and `deliveredAt`;
- `POST /vendor/orders/:orderId/ship` now accepts optional `carrier`, `trackingNumber` and `metadata`;
- `POST /buyer/orders/:orderId/mark-delivered` moves `SHIPPED -> DELIVERED` while funds remain `HELD`;
- `POST /buyer/orders/:orderId/confirm-receipt` now supports `DELIVERED -> COMPLETED`, and still supports the old R1 `SHIPPED -> COMPLETED` shortcut for compatibility;
- `GET /buyer/orders/:orderId` and `GET /vendor/orders/:orderId` now include a scoped chronological `timeline` for payment-held, vendor confirm, vendor ship, buyer delivered and buyer completed lifecycle events;
- `npm run runtime:h2-fulfillment --workspace apps/api` passed with `H2-FULFILLMENT-01` through `H2-FULFILLMENT-06`;
- post-change `runtime:phase05` and full `runtime:r1` passed on `2026-05-09`;
- delivery timeout auto-complete now exists as local/operator command `npm run orders:auto-complete-delivered --workspace apps/api`;
- `npm run runtime:h2-delivery-timeout --workspace apps/api` passed with `H2-DELIVERY-TIMEOUT-01` through `H2-DELIVERY-TIMEOUT-04` on `2026-05-09`;
- vendor confirmation timeout auto-cancel now exists as local/operator command `npm run orders:auto-cancel-unconfirmed --workspace apps/api`;
- `npm run runtime:h2-confirmation-timeout --workspace apps/api` passed with `H2-CONFIRMATION-TIMEOUT-01` through `H2-CONFIRMATION-TIMEOUT-04` on `2026-05-09`;
- combined order maintenance now exists as local/operator command `npm run orders:run-maintenance --workspace apps/api`;
- `npm run runtime:h2-order-maintenance --workspace apps/api` passed with `H2-ORDER-MAINTENANCE-01` through `H2-ORDER-MAINTENANCE-04` on `2026-05-09`;
- pre-shipment cancellation stock return now exists for vendor cancel and confirmation-timeout auto-cancel;
- `npm run runtime:h2-cancel-stock --workspace apps/api` passed with `H2-CANCEL-STOCK-01` through `H2-CANCEL-STOCK-04` on `2026-05-09`;
- shipped refund stock policy now exists for dispute buyer-favor full refunds:
  - product stock remains unchanged after refund because the item has shipped and must go through return inspection before any restock;
  - audit/notification metadata carries `NO_AUTO_RESTOCK_AFTER_SHIPMENT`;
  - `npm run runtime:h2-return-stock --workspace apps/api` passed with `H2-RETURN-STOCK-01` through `H2-RETURN-STOCK-04` on `2026-05-09`;
  - post-change `runtime:phase06` regression passed;
- admin/backend ops endpoints now exist for summary, notification outbox filtering and failed notification requeue;
- admin order-maintenance ops endpoint now exists for dry-run backlog review and audited execute mode:
  - `npm run runtime:h2-admin-maintenance-ops --workspace apps/api` passed with `H2-ADMIN-MAINTENANCE-OPS-01` through `H2-ADMIN-MAINTENANCE-OPS-05` on `2026-05-09`;
  - post-change `runtime:h2-admin-ops` and `runtime:h2-rma-inspection` regressions passed;
- admin money ops endpoints now exist for reconciliation and failed provider execution visibility:
  - `npm run runtime:h2-admin-money-ops --workspace apps/api` passed with `H2-ADMIN-MONEY-OPS-01` through `H2-ADMIN-MONEY-OPS-05` on `2026-05-09`;
  - post-change `runtime:h2-admin-ops`, `runtime:h2-admin-maintenance-ops` and `runtime:h2-rma-inspection` regressions passed;
- admin worker/queue ops endpoints now exist for DB/config snapshots and actionable backlog counts:
  - `npm run runtime:h2-admin-worker-queue-ops --workspace apps/api` passed with `H2-ADMIN-WORKER-QUEUE-OPS-01` through `H2-ADMIN-WORKER-QUEUE-OPS-05` on `2026-05-09`;
  - post-change `runtime:h2-admin-ops`, `runtime:h2-admin-money-ops`, `runtime:h2-admin-maintenance-ops` and `runtime:h2-rma-inspection` regressions passed;
- durable worker heartbeat now exists for local/runtime liveness state:
  - `npm run runtime:h2-worker-heartbeat --workspace apps/api` passed with `H2-WORKER-HEARTBEAT-01` through `H2-WORKER-HEARTBEAT-05` on `2026-05-09`;
  - post-change `runtime:h1-email-worker-daemon`, `runtime:h2-order-maintenance-worker`, `runtime:h2-admin-worker-queue-ops` and `runtime:h2-admin-ops` regressions passed;
  - this is still not hosted/deployed worker liveness proof;
- money reconciliation now treats late provider events after expired checkout sessions with zero orders as matched safe no-op evidence;
- order timeline proof now exists for buyer/vendor order detail:
  - `npm run runtime:h2-order-timeline --workspace apps/api` passed with `H2-ORDER-TIMELINE-01` through `H2-ORDER-TIMELINE-05` on `2026-05-09`;
  - post-change `runtime:phase05` regression passed;
- post-change `runtime:phase05`, `runtime:h2-confirmation-timeout`, `runtime:h2-order-maintenance`, `runtime:h1-stock-reservation`, `runtime:h1-stock-expiry` and full `runtime:r1` passed on `2026-05-09`;
- maintained `runtime:phase05` now resets its seed-vendor product stock before checkout to avoid false failures on a non-clean DB after repeated stock-reservation checks;
- backend RMA inspection endpoints now exist for return-inspection queues and one-time restock/no-restock completion:
  - `npm run runtime:h2-rma-inspection --workspace apps/api` passed with `H2-RMA-INSPECTION-01` through `H2-RMA-INSPECTION-05` on `2026-05-09`;
  - post-change `runtime:h2-admin-ops` regression passed;
- remaining fulfillment hardening is deployed scheduler/cron wiring for the combined command, productized delivery evidence, polished admin UI, a dedicated timeline table if needed later, and deeper RMA UI/workflow automation if needed.

If later we want a stricter replay before launch claim:

- wipe runtime data;
- replay `Phase 00 -> Phase 06`;
- replace dev verification token fallback with real email delivery;
- replace dev KYC metadata/upload URL with real protected object storage;
- wire Meilisearch indexing and stronger media/search behavior;
- replace `dev_mock` payment adapter proof with real payment provider sandbox/dashboard proof;
- deploy/schedule the checkout expiry reaper instead of running it only as an operator command;
- deploy/schedule the delivery timeout auto-complete command instead of running it only as an operator command;
- deploy/schedule the vendor confirmation timeout auto-cancel command instead of running it only as an operator command;
- prefer scheduling `orders:run-maintenance` as the single order maintenance entrypoint if using one cron/job runner;
- deepen order history into a dedicated timeline table if API-derived audit timeline is not enough;
- build deeper RMA UI/workflow automation if return operations need more than the current backend inspection queue/completion evidence;
- replace `dev_mock` refund/payout/reconciliation/remediation proof with real provider sandbox/dashboard proof;
- re-record proof with a deeper pass.

## Read First

Any new AI session should read these files first, in this order:

1. [`CURRENT.md`](CURRENT.md)
2. [`README.md`](README.md)
3. [`tracking/design_status.md`](tracking/design_status.md)
4. [`tracking/implementation_status.md`](tracking/implementation_status.md)
5. [`source/context/substrate_reference.md`](source/context/substrate_reference.md)
6. [`source/context/domain_reference.md`](source/context/domain_reference.md)
7. [`source/planning/runtime_entry_gate.md`](source/planning/runtime_entry_gate.md)
8. [`execution/runtime/runtime_profiles.md`](execution/runtime/runtime_profiles.md)
9. [`source/planning/r1_closeout_hardening_plan.md`](source/planning/r1_closeout_hardening_plan.md)
10. [`execution/runtime/r1_replay_runbook.md`](execution/runtime/r1_replay_runbook.md)
11. [`execution/runtime/phase_06_disputes_money.md`](execution/runtime/phase_06_disputes_money.md)
12. [`execution/runtime/phase_05_orders.md`](execution/runtime/phase_05_orders.md)
13. [`execution/runtime/phase_04_checkout.md`](execution/runtime/phase_04_checkout.md)
14. [`execution/runtime/phase_03_catalog.md`](execution/runtime/phase_03_catalog.md)
15. [`execution/runtime/phase_02_vendor_gate.md`](execution/runtime/phase_02_vendor_gate.md)
16. [`source/design/business_requirements.md`](source/design/business_requirements.md)
17. [`source/design/user_journeys.md`](source/design/user_journeys.md)
18. [`source/design/functional_requirements.md`](source/design/functional_requirements.md)
19. [`source/design/architecture.md`](source/design/architecture.md)
20. [`source/design/tech_stack.md`](source/design/tech_stack.md)
21. [`source/planning/launch_roadmap.md`](source/planning/launch_roadmap.md)
22. [`source/planning/implementation_guide.md`](source/planning/implementation_guide.md)
23. [`source/planning/access_matrix.md`](source/planning/access_matrix.md)
24. [`source/planning/state_machines.md`](source/planning/state_machines.md)
25. [`source/planning/api_contracts.md`](source/planning/api_contracts.md)
26. [`source/planning/schema_drafts.md`](source/planning/schema_drafts.md)
27. [`source/planning/runtime_checklists.md`](source/planning/runtime_checklists.md)
28. [`source/planning/cut_register.md`](source/planning/cut_register.md)
29. [`source/planning/test_matrix.md`](source/planning/test_matrix.md)
30. [`source/planning/adr/README.md`](source/planning/adr/README.md)
31. [`source/planning/runtime_gate_review.md`](source/planning/runtime_gate_review.md)
32. [`execution/runtime/README.md`](execution/runtime/README.md)
33. existing HTML prototypes in [`prototypes/`](prototypes/)

## Do Not Do Yet

Do not do these things unless the user explicitly redirects:

- do not move `vendora_codebase/`
- do not silently convert the dev verification token fallback into a “completed email system” claim
- do not silently convert dev KYC document metadata into a “completed secure document storage” claim
- do not silently convert database-backed public search into a “completed Meilisearch integration” claim
- do not silently convert local/dev provider webhook into a “completed payment provider integration” claim
- do not silently convert the R1 order transition path into a completed fulfillment/timeline/timeout system claim
- do not silently convert internal refund/payout ledger evidence into completed provider refund/payout execution
- do not let closeout/hardening work erase the remaining auth/KYC/catalog/checkout gaps from status
- do not let closeout/hardening work erase the remaining order fulfillment or disputes/money gaps from status
- do not treat this unblock-pass proof as if it replaces the later deeper replay

## Current Interpretation of Status Files

- `source/planning/launch_roadmap.md` = launch sequencing
- `source/planning/implementation_guide.md` = phased implementation bridge into runtime
- `tracking/design_status.md` = artifact completion progress and artifact truth
- `tracking/implementation_status.md` = implementation/runtime fact
- `CURRENT.md` = temporary handoff during workflow migration

## Recommended Next Action

The strongest next action now is:

```text
run live external email provider proof, run live payment/refund/payout provider sandbox proof, wire deployed scheduler/cron for operator jobs, or choose the next `H1`/`H2` admin-ops hardening target from `source/planning/r1_closeout_hardening_plan.md`
```
