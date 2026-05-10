# Vendora — R1 Closeout And Hardening Plan

This artifact records what the completed `R1 unblock pass` means and what must happen next.

It does not replace:

- `tracking/implementation_status.md` for runtime fact;
- `launch_roadmap.md` for launch scope;
- `cut_register.md` for allowed cuts.

Its purpose is narrower:

```text
convert the completed Phase 00 -> Phase 06 R1 proof into an honest closeout and hardening queue,
without turning local/dev evidence into a launch-grade claim
```

---

## 1. Current Decision

```text
R1 numbered runtime phase pack is complete.
Launch-grade claim is not yet complete.
```

Runtime fact:

- `Phase 00` through `Phase 06` now have live R1 evidence or verified baseline.
- The core loop can be exercised end-to-end:
  - vendor approval
  - listing publish
  - buyer discovery
  - cart/checkout
  - payment-held order creation
  - order progression
  - dispute open
  - fund freeze
  - admin resolution
  - release/refund ledger evidence

Boundary:

- this is an unblock pass, not production readiness;
- current proof uses local/dev substitutes in several launch-sensitive places;
- the next work should be selected from hardening, replay, and launch-evidence needs, not invented as `phase_07`.

---

## 2. What R1 Proved

### Runtime Loop

R1 proved that the imported execution asset can support the launch-critical sequence at baseline depth:

1. buyer/vendor/admin identity boundaries exist;
2. vendor gate controls selling eligibility;
3. approved vendor listing can become buyer-visible;
4. buyer checkout creates vendor-specific held orders;
5. vendor and buyer order actions follow explicit R1 transitions;
6. dispute creation freezes disputed money state;
7. admin resolution creates vendor-favor release or buyer-favor refund evidence.

### Critical Invariants With Live Evidence

- tenant-scoped vendor reads;
- buyer self-scoped order reads;
- admin-only KYC/dispute review paths;
- direct order creation blocked after checkout was introduced;
- checkout idempotency and provider webhook replay safety;
- vendor-specific order split after payment finalization;
- dispute-triggered fund freeze;
- resolution-triggered release/refund fund state;
- audit events for KYC, orders, disputes and money-sensitive actions.

---

## 3. What R1 Did Not Prove

These are not failures. They are recorded limits of the chosen `R1 unblock pass`.

| Area | R1 Reality | Why It Still Matters |
|---|---|---|
| Email | dev verification token, no real transactional delivery | launch roadmap requires transactional emails |
| Sessions | JWT-only local session shape, no durable revocation | block/revoke/logout cannot be strongly enforced yet |
| KYC files | metadata/dev upload URL only | compliance/storage proof is not launch-grade |
| Search | database-backed public search | Meilisearch is running but not integrated |
| Media | no listing/KYC raw file storage path | product and compliance files remain incomplete |
| Payments | local/dev webhook finalizes payment | no real provider charge/session evidence |
| Refunds | internal fund/ledger state only | no provider refund execution evidence |
| Payouts | balance/ledger evidence only | vendor money return is not executed through provider/admin ops yet |
| Orders | local H2 proof now has `DELIVERED`, shipment metadata, delivery-timeout completion, vendor-confirmation-timeout cancellation, pre-shipment cancellation stock return, no-auto-restock-after-shipment refund policy, a combined maintenance entrypoint, admin-triggerable maintenance dry-run/execute endpoint, local durable worker heartbeat, worker/queue DB snapshot endpoints, API-level order timeline, first admin/backend ops endpoints and backend RMA inspection queue/completion | no deployed scheduler/cron, hosted/deployed worker liveness proof, polished admin UI, dedicated timeline table depth or deeper RMA UI/workflow automation |
| Disputes/Money Ops | API-first manual resolution plus backend ops visibility for reconciliation and failed refund/payout executions | local messages/evidence UI, vendor-response SLA command, worker entrypoint and admin-triggered dry-run/execute now exist; no hosted/deployed worker liveness, real provider dashboard/API evidence or polished admin UI; local partial refunds now runtime-checked |
| Notifications | no outbox/email proof | buyer/vendor/admin do not receive transactional messages |
| Replay | R1 scripts exist but are temporary | clean reset/replay discipline is not yet a stable harness |

---

## 4. Hardening Priority

### `H0` — Closeout Hygiene

Goal:

- preserve the R1 truth and make future work reset-friendly.

Work:

- keep `CURRENT.md` and `tracking/implementation_status.md` as canonical handoff;
- keep maintained Phase 01-04 runtime-check scripts under `apps/api/scripts/runtime`;
- keep Phase 05/06 maintained runtime-check bodies under `apps/api/scripts/runtime`;
- treat `tmp_phase05_check.mjs` and `tmp_phase06_check.mjs` as historical/compatibility copies only;
- document a clean-data replay command sequence for `Phase 00 -> Phase 06`;
- keep API stopped between verification runs.

Exit evidence:

- one documented replay path;
- one clear reset/reseed rule;
- status files still distinguish R1 proof from launch-grade readiness.

### `H1` — Launch-Blocking Evidence Gaps

Goal:

- close the gaps that are hard to honestly launch without.

Work:

- transactional email delivery for auth, checkout/order, KYC and dispute events:
  - durable local `NotificationOutbox` artifact/evidence path now exists;
  - local `dev_log` worker shell now exists and is runtime-checked;
  - Resend provider adapter code now exists and is runtime-checked against a local mock provider API;
  - live external provider delivery and dashboard/API evidence remain open;
- hosted/provider payment sandbox path replacing local/dev webhook as launch evidence:
  - local `dev_mock` payment provider adapter code now exists and is runtime-checked;
  - live Stripe/YooKassa/hosted provider dashboard/API evidence remains open;
- refund execution evidence for buyer-favor dispute outcomes:
  - local `dev_mock` refund provider execution table/path now exists and is runtime-checked;
  - local `dev_mock` partial refund path now exists and is runtime-checked, including vendor-remainder payout and reconciliation evidence;
  - live Stripe/YooKassa/hosted provider refund dashboard/API evidence remains open;
- payout execution path or explicitly controlled admin-assisted provider path:
  - local `dev_mock` payout provider execution table/path now exists and is runtime-checked;
  - live Stripe/YooKassa/hosted provider payout dashboard/API/reconciliation evidence remains open;
- money reconciliation evidence:
  - local/internal reconciliation run and item tables now exist and are runtime-checked against payment, refund and payout artifacts;
  - controlled local provider failures now remain review-safe and are surfaced to an admin-only provider-failures queue;
  - local operator retry/review endpoints now exist for failed refund and payout executions;
  - live provider dashboard/API reconciliation evidence remains open;
- protected object storage path for KYC raw documents with admin-only read audit.
  - local private storage path now exists with admin-only read audit;
  - hosted S3/private-bucket deployment evidence remains open if required for launch.

Exit evidence:

- provider dashboard or API evidence for charge/refund/payout;
- reconciliation run evidence, with live provider/dashboard evidence required before any launch-grade provider reconciliation claim;
- email artifacts or outbox records for launch-critical events;
- KYC raw-file storage and admin read path evidence.

### `H2` — Money And State Hardening

Goal:

- strengthen money/state correctness beyond the R1 happy path.

Work:

- stock decrement/reservation model:
  - local H1 `StockReservation` proof now exists for reserve, oversell prevention, payment-failure release, payment-success commit and webhook replay idempotency;
  - local H1 checkout expiry/reaper proof now exists for abandoned `AWAITING_PAYMENT` sessions;
  - remaining work is deployed scheduler/cron wiring and broader concurrency stress;
- `DELIVERED` state and shipment metadata:
  - local H2 proof now exists for optional carrier/tracking capture, buyer `SHIPPED -> DELIVERED`, buyer `DELIVERED -> COMPLETED` and audit evidence;
  - legacy R1 `SHIPPED -> COMPLETED` receipt shortcut remains for compatibility;
- delivery timeout completion:
  - local/operator command proof now exists for old `DELIVERED` orders moving to `COMPLETED` with held funds becoming `RELEASABLE`;
  - deployed scheduler/cron wiring remains open;
- vendor confirmation timeout:
  - local/operator command proof now exists for old `PAYMENT_HELD` orders moving to `CANCELLED` with held funds becoming `RETURNED_TO_BUYER`;
  - deployed scheduler/cron wiring remains open;
- combined order maintenance:
  - local/operator command proof now exists for one entrypoint running checkout expiry, vendor confirmation timeout and buyer delivery timeout in one replay-safe pass;
  - deployed scheduler/cron wiring remains open;
- pre-shipment cancellation stock return:
  - local proof now exists for vendor cancellation and confirmation-timeout auto-cancel restoring ordered product stock exactly once;
  - shipped buyer-favor refunds now explicitly do not auto-restock and require return inspection metadata;
  - full RMA workflow/inspection tooling remains open;
- productized admin UI for provider failures;
- automated tests for order/dispute/fund state machines.

Exit evidence:

- automated state-machine tests;
- DB evidence for timeout-safe transitions;
- reconciliation notes for fund state versus provider state.

### `H3` — Ops Productization

Goal:

- reduce manual/API-only operations without expanding target scope too early.

Work:

- minimal admin KYC review UI;
- minimal admin dispute queue/detail/resolve UI;
- vendor balance/history page;
- dispute messages/evidence metadata;
- vendor-response SLA escalation command;
- dispute SLA worker entrypoint and ops visibility;
- admin-triggered dispute SLA dry-run/execute;
- admin-triggered catalog search full-reindex;
- catalog search reindex worker entrypoint and ops visibility;
- catalog moderation suspend/approve lifecycle and minimal admin UI;
- basic listing media upload path;
- Meilisearch indexing integration if search quality becomes launch-critical.

Exit evidence:

- ops can execute required launch workflows without raw API calls;
- manual/hosted cuts remain explicit where still chosen.

---

## 5. Recommended Next Work Package

The strongest next work package is:

```text
H0 + H1 scoping pass
```

Why:

- R1 has enough runtime proof to stop adding new launch phases;
- the remaining launch risk is not more broad feature work;
- the highest-risk gaps are external evidence and operational hardening:
  - email,
  - provider money,
  - payout/refund,
  - protected files,
  - replay discipline.

Concrete next session shape:

1. create/choose clean replay strategy for current Docker-backed runtime;
2. run the maintained `npm run runtime:r1` replay or pick first launch-blocking provider integration target:
   - email,
   - payments/refunds,
   - payouts,
   - object storage;
3. implement only that slice to R1+ evidence depth;
4. update status files without changing the fact that Phase 00 -> Phase 06 already closed.

---

## 6. Guardrails

- Do not create `phase_07` unless the staged model is deliberately extended.
- Do not call local/dev webhook proof a real payment integration.
- Do not call internal `RETURNED_TO_BUYER` ledger state a real refund.
- Do not call `RELEASABLE` vendor balance a real payout.
- Do not call dev KYC document metadata secure document storage.
- Do not treat API-first admin operations as polished launch UX unless manual/admin-assisted launch is explicitly accepted for that operation.
- Do not wipe runtime data without deciding whether the goal is clean replay proof or local continuity.

---

## 7. Closeout Status

Current closeout status:

```text
R1 closeout planning created.
H0 replay runbook created at execution/runtime/r1_replay_runbook.md.
H0 stable Phase 01-04 runtime-check entrypoints created under apps/api/scripts/runtime.
H0 stable Phase 05/06 runtime-check bodies created under apps/api/scripts/runtime.
tmp_phase05_check.mjs and tmp_phase06_check.mjs remain historical/compatibility copies only.
H0 full local replay command added as npm run runtime:r1.
Non-clean live smoke on the current DB succeeded for runtime:phase01 through runtime:phase04.
Clean-data npm run runtime:r1 replay succeeded on 2026-05-08 after migrate reset, generate, seed, API build, web lint and web build.
API was stopped after replay and curl to 127.0.0.1:3001/health failed to connect as expected.
H1 notification outbox migration 20260508110000_h1_notification_outbox added durable email artifacts for auth, KYC, checkout/order and dispute events.
npm run runtime:h1-email succeeded with H1-EMAIL-01 through H1-EMAIL-04.
Earlier H1 email reset/reseed applied 7 migrations, then npm run runtime:h1-email and npm run runtime:r1 both succeeded on 2026-05-08.
H1 KYC private storage migration 20260508113000_h1_kyc_private_storage added raw-document byte storage, checksum evidence and admin-only read audit.
npm run runtime:h1-storage succeeded with H1-KYC-STORAGE-01 through H1-KYC-STORAGE-04.
Clean post-H1 reset/reseed applied 8 migrations, then npm run runtime:h1-email, npm run runtime:h1-storage and npm run runtime:r1 all succeeded on 2026-05-08.
H1 local email worker shell now drains NotificationOutbox through dev_log and records SENT/FAILED provider evidence.
npm run runtime:h1-email-worker succeeded with H1-EMAIL-WORKER-01 through H1-EMAIL-WORKER-03 on 2026-05-08.
H1 Resend adapter code now drains NotificationOutbox through an HTTP provider contract with EMAIL_PROVIDER=resend, RESEND_API_KEY, EMAIL_FROM and optional RESEND_API_BASE_URL.
npm run runtime:h1-email-provider succeeded against a local mock provider API with H1-EMAIL-PROVIDER-01 through H1-EMAIL-PROVIDER-03 on 2026-05-08.
H1 long-running NotificationOutbox worker entrypoint now exists as npm run notifications:worker, with loop interval, batch size, max-attempts and optional event/reference filters.
npm run runtime:h1-email-worker-daemon succeeded with H1-EMAIL-WORKER-DAEMON-01 through H1-EMAIL-WORKER-DAEMON-03 on 2026-05-09, followed by successful runtime:h1-email-worker and runtime:h1-email-provider regression checks.
H1 local payment provider adapter code now creates checkout session refs and parses signed provider webhooks through PAYMENT_PROVIDER=dev_mock.
npm run runtime:h1-payment-provider succeeded with H1-PAYMENT-PROVIDER-01 through H1-PAYMENT-PROVIDER-04 on 2026-05-08, followed by successful runtime:phase04 and runtime:r1 regression at 13:26 MSK +0300.
H1 refund provider execution migration 20260508133000_h1_refund_provider_execution added RefundProviderExecution evidence for buyer-favor dispute refunds.
npm run runtime:h1-refund-provider succeeded with H1-REFUND-PROVIDER-01 through H1-REFUND-PROVIDER-03 on 2026-05-08, followed by successful runtime:phase06 and runtime:r1 regression at 13:40 MSK +0300.
H1 payout provider execution migration 20260508134500_h1_payout_provider_execution added PayoutProviderExecution evidence, PAID_OUT fund state and PAID_OUT vendor ledger entries.
npm run runtime:h1-payout-provider succeeded with H1-PAYOUT-PROVIDER-01 through H1-PAYOUT-PROVIDER-04 on 2026-05-08, followed by successful runtime:phase05, runtime:phase06 and runtime:r1 regression at 20:34 MSK +0300.
H1 money reconciliation migration 20260508144000_h1_money_reconciliation added MoneyReconciliationRun and MoneyReconciliationItem evidence over payment, refund and payout artifacts.
npm run runtime:h1-money-reconciliation succeeded with H1-MONEY-RECON-01 through H1-MONEY-RECON-03 on 2026-05-08, followed by successful runtime:r1 regression at 20:50 MSK +0300.
H1 money failure-recovery migration 20260508152000_h1_money_failure_recovery added PAYOUT_FAILED_REVIEW fund state and controlled failure evidence for refund/payout provider paths.
npm run runtime:h1-money-failure-recovery succeeded with H1-MONEY-FAILURE-01 through H1-MONEY-FAILURE-04, followed by successful runtime:h1-money-reconciliation and runtime:r1 regression.
H1 partial refund migration 20260508160000_h1_partial_refunds added BUYER_FAVOR_PARTIAL_REFUND and OrderFund.refundedAmountMinor.
npm run runtime:h1-partial-refund succeeded with H1-PARTIAL-REFUND-01 through H1-PARTIAL-REFUND-04 on 2026-05-08, followed by successful runtime:h1-refund-provider, runtime:h1-payout-provider, runtime:h1-money-failure-recovery, runtime:h1-money-reconciliation and runtime:r1 regression by 21:31 MSK +0300.
H1 money remediation migration 20260508164000_h1_money_remediation added review metadata and admin-only retry/review endpoints for failed refund and payout provider executions.
npm run runtime:h1-money-remediation succeeded with H1-MONEY-REMEDIATION-01 through H1-MONEY-REMEDIATION-05 on 2026-05-08, followed by successful runtime:h1-money-failure-recovery, runtime:h1-money-reconciliation, runtime:h1-partial-refund and runtime:r1 regression by 21:47 MSK +0300.
H1 stock reservation migration 20260508171000_h1_stock_reservation added StockReservation evidence and available-stock decrement at checkout session creation.
npm run runtime:h1-stock-reservation succeeded with H1-STOCK-RESERVATION-01 through H1-STOCK-RESERVATION-05 on 2026-05-08, followed by successful runtime:phase04 and runtime:r1 regression.
H1 checkout expiry/reaper migration 20260508173000_h1_checkout_expiry_reaper added CheckoutSession.expiresAt and npm run checkout:expire.
npm run runtime:h1-stock-expiry succeeded with H1-STOCK-EXPIRY-01 through H1-STOCK-EXPIRY-05 on 2026-05-08, followed by successful runtime:h1-stock-reservation, runtime:phase04 and runtime:r1 regression.
H2 fulfillment delivery migration 20260509001000_h2_fulfillment_delivery added OrderStatus.DELIVERED and shipment metadata fields.
npm run runtime:h2-fulfillment succeeded with H2-FULFILLMENT-01 through H2-FULFILLMENT-06 on 2026-05-09, followed by successful runtime:phase05 and runtime:r1 regression on API port 3002.
H2 delivery timeout operator command npm run orders:auto-complete-delivered now completes old DELIVERED orders with HELD funds, releases funds to RELEASABLE, writes ORDER_AUTO_COMPLETED_DELIVERY_TIMEOUT audit evidence and enqueues buyer/vendor notification outbox records.
npm run runtime:h2-delivery-timeout succeeded with H2-DELIVERY-TIMEOUT-01 through H2-DELIVERY-TIMEOUT-04 on 2026-05-09, followed by successful runtime:h2-fulfillment, runtime:phase05 and runtime:r1 regression on API port 3002.
H2 vendor confirmation timeout operator command npm run orders:auto-cancel-unconfirmed now cancels old PAYMENT_HELD orders with HELD funds, returns funds to RETURNED_TO_BUYER, writes ORDER_AUTO_CANCELLED_CONFIRMATION_TIMEOUT audit evidence, blocks late vendor confirm and enqueues buyer/vendor notification outbox records.
npm run runtime:h2-confirmation-timeout succeeded with H2-CONFIRMATION-TIMEOUT-01 through H2-CONFIRMATION-TIMEOUT-04 on 2026-05-09, followed by successful runtime:h2-delivery-timeout, runtime:h2-fulfillment, runtime:phase05 and runtime:r1 regression on API port 3002.
H2 combined order maintenance command npm run orders:run-maintenance now runs checkout expiry, vendor confirmation timeout auto-cancel and delivery timeout auto-complete in one local/operator entrypoint.
npm run runtime:h2-order-maintenance succeeded with H2-ORDER-MAINTENANCE-01 through H2-ORDER-MAINTENANCE-04 on 2026-05-09, followed by successful runtime:h2-confirmation-timeout, runtime:h2-delivery-timeout, runtime:h1-stock-expiry and runtime:r1 regression on API port 3002.
H2 order maintenance worker command npm run orders:maintenance-worker now runs the same combined maintenance service in a long-running loop with interval and idle-stop controls.
npm run runtime:h2-order-maintenance-worker succeeded with H2-ORDER-MAINTENANCE-WORKER-01 through H2-ORDER-MAINTENANCE-WORKER-03 on 2026-05-09, and a safe now=1970 one-shot orders:run-maintenance smoke returned clean JSON after the shared-service refactor.
Full npm run runtime:h2-order-maintenance regression also passed after the shared-service refactor using RUNTIME_API_URL=http://127.0.0.1:3002; API was stopped afterward.
Local Compose workers profile now wires notification-worker and order-maintenance-worker. docker compose --profile workers config passed, and one-shot docker compose run smoke checks passed for both worker services on 2026-05-09. This is local container wiring proof, not hosted/deployed scheduler evidence.
H2 pre-shipment cancellation stock return now restores ordered product stock for vendor cancellation and confirmation-timeout auto-cancel, with returnedStockQuantity audit metadata.
npm run runtime:h2-cancel-stock succeeded with H2-CANCEL-STOCK-01 through H2-CANCEL-STOCK-04 on 2026-05-09, followed by successful runtime:phase05, runtime:h2-confirmation-timeout, runtime:h2-order-maintenance, runtime:h1-stock-reservation, runtime:h1-stock-expiry and runtime:r1 regression on API port 3002.
H2 order timeline now exists on buyer/vendor order detail, derived from durable order AuditEvent rows plus ORDER_PAYMENT_HELD. npm run runtime:h2-order-timeline succeeded with H2-ORDER-TIMELINE-01 through H2-ORDER-TIMELINE-05 on 2026-05-09, followed by successful runtime:phase05 regression on API port 3002.
H2 shipped/return stock policy now records NO_AUTO_RESTOCK_AFTER_SHIPMENT, restockedQuantity=0 and returnInspectionRequired=true for buyer-favor refunds after shipment. npm run runtime:h2-return-stock succeeded with H2-RETURN-STOCK-01 through H2-RETURN-STOCK-04 on 2026-05-09, followed by successful runtime:phase06 regression on API port 3002.
H2 admin/backend ops endpoints now expose /admin/ops/summary, /admin/ops/notifications and /admin/ops/notifications/:notificationId/retry. npm run runtime:h2-admin-ops succeeded with H2-ADMIN-OPS-01 through H2-ADMIN-OPS-05 on 2026-05-09. Money reconciliation now treats late provider events after expired checkout sessions with no orders as matched safe no-op evidence; money:reconcile and runtime:h1-money-failure-recovery passed after the fix.
H2 backend RMA inspection endpoints now expose /admin/ops/return-inspections and /admin/ops/return-inspections/:disputeId/complete. npm run runtime:h2-rma-inspection succeeded with H2-RMA-INSPECTION-01 through H2-RMA-INSPECTION-05 on 2026-05-09, followed by successful runtime:h2-admin-ops regression on API port 3002. This is backend/admin API proof with durable audit evidence, not polished admin UI proof.
H2 admin order-maintenance ops endpoint now exposes /admin/ops/order-maintenance/run for dry-run backlog review and audited execute mode using the same shared maintenance service as the CLI/worker path. npm run runtime:h2-admin-maintenance-ops succeeded with H2-ADMIN-MAINTENANCE-OPS-01 through H2-ADMIN-MAINTENANCE-OPS-05 on 2026-05-09, followed by successful runtime:h2-admin-ops and runtime:h2-rma-inspection regressions on API port 3002. This is local/backend ops proof, not deployed scheduler evidence.
H2 admin money ops endpoints now expose /admin/ops/money/reconciliation and /admin/ops/money/failures for reconciliation run/item visibility and normalized failed refund/payout provider execution review. npm run runtime:h2-admin-money-ops succeeded with H2-ADMIN-MONEY-OPS-01 through H2-ADMIN-MONEY-OPS-05 on 2026-05-09, followed by successful runtime:h2-admin-ops, runtime:h2-admin-maintenance-ops and runtime:h2-rma-inspection regressions on API port 3002. This is local/backend ops visibility, not live provider dashboard/API proof.
H2 admin worker/queue ops endpoints now expose /admin/ops/workers and /admin/ops/queues for notification worker/order maintenance worker DB/config snapshots and aggregate actionable backlog counts. npm run runtime:h2-admin-worker-queue-ops succeeded with H2-ADMIN-WORKER-QUEUE-OPS-01 through H2-ADMIN-WORKER-QUEUE-OPS-05 on 2026-05-09, followed by successful runtime:h2-admin-ops, runtime:h2-admin-money-ops, runtime:h2-admin-maintenance-ops and runtime:h2-rma-inspection regressions on API port 3002. This is read-only local/backend ops visibility, not hosted/deployed worker liveness proof.
H2 durable worker heartbeat now exists through migration 20260509120000_h2_worker_heartbeat. Notification and order-maintenance worker entrypoints write WorkerHeartbeat RUNNING/STOPPED/ERROR state with instance ID, run counts, processed counts, idle runs and timestamps; /admin/ops/workers surfaces latest heartbeat instances and marks old RUNNING rows as STALE. npm run runtime:h2-worker-heartbeat succeeded with H2-WORKER-HEARTBEAT-01 through H2-WORKER-HEARTBEAT-05 on 2026-05-09, followed by successful runtime:h1-email-worker-daemon, runtime:h2-order-maintenance-worker, runtime:h2-admin-worker-queue-ops and runtime:h2-admin-ops regressions on API port 3002. This is local/runtime heartbeat proof, not hosted/deployed worker liveness proof.
H3 dispute messages/evidence metadata now exists through migration 20260510110000_h3_dispute_messages_evidence. Buyer dispute creation and vendor dispute response write durable DisputeMessage rows and optional DisputeEvidence metadata rows; admin/buyer/vendor UI surfaces those rows. Maintained runtime:phase06 now includes R1-DISP-04 and passed on 2026-05-10. This is metadata/UI proof, not raw dispute evidence file storage.
H3 basic listing media now exists through migration 20260510113000_h3_product_media_metadata. Vendor listing/product creation accepts validated local inline image media, ProductMedia rows are returned through vendor/public catalog responses, and vendor/buyer web UI renders thumbnails. Maintained runtime:phase03 now includes R1-CAT-08 and passed on 2026-05-10. This is local DB-backed inline media proof, not hosted object storage/CDN/image processing.
H3 local Meilisearch indexing now exists through a catalog search adapter and `npm run catalog:reindex-search --workspace apps/api`. `npm run runtime:h3-catalog-search --workspace apps/api` passed with H3-CATALOG-SEARCH-01 and H3-CATALOG-SEARCH-02 on 2026-05-10, verifying buyer-visible indexing and exclusion of draft/blocked-vendor products. This is local indexing proof with DB fallback, not hosted search operations or reindex scheduling.
H3 admin-triggered catalog search reindex now exists through `POST /admin/ops/catalog-search/reindex` and admin ops UI controls. Catalog reindex now replaces the full Meilisearch document set instead of only appending/upserting. `npm run runtime:h3-catalog-search-ops --workspace apps/api` passed with H3-CATALOG-SEARCH-OPS-01 through H3-CATALOG-SEARCH-OPS-05 on 2026-05-10, verifying admin-only access, dry-run no-mutation behavior, execute-mode reindex, stale document removal and durable `ADMIN_CATALOG_SEARCH_REINDEX` audit evidence. This is local/admin ops proof, not hosted search operations or scheduled reindex proof.
H3 catalog search worker now exists through `npm run catalog:search-worker --workspace apps/api`, Docker Compose `catalog-search-worker` in the `workers` profile and admin ops worker visibility. `npm run runtime:h3-catalog-search-worker --workspace apps/api` passed with H3-CATALOG-SEARCH-WORKER-01 through H3-CATALOG-SEARCH-WORKER-04 on 2026-05-10, and `docker compose --profile workers config` passed. This is local worker wiring and heartbeat proof, not hosted/deployed search worker liveness proof.
H3 catalog moderation lifecycle now exists through migration 20260510130000_h3_product_moderation, admin-only `/admin/catalog/listings` and `/admin/catalog/listings/:id/moderate`, and minimal `/admin/catalog` UI controls. Public catalog/detail paths and Meilisearch indexing now require `moderationStatus=APPROVED`, and single-product Meilisearch sync/delete waits for task completion. `npm run runtime:h3-catalog-moderation --workspace apps/api` passed with H3-CATALOG-MOD-01 through H3-CATALOG-MOD-05 on 2026-05-10, followed by successful `runtime:phase03` and `runtime:h3-catalog-search` regressions. This is local moderation lifecycle proof, not rich policy/appeals workflow or hosted moderation ops proof.
H3 raw dispute evidence storage now exists through migration 20260510120000_h3_dispute_evidence_storage. Buyer/vendor dispute evidence can store raw bytes in local private storage, admin-only read verifies size/checksum and writes DISPUTE_EVIDENCE_OBJECT_READ audit evidence, and maintained runtime:phase06 now includes R1-DISP-05. This is local protected-storage proof, not hosted private-bucket evidence.
H3 vendor-response SLA escalation now exists through `npm run disputes:auto-escalate-vendor-response --workspace apps/api`. `npm run runtime:h3-dispute-sla --workspace apps/api` passed with H3-DISPUTE-SLA-01 through H3-DISPUTE-SLA-04 on 2026-05-10, verifying overdue-only escalation, system message/audit/outbox evidence and replay safety. This is local command proof, not deployed scheduler/cron or polished escalation workflow proof.
H3 dispute SLA worker now exists through `npm run disputes:sla-worker --workspace apps/api`, Docker Compose `dispute-sla-worker` in the `workers` profile and admin ops worker/queue visibility. `npm run runtime:h3-dispute-sla-worker --workspace apps/api` passed with H3-DISPUTE-SLA-WORKER-01 through H3-DISPUTE-SLA-WORKER-04 on 2026-05-10, and `docker compose --profile workers config` passed. This is local worker wiring and heartbeat proof, not hosted/deployed worker liveness proof.
H3 admin-triggered dispute SLA ops now exists through `POST /admin/ops/dispute-sla/run` and admin ops UI controls. `npm run runtime:h3-dispute-sla-ops --workspace apps/api` passed with H3-DISPUTE-SLA-OPS-01 through H3-DISPUTE-SLA-OPS-05 on 2026-05-10, verifying admin-only access, dry-run no-mutation behavior, execute-mode escalation, durable `ADMIN_DISPUTE_SLA_RUN` audit evidence and replay safety. This is local/admin ops proof, not hosted/deployed scheduler or polished case-management workflow proof.
Post-commit audit passed on 2026-05-10 after commits efbff92, 643e6b2 and 140c96b: `npm run runtime:r1 --workspace apps/api`, `npm run runtime:h3-catalog-moderation --workspace apps/api`, `npm run runtime:h3-catalog-search --workspace apps/api`, `npm run runtime:h3-catalog-search-ops --workspace apps/api`, `npm run runtime:h3-catalog-search-worker --workspace apps/api`, `npm run runtime:h3-dispute-sla --workspace apps/api`, `npm run runtime:h3-dispute-sla-worker --workspace apps/api`, `npm run runtime:h3-dispute-sla-ops --workspace apps/api`, `npm run build --workspace apps/api`, `npm run lint --workspace apps/web`, `npm run build --workspace apps/web` and `npx prisma migrate status`.
Next action: run live external email provider proof, run live payment/refund/payout provider sandbox proof, wire deployed scheduler/cron for operator jobs including SLA escalation, or choose the next H1/H2 admin-ops target without upgrading local/dev proof into launch-grade claims.
```
