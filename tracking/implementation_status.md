# Vendora — Implementation Status

Этот файл фиксирует implementation/runtime факт в новой staged model.

`source/planning/implementation_guide.md` остаётся roadmap-артефактом.
Этот файл отвечает на другой вопрос:

```text
что реально известно про текущий execution asset,
какая runtime phase уже доказана живым прогоном,
и что exact можно брать следующим,
не смешивая unblock-pass с финальным launch claim
```

---

## 1. Workflow Position

- Current stage: `Runtime Realization`
- Runtime mode: `R1 unblock pass`
- Runtime gate state: `entered`
- Imported execution asset: `../vendora_codebase/`
- Chosen runtime depth: `R1`
- Highest verified runtime phase: `Phase 06 — Disputes And Money` for the current unblock pass
- Exact next runtime phase: none; the numbered `R1` runtime phase pack is complete
- Exact next planning artifact: [`source/planning/r1_closeout_hardening_plan.md`](../source/planning/r1_closeout_hardening_plan.md)
- Exact next replay artifact: [`execution/runtime/r1_replay_runbook.md`](../execution/runtime/r1_replay_runbook.md)
- H0 replay hardening progress: stable Phase 01-06 runtime-check entrypoints now exist in `vendora_codebase/apps/api/scripts/runtime/`

Important:

- current `R1` work is intentionally reset-friendly and may later be replayed from clean runtime data;
- `Phase 01` through `Phase 06` are now strong enough to stop blocking downstream runtime work;
- this does not yet equal a final launch-grade auth/KYC/catalog/search/payment/orders/disputes-money claim;
- remaining auth, KYC, catalog, checkout, orders and disputes/money gaps are explicitly recorded below instead of hidden behind the new verified state.
- `r1_closeout_hardening_plan.md` now converts those gaps into `H0` through `H3` hardening lanes without creating a fake `phase_07`.
- `r1_replay_runbook.md` now records the maintained full replay command and the fresh clean-data `runtime:r1` replay executed on `2026-05-08`.
- Phase 01-04 maintained runtime-check scripts now live under `vendora_codebase/apps/api/scripts/runtime/`.
- Phase 05/06 maintained runtime-check bodies now live under `vendora_codebase/apps/api/scripts/runtime/`; `tmp_phase05_check.mjs` and `tmp_phase06_check.mjs` remain historical/compatibility copies only.
- `npm run runtime:r1 --workspace apps/api` is now the stable command for the maintained Phase 01-06 local replay harness when the API is running.
- `npm run runtime:r1-partial --workspace apps/api` remains available for the Phase 05/06 replay subset.
- `npm run db:migrate:status:compose` now provides the stable Docker-network Prisma migration-status check when host-side access to the published Postgres port is unreliable.
- API build succeeded after the replay-harness additions.
- Non-clean live smoke on the current DB succeeded for `runtime:phase01` through `runtime:phase04`.
- Clean-data replay succeeded on `2026-05-08 12:09 MSK +0300` after `npx prisma migrate reset --force`, `npx prisma generate`, `npm run seed`, API build, web lint and web build.
- `npm run runtime:r1` returned `ok: true` for the maintained Phase 01-06 check entrypoints and covered `R1-AUTH-*`, `R1-KYC-*`, `R1-CAT-*`, `R1-CHK-*`, `R1-ORD-*`, `R1-DISP-*`, `R1-MONEY-*` and `R1-AUDIT-01`.
- API was stopped after clean replay verification; `curl http://127.0.0.1:3001/health` failed to connect afterward.
- The full clean-data `runtime:r1` replay is now recorded as local/dev proof only; launch-grade external-provider proof remains open.
- First `H1` hardening target started with durable transactional notification outbox evidence:
  - migration `20260508110000_h1_notification_outbox`;
  - `NotificationOutbox` records launch-critical email artifacts for auth, KYC, checkout/order and dispute events;
  - runtime command `npm run runtime:h1-email --workspace apps/api` passed with `H1-EMAIL-01` through `H1-EMAIL-04`;
  - local `dev_log` worker shell command `npm run runtime:h1-email-worker --workspace apps/api` passed with `H1-EMAIL-WORKER-01` through `H1-EMAIL-WORKER-03` on `2026-05-08 12:54 MSK +0300`;
  - Resend adapter command `npm run runtime:h1-email-provider --workspace apps/api` passed against a local mock provider API with `H1-EMAIL-PROVIDER-01` through `H1-EMAIL-PROVIDER-03` on `2026-05-08 13:03 MSK +0300`;
  - long-running worker command `npm run notifications:worker --workspace apps/api` now exists, and `npm run runtime:h1-email-worker-daemon --workspace apps/api` passed with `H1-EMAIL-WORKER-DAEMON-01` through `H1-EMAIL-WORKER-DAEMON-03` on `2026-05-09`;
  - clean post-H1 reset/reseed applied 8 migrations, then `runtime:h1-email`, `runtime:h1-storage` and `runtime:r1` all passed on `2026-05-08 12:37 MSK +0300`.
- This closes the local outbox/evidence, worker-shell, long-running worker entrypoint and Resend adapter-code parts of the email gap only; live external provider delivery and provider dashboard/API evidence remain open.
- H1 payment provider adapter-code proof now exists:
  - checkout creation uses `PAYMENT_PROVIDER=dev_mock` adapter code for provider session refs;
  - payment webhook signature parsing uses the payment provider adapter instead of route-local hard-coding;
  - runtime command `npm run runtime:h1-payment-provider --workspace apps/api` passed with `H1-PAYMENT-PROVIDER-01` through `H1-PAYMENT-PROVIDER-04`;
  - post-change `runtime:phase04` and full `runtime:r1` both passed on `2026-05-08 13:26 MSK +0300`.
- This closes only the local payment adapter-code/mock-contract part of the payment gap; live Stripe/YooKassa/hosted provider charge/session dashboard/API evidence remains open.
- H1 refund provider execution-code proof now exists:
  - migration `20260508133000_h1_refund_provider_execution` added `RefundProviderExecution`;
  - buyer-favor dispute resolution creates `REFUND_PROVIDER=dev_mock` execution evidence aligned with `RETURNED_TO_BUYER` fund state and `REFUNDED` ledger state;
  - vendor-favor dispute resolution does not create refund execution and still releases funds to `RELEASABLE`;
  - runtime command `npm run runtime:h1-refund-provider --workspace apps/api` passed with `H1-REFUND-PROVIDER-01` through `H1-REFUND-PROVIDER-03`;
  - post-change `runtime:phase06` and full `runtime:r1` both passed on `2026-05-08 13:40 MSK +0300`.
- This closes only the local refund adapter-code/mock-execution part of the refund gap; live Stripe/YooKassa/hosted provider refund dashboard/API evidence remains open.
- H1 partial refund local/internal proof now exists:
  - migration `20260508160000_h1_partial_refunds` added `BUYER_FAVOR_PARTIAL_REFUND` and `OrderFund.refundedAmountMinor`;
  - invalid partial refund amounts are rejected while dispute/fund state remains review-safe;
  - valid partial refund creates `REFUND_PROVIDER=dev_mock` provider evidence for only the requested amount;
  - fund/ledger evidence splits buyer refund amount from vendor-releasable remainder;
  - payout drain pays only the vendor remainder after partial refund;
  - reconciliation matches partial refund and partial-remainder payout evidence;
  - runtime command `npm run runtime:h1-partial-refund --workspace apps/api` passed with `H1-PARTIAL-REFUND-01` through `H1-PARTIAL-REFUND-04`;
  - post-change `runtime:h1-refund-provider`, `runtime:h1-payout-provider`, `runtime:h1-money-failure-recovery`, `runtime:h1-money-reconciliation` and full `runtime:r1` all passed by `2026-05-08 21:31 MSK +0300`.
- This closes only local/dev partial refund evidence; live provider dashboard/API partial-refund evidence remains open.
- H1 payout provider execution-code proof now exists:
  - migration `20260508134500_h1_payout_provider_execution` added `PayoutProviderExecution`, `OrderFundStatus.PAID_OUT` and `VendorLedgerEntryType.PAID_OUT`;
  - `PAYOUT_PROVIDER=dev_mock` drain command creates provider payout evidence for `RELEASABLE` funds and marks funds `PAID_OUT`;
  - replaying the payout drain does not duplicate provider payout execution;
  - vendor balance now reports `paidOutMinor` separately from `releasableMinor`;
  - runtime command `npm run runtime:h1-payout-provider --workspace apps/api` passed with `H1-PAYOUT-PROVIDER-01` through `H1-PAYOUT-PROVIDER-04`;
  - post-change `runtime:phase05`, `runtime:phase06` and full `runtime:r1` all passed on `2026-05-08 20:34 MSK +0300`.
- This closes only the local payout adapter-code/mock-execution part of the payout gap; live Stripe/YooKassa/hosted provider payout dashboard/API/reconciliation evidence remains open.
- H1 money reconciliation local/internal proof now exists:
  - migration `20260508144000_h1_money_reconciliation` added `MoneyReconciliationRun` and `MoneyReconciliationItem`;
  - command `npm run money:reconcile --workspace apps/api` persists payment/refund/payout reconciliation runs and item-level match evidence;
  - runtime command `npm run runtime:h1-money-reconciliation --workspace apps/api` passed with `H1-MONEY-RECON-01` through `H1-MONEY-RECON-03`;
  - post-change full `runtime:r1` passed on `2026-05-08 20:50 MSK +0300`.
- This closes only local reconciliation over local `dev_mock` provider artifacts; live provider dashboard/API reconciliation evidence remains open.
- H1 money failure-recovery local/internal proof now exists:
  - migration `20260508152000_h1_money_failure_recovery` added `OrderFundStatus.PAYOUT_FAILED_REVIEW`;
  - failed refund provider execution persists `FAILED` evidence while dispute remains `PLATFORM_REVIEW` and funds remain `FROZEN_DISPUTE`;
  - failed payout provider execution persists `FAILED` evidence while funds move to `PAYOUT_FAILED_REVIEW` with no paid-out ledger;
  - admin-only `GET /admin/money/provider-failures` exposes failed refund and payout executions;
  - reconciliation treats controlled provider failures as matched operational evidence;
  - runtime command `npm run runtime:h1-money-failure-recovery --workspace apps/api` passed with `H1-MONEY-FAILURE-01` through `H1-MONEY-FAILURE-04`;
  - post-change `runtime:h1-money-reconciliation` and full `runtime:r1` both passed.
- This closes only local/dev failure-recovery evidence; live provider dashboard/API failure evidence remains open.
- H1 money remediation local/internal proof now exists:
  - migration `20260508164000_h1_money_remediation` added review metadata to refund and payout provider executions;
  - admin-only retry endpoints now exist for failed refund and payout executions;
  - admin-only mark-reviewed endpoints persist review note/actor/time and write audit evidence;
  - failed refund retry completes dispute/order/fund state, writes refund ledger evidence and clears failure state;
  - failed payout retry moves funds to `PAID_OUT`, writes paid-out ledger evidence and clears failure state;
  - runtime command `npm run runtime:h1-money-remediation --workspace apps/api` passed with `H1-MONEY-REMEDIATION-01` through `H1-MONEY-REMEDIATION-05`;
  - post-change `runtime:h1-money-failure-recovery`, `runtime:h1-money-reconciliation`, `runtime:h1-partial-refund` and full `runtime:r1` all passed by `2026-05-08 21:47 MSK +0300`.
- This closes only local/dev operator remediation evidence; live provider dashboard/API remediation evidence remains open.
- H1 stock reservation/decrement local proof now exists:
  - migration `20260508171000_h1_stock_reservation` added `StockReservation` and `StockReservationStatus`;
  - checkout session creation atomically decrements available `Product.stock` and persists `RESERVED` reservation rows;
  - payment failure releases reserved stock and marks reservations `RELEASED`;
  - payment success marks reservations `COMMITTED` and creates orders without double-decrementing stock;
  - provider webhook replay does not duplicate orders or mutate committed stock again;
  - runtime command `npm run runtime:h1-stock-reservation --workspace apps/api` passed with `H1-STOCK-RESERVATION-01` through `H1-STOCK-RESERVATION-05`;
  - post-change `runtime:phase04` and full `runtime:r1` both passed on `2026-05-08`.
- H1 checkout expiry/reaper local proof now exists:
  - migration `20260508173000_h1_checkout_expiry_reaper` added `CheckoutSession.expiresAt`;
  - command `npm run checkout:expire --workspace apps/api` expires abandoned `AWAITING_PAYMENT` checkout sessions with reserved stock;
  - expiry marks reservations `RELEASED`, restores available `Product.stock` and marks the checkout session `EXPIRED`;
  - replaying the expiry command does not release stock twice;
  - late provider success/failure after expiry is a safe no-op and cannot create orders or re-consume stock;
  - runtime command `npm run runtime:h1-stock-expiry --workspace apps/api` passed with `H1-STOCK-EXPIRY-01` through `H1-STOCK-EXPIRY-05`;
  - post-change `runtime:h1-stock-reservation`, `runtime:phase04` and full `runtime:r1` all passed on `2026-05-08`.
- This closes only local/dev reservation/decrement/expiry evidence; deployed scheduler/cron wiring and broader concurrency stress remain open.
- H2 fulfillment/delivery local proof now exists:
  - migration `20260509001000_h2_fulfillment_delivery` added `OrderStatus.DELIVERED`, shipment metadata fields, `shippedAt` and `deliveredAt`;
  - vendor ship now captures optional carrier/tracking/metadata evidence;
  - buyer delivery confirmation moves `SHIPPED -> DELIVERED` while funds remain `HELD`;
  - buyer receipt completes `DELIVERED -> COMPLETED` and moves funds to `RELEASABLE`;
  - legacy R1 buyer receipt from `SHIPPED -> COMPLETED` remains compatible;
  - runtime command `npm run runtime:h2-fulfillment --workspace apps/api` passed with `H2-FULFILLMENT-01` through `H2-FULFILLMENT-06`;
  - post-change `runtime:phase05` and full `runtime:r1` passed on `2026-05-09` using `RUNTIME_API_URL=http://127.0.0.1:3002` because port `3001` was occupied by a non-Vendora service.
- H2 delivery timeout local/operator proof now exists:
  - command `npm run orders:auto-complete-delivered --workspace apps/api` completes old `DELIVERED` orders with `HELD` funds;
  - auto-completion moves orders to `COMPLETED`, moves funds to `RELEASABLE`, writes audit evidence and enqueues buyer/vendor notification outbox records;
  - replaying the command does not complete or release funds twice;
  - runtime command `npm run runtime:h2-delivery-timeout --workspace apps/api` passed with `H2-DELIVERY-TIMEOUT-01` through `H2-DELIVERY-TIMEOUT-04`;
  - post-change `runtime:h2-fulfillment`, `runtime:phase05` and full `runtime:r1` passed on `2026-05-09` using `RUNTIME_API_URL=http://127.0.0.1:3002`.
- H2 vendor confirmation timeout local/operator proof now exists:
  - command `npm run orders:auto-cancel-unconfirmed --workspace apps/api` cancels old `PAYMENT_HELD` orders with `HELD` funds;
  - auto-cancellation moves orders to `CANCELLED`, moves funds to `RETURNED_TO_BUYER`, writes audit evidence and enqueues buyer/vendor notification outbox records;
  - replaying the command does not cancel or return funds twice;
  - late vendor confirmation after auto-cancel is blocked by order state;
  - runtime command `npm run runtime:h2-confirmation-timeout --workspace apps/api` passed with `H2-CONFIRMATION-TIMEOUT-01` through `H2-CONFIRMATION-TIMEOUT-04`;
  - post-change `runtime:h2-delivery-timeout`, `runtime:h2-fulfillment`, `runtime:phase05` and full `runtime:r1` passed on `2026-05-09` using `RUNTIME_API_URL=http://127.0.0.1:3002`.
- H2 order maintenance local/operator proof now exists:
  - command `npm run orders:run-maintenance --workspace apps/api` runs checkout expiry, vendor confirmation timeout auto-cancel and delivery timeout auto-complete in one pass;
  - first run expires abandoned checkout reservations, cancels old unconfirmed held orders and completes old delivered held orders;
  - replaying the combined command is a no-op across all three jobs;
  - runtime command `npm run runtime:h2-order-maintenance --workspace apps/api` passed with `H2-ORDER-MAINTENANCE-01` through `H2-ORDER-MAINTENANCE-04`;
  - post-change `runtime:h2-confirmation-timeout`, `runtime:h2-delivery-timeout`, `runtime:h1-stock-expiry` and full `runtime:r1` passed on `2026-05-09` using `RUNTIME_API_URL=http://127.0.0.1:3002`.
- H2 order maintenance worker local proof now exists:
  - command `npm run orders:maintenance-worker --workspace apps/api` runs the same combined maintenance service in a long-running loop with interval and idle-stop controls;
  - runtime command `npm run runtime:h2-order-maintenance-worker --workspace apps/api` passed with `H2-ORDER-MAINTENANCE-WORKER-01` through `H2-ORDER-MAINTENANCE-WORKER-03` on `2026-05-09`;
  - one-shot `npm run orders:run-maintenance --workspace apps/api -- --now=1970-01-01T00:00:00.000Z` returned clean JSON after the shared-service refactor;
  - full `npm run runtime:h2-order-maintenance --workspace apps/api` regression also passed after the shared-service refactor using `RUNTIME_API_URL=http://127.0.0.1:3002`.
- Local Compose worker profile proof now exists:
  - `docker-compose.yml` has a `workers` profile with `notification-worker` and `order-maintenance-worker`;
  - `docker compose --profile workers config` passed;
  - one-shot container smoke for `notification-worker` passed with `notifications:worker --once`;
  - one-shot container smoke for `order-maintenance-worker` passed with `orders:maintenance-worker --once --now=1970-01-01T00:00:00.000Z`;
  - `execution/runtime/local_workers_runbook.md` records local worker commands and explicitly keeps hosted/deployed scheduler evidence separate.
- H2 pre-shipment cancellation stock-return local proof now exists:
  - vendor cancellation from `PAYMENT_HELD` returns held funds and restores ordered product stock;
  - confirmation-timeout auto-cancel returns held funds and restores ordered product stock;
  - auto-cancel replay does not restore stock twice;
  - audit metadata records `returnedStockQuantity`;
  - runtime command `npm run runtime:h2-cancel-stock --workspace apps/api` passed with `H2-CANCEL-STOCK-01` through `H2-CANCEL-STOCK-04`;
  - post-change `runtime:phase05`, `runtime:h2-confirmation-timeout`, `runtime:h2-order-maintenance`, `runtime:h1-stock-reservation`, `runtime:h1-stock-expiry` and full `runtime:r1` passed on `2026-05-09` using `RUNTIME_API_URL=http://127.0.0.1:3002`.
- H2 order timeline local proof now exists:
  - `GET /buyer/orders/:orderId` includes a chronological `timeline` derived from durable order audit events plus `ORDER_PAYMENT_HELD`;
  - `GET /vendor/orders/:orderId` exposes the same lifecycle timeline under vendor tenant scope;
  - timeline covers payment-held/order-created, vendor confirm, vendor ship, buyer delivered and buyer completed events with actor and metadata evidence;
  - cross-buyer and cross-vendor reads remain blocked;
  - runtime command `npm run runtime:h2-order-timeline --workspace apps/api` passed with `H2-ORDER-TIMELINE-01` through `H2-ORDER-TIMELINE-05` on `2026-05-09`;
  - post-change `runtime:phase05` regression passed using `RUNTIME_API_URL=http://127.0.0.1:3002`.
- H2 shipped/return stock policy local proof now exists:
  - buyer-favor full refund after shipment does not automatically restock product inventory;
  - dispute resolution audit metadata records `stockPolicy=NO_AUTO_RESTOCK_AFTER_SHIPMENT`, `restockedQuantity=0` and `returnInspectionRequired=true`;
  - buyer/vendor dispute resolution notification payloads carry the same stock policy metadata;
  - runtime command `npm run runtime:h2-return-stock --workspace apps/api` passed with `H2-RETURN-STOCK-01` through `H2-RETURN-STOCK-04` on `2026-05-09`;
  - post-change `runtime:phase06` regression passed using `RUNTIME_API_URL=http://127.0.0.1:3002`.
- H2 admin/backend ops local proof now exists:
  - admin-only `GET /admin/ops/summary` exposes notification outbox counts, money provider failure counts, latest reconciliation summary and order maintenance backlog counts;
  - admin-only `GET /admin/ops/notifications` lists/filter notification outbox rows by status, event and reference;
  - admin-only `POST /admin/ops/notifications/:notificationId/retry` requeues failed notification rows for worker retry and writes audit evidence;
  - runtime command `npm run runtime:h2-admin-ops --workspace apps/api` passed with `H2-ADMIN-OPS-01` through `H2-ADMIN-OPS-05` on `2026-05-09`;
  - money reconciliation now treats late provider events after expired checkout sessions with no orders as matched safe no-op evidence;
  - post-change `npm run money:reconcile --workspace apps/api` and `npm run runtime:h1-money-failure-recovery --workspace apps/api` passed on the current DB.
- H2 backend RMA inspection local proof now exists:
  - admin-only `GET /admin/ops/return-inspections` lists disputes that require return inspection after shipped buyer-favor refunds;
  - admin-only `POST /admin/ops/return-inspections/:disputeId/complete` records `RESTOCK` or `DO_NOT_RESTOCK` decisions in durable audit evidence;
  - `RESTOCK` increments product stock by the original order item quantities exactly once;
  - duplicate completion is rejected with `OPS_INVALID_STATE`;
  - runtime command `npm run runtime:h2-rma-inspection --workspace apps/api` passed with `H2-RMA-INSPECTION-01` through `H2-RMA-INSPECTION-05` on `2026-05-09`;
  - post-change `npm run runtime:h2-admin-ops --workspace apps/api` regression passed on the current DB.
- H2 admin order-maintenance ops local proof now exists:
  - admin-only `POST /admin/ops/order-maintenance/run` exposes dry-run backlog review and audited execute mode;
  - dry-run reports checkout expiry, vendor confirmation timeout and delivery timeout backlog without mutating order/fund state;
  - execute mode runs the shared order maintenance service used by the CLI/worker path;
  - execute mode writes `ADMIN_ORDER_MAINTENANCE_RUN` audit evidence with actor, backlog-before and job result;
  - repeated execute calls are replay-safe for already processed rows;
  - runtime command `npm run runtime:h2-admin-maintenance-ops --workspace apps/api` passed with `H2-ADMIN-MAINTENANCE-OPS-01` through `H2-ADMIN-MAINTENANCE-OPS-05` on `2026-05-09`;
  - post-change `npm run runtime:h2-admin-ops --workspace apps/api` and `npm run runtime:h2-rma-inspection --workspace apps/api` regressions passed on the current DB.
- H2 admin money ops local proof now exists:
  - admin-only `GET /admin/ops/money/reconciliation` exposes reconciliation runs and filtered reconciliation items by run status, item status and item type;
  - admin-only `GET /admin/ops/money/failures` exposes normalized failed refund/payout provider executions with review, dispute/order/fund/vendor context;
  - failure filters support `type=ALL|REFUND|PAYOUT` and `reviewed=ALL|REVIEWED|UNREVIEWED`;
  - invalid filters return `VALIDATION_ERROR`;
  - runtime command `npm run runtime:h2-admin-money-ops --workspace apps/api` passed with `H2-ADMIN-MONEY-OPS-01` through `H2-ADMIN-MONEY-OPS-05` on `2026-05-09`;
  - post-change `npm run runtime:h2-admin-ops --workspace apps/api`, `npm run runtime:h2-admin-maintenance-ops --workspace apps/api` and `npm run runtime:h2-rma-inspection --workspace apps/api` regressions passed on the current DB.
- H2 admin worker/queue ops local proof now exists:
  - admin-only `GET /admin/ops/workers` exposes notification worker and order maintenance worker DB/config snapshots, queue/backlog counts and latest audit-backed ops activity;
  - admin-only `GET /admin/ops/queues` aggregates notification, order maintenance, return inspection and money failure actionable backlog counts;
  - endpoints are read-only snapshots and do not mutate pending/failed notifications or due order/fund state;
  - runtime command `npm run runtime:h2-admin-worker-queue-ops --workspace apps/api` passed with `H2-ADMIN-WORKER-QUEUE-OPS-01` through `H2-ADMIN-WORKER-QUEUE-OPS-05` on `2026-05-09`;
  - post-change `npm run runtime:h2-admin-ops --workspace apps/api`, `npm run runtime:h2-admin-money-ops --workspace apps/api`, `npm run runtime:h2-admin-maintenance-ops --workspace apps/api` and `npm run runtime:h2-rma-inspection --workspace apps/api` regressions passed on the current DB.
- H2 durable worker heartbeat local proof now exists:
  - migration `20260509120000_h2_worker_heartbeat` adds `WorkerHeartbeat`;
  - notification worker and order maintenance worker now write durable heartbeat state with worker name, instance ID, `RUNNING`/`STOPPED`/`ERROR` status, run counts, processed counts, idle runs, timestamps, error and metadata;
  - admin-only `GET /admin/ops/workers` exposes heartbeat instances and marks old `RUNNING` heartbeat rows as `STALE`;
  - runtime command `npm run runtime:h2-worker-heartbeat --workspace apps/api` passed with `H2-WORKER-HEARTBEAT-01` through `H2-WORKER-HEARTBEAT-05` on `2026-05-09`;
  - post-change `npm run runtime:h1-email-worker-daemon --workspace apps/api`, `npm run runtime:h2-order-maintenance-worker --workspace apps/api`, `npm run runtime:h2-admin-worker-queue-ops --workspace apps/api` and `npm run runtime:h2-admin-ops --workspace apps/api` regressions passed on the current DB.
- H3 minimal admin ops UI local build proof now exists:
  - web route `/admin/ops` exposes the existing backend ops summary, queues, worker heartbeat snapshots, notification outbox retry, order-maintenance dry-run/execute, money failure visibility, reconciliation runs and return-inspection completion actions;
  - login screen now has an explicit `Platform Admin` sign-in mode that uses `/admin/auth/login` and redirects platform admins to `/admin/ops`;
  - `npm run lint --workspace apps/web` and `npm run build --workspace apps/web` passed on `2026-05-09`;
  - this closes only the first minimal admin/backend ops UI surface; polished KYC review UI, dispute queue/detail/resolve UI, deeper RMA workflow UI and live provider evidence remain open.
- H3 minimal admin KYC review UI local build proof now exists:
  - web route `/admin/kyc` exposes the existing admin-only KYC queue/detail, business profile, document metadata, raw protected document read/preview, approve and reject actions;
  - admin navigation now includes `Ops` and `KYC`;
  - `npm run lint --workspace apps/web` and `npm run build --workspace apps/web` passed on `2026-05-10`;
  - local API smoke for `admin@vendora.com / password123` against `/admin/kyc/applications` passed on `2026-05-10`;
  - this closes only the first minimal KYC review UI surface; deeper compliance workflow, hosted private-bucket evidence and polished dispute admin UI remain open.
- H3 minimal admin dispute UI local build proof now exists:
  - web route `/admin/disputes` exposes the existing admin-only dispute queue/detail, buyer claim, vendor response, order/fund context and resolution actions for vendor-favor release, buyer-favor full refund and buyer-favor partial refund;
  - admin navigation now includes `Ops`, `KYC` and `Disputes`;
  - `npm run lint --workspace apps/web` and `npm run build --workspace apps/web` passed on `2026-05-10`;
  - local API smoke for `admin@vendora.com / password123` against `/admin/disputes` passed on `2026-05-10` with 70 disputes and 8 `PLATFORM_REVIEW` disputes on the current DB;
  - this closes only the first minimal dispute review/resolve UI surface; dispute evidence/messages UI, richer SLA/escalation workflows and live provider money evidence remain open.
- H3 minimal vendor balance/history UI local build proof now exists:
  - web route `/vendor/balance` exposes existing vendor-scoped balance totals for held, frozen, releasable, paid-out and returned-to-buyer funds plus recent vendor ledger entries;
  - seller sidebar now includes `Баланс`;
  - `npm run lint --workspace apps/web` and `npm run build --workspace apps/web` passed on `2026-05-10`;
  - local API smoke for `vendor@vendora.com / password123` against `/vendor/balance` passed on `2026-05-10` with 25 ledger entries on the current DB;
  - web smoke for `/vendor/balance` passed with Next dev in webpack mode on port `3004` because Turbopack dev cache repeatedly hit an internal corrupted-cache panic while production build remained clean.
- H3 admin money remediation UI controls local build proof now exists:
  - `/admin/ops` money failures panel now exposes failed refund/payout provider executions with review notes plus `Mark reviewed` and `Retry` actions wired to the existing admin-only remediation endpoints;
  - `npm run lint --workspace apps/web` and `npm run build --workspace apps/web` passed on `2026-05-10`;
  - local read-only API smoke for `admin@vendora.com / password123` against `/admin/ops/money/failures` passed on `2026-05-10` with 16 failed provider executions on the current DB;
  - web smoke for `/admin/ops` passed with Next dev in webpack mode on port `3005`.
- H3 order fulfillment/timeline UI local build proof now exists:
  - vendor orders UI now captures optional carrier and tracking number when moving `CONFIRMED -> SHIPPED`;
  - buyer orders UI now exposes the H2 `SHIPPED -> DELIVERED -> COMPLETED` flow instead of only the legacy shipped-to-completed shortcut;
  - buyer and vendor order lists can expand existing detail endpoints to show the audit-backed lifecycle timeline;
  - `npm run lint --workspace apps/web` and `npm run build --workspace apps/web` passed on `2026-05-10`;
  - local read-only API smoke for buyer and vendor order detail/timeline endpoints passed on `2026-05-10` with buyer timeline length 3 and vendor timeline length 3 on sampled current DB orders.
- H3 buyer/vendor dispute visibility and response UI local build proof now exists:
  - buyer order detail expansion now shows dispute reason, status, vendor response and resolution metadata when a dispute exists;
  - vendor order detail expansion now shows dispute reason/status and lets the vendor respond through existing `/vendor/disputes/:disputeId/respond` while the dispute is in `VENDOR_RESPONSE`;
  - `npm run lint --workspace apps/web` and `npm run build --workspace apps/web` passed on `2026-05-10`;
  - local read-only API smoke for buyer/vendor sampled order details confirmed existing dispute objects, vendor responses and timelines are returned on the current DB.
- H3 vendor KYC application UI local build proof now exists:
  - web route `/vendor/application` lets a vendor owner create a vendor workspace when the session has no vendor context, edit the business profile, upload a KYC document through the protected `presign -> upload` path and submit the application for review;
  - seller sidebar now includes `KYC`;
  - login and registration verification now route `VENDOR_OWNER` users without a vendor workspace to `/vendor/application` instead of buyer catalog;
  - `npm run lint --workspace apps/web` and `npm run build --workspace apps/web` passed on `2026-05-10`;
  - local read-only API smoke for `vendor@vendora.com / password123` against `/vendor/application` passed on `2026-05-10`.
- H3 dispute messages/evidence metadata local proof now exists:
  - migration `20260510110000_h3_dispute_messages_evidence` added durable `DisputeMessage` and `DisputeEvidence` metadata tables;
  - buyer dispute creation now writes the buyer claim as a message and can attach evidence metadata;
  - vendor dispute response now writes the vendor response as a message and can attach evidence metadata;
  - admin dispute detail, buyer order detail and vendor order detail expose dispute messages and evidence metadata in the web UI;
  - maintained `runtime:phase06` now includes `R1-DISP-04` and passed on `2026-05-10`, verifying buyer/vendor evidence metadata and messages are persisted and visible to admin detail;
  - `npx prisma migrate deploy`, `npm run build --workspace apps/api`, `npm run lint --workspace apps/web` and `npm run build --workspace apps/web` passed on `2026-05-10`.
- H3 basic listing media local proof now exists:
  - migration `20260510113000_h3_product_media_metadata` added `ProductMedia` rows for DB-backed local inline image media;
  - `/vendor/listings` and legacy `/products` create paths accept up to 5 image media items with content type/size/base64 validation;
  - vendor listing/product responses and public catalog responses include ordered media metadata and local inline `assetUrl`;
  - vendor product creation UI accepts an image file, sends it through the existing JSON API path and vendor/buyer catalog UI renders product thumbnails;
  - maintained `runtime:phase03` now includes `R1-CAT-08` and passed on `2026-05-10`, verifying media storage and vendor/public catalog exposure;
  - local smoke for legacy `/products` with media passed on `2026-05-10`, confirming the web vendor product creation path returns media on create and `/products/mine`;
  - `npx prisma migrate deploy`, `npm run build --workspace apps/api`, `npm run lint --workspace apps/web` and `npm run build --workspace apps/web` passed on `2026-05-10`.
- H3 local Meilisearch indexing proof now exists:
  - catalog search adapter now can create/configure a local Meilisearch index, reindex buyer-visible catalog documents and optionally use Meilisearch ids before DB source-of-truth filtering;
  - command `npm run catalog:reindex-search --workspace apps/api` now exists;
  - public catalog search remains safe if Meilisearch is unavailable because DB-backed search remains the fallback path;
  - runtime command `npm run runtime:h3-catalog-search --workspace apps/api` passed with `H3-CATALOG-SEARCH-01` and `H3-CATALOG-SEARCH-02` on `2026-05-10`;
  - runtime proof verified reindex writes buyer-visible documents and excludes draft plus blocked-vendor products from the Meilisearch index;
  - `npm run build --workspace apps/api` and `npm run build --workspace apps/web` passed after the adapter changes.
- H3 admin-triggerable catalog search reindex local proof now exists:
  - catalog reindex now replaces the full Meilisearch document set instead of only appending/upserting, preventing stale draft/blocked/deleted search hits from surviving reindex;
  - admin-only `POST /admin/ops/catalog-search/reindex` exposes dry-run source document count and execute mode for Meilisearch reindex;
  - execute mode writes `ADMIN_CATALOG_SEARCH_REINDEX` audit evidence with actor, source count and reindex result;
  - admin ops UI now exposes catalog search dry-run/reindex controls and shows the latest run result;
  - runtime command `npm run runtime:h3-catalog-search-ops --workspace apps/api` passed with `H3-CATALOG-SEARCH-OPS-01` through `H3-CATALOG-SEARCH-OPS-05` on `2026-05-10`;
  - runtime proof verified dry-run does not mutate Meilisearch, execute mode removes a stale non-source document and leaves only buyer-visible source documents;
  - `npm run build --workspace apps/api`, `npm run lint --workspace apps/web` and `npm run build --workspace apps/web` passed on `2026-05-10`.
- H3 catalog search worker local proof now exists:
  - command `npm run catalog:search-worker --workspace apps/api` runs full-replace catalog search reindex through a worker loop with `--once`, interval and stop-after-runs controls;
  - worker writes durable `WorkerHeartbeat` state under `workerName=catalog_search` and `CATALOG_SEARCH_REINDEX_WORKER_RUN` audit evidence;
  - Docker Compose `workers` profile now includes `catalog-search-worker` with local Meilisearch wiring, and `docker compose --profile workers config` passed on `2026-05-10`;
  - admin ops worker snapshot now includes catalog search worker heartbeat and source document count visibility;
  - runtime command `npm run runtime:h3-catalog-search-worker --workspace apps/api` passed with `H3-CATALOG-SEARCH-WORKER-01` through `H3-CATALOG-SEARCH-WORKER-04` on `2026-05-10`;
  - existing `npm run runtime:h2-admin-worker-queue-ops --workspace apps/api` regression still passed after adding catalog search worker visibility;
  - `npm run build --workspace apps/api`, `npm run lint --workspace apps/web` and `npm run build --workspace apps/web` passed on `2026-05-10`.
- H3 catalog moderation lifecycle local proof now exists:
  - migration `20260510130000_h3_product_moderation` added `ProductModerationStatus`, moderation reason, actor and timestamp fields to `Product`;
  - public catalog/detail paths and Meilisearch indexing now require `moderationStatus=APPROVED`;
  - admin-only `GET /admin/catalog/listings` exposes listing moderation state and `POST /admin/catalog/listings/:id/moderate` supports `SUSPEND` and `APPROVE`;
  - web route `/admin/catalog` exposes minimal listing moderation controls;
  - Meilisearch single-product sync/delete now waits for task completion, removing the earlier publish/search race;
  - runtime command `npm run runtime:h3-catalog-moderation --workspace apps/api` passed with `H3-CATALOG-MOD-01` through `H3-CATALOG-MOD-05` on `2026-05-10`;
  - post-change `npm run runtime:phase03 --workspace apps/api` and `npm run runtime:h3-catalog-search --workspace apps/api` regressions passed on `2026-05-10`;
  - `npx prisma migrate deploy`, `npx prisma generate`, `npm run build --workspace apps/api`, `npm run lint --workspace apps/web` and `npm run build --workspace apps/web` passed on `2026-05-10`.
- Post-commit audit passed on `2026-05-10` after commits `efbff92`, `643e6b2` and `140c96b`:
  - `npm run runtime:r1 --workspace apps/api`;
  - `npm run runtime:h3-catalog-moderation --workspace apps/api`;
  - `npm run runtime:h3-catalog-search --workspace apps/api`;
  - `npm run runtime:h3-catalog-search-ops --workspace apps/api`;
  - `npm run runtime:h3-catalog-search-worker --workspace apps/api`;
  - `npm run runtime:h3-dispute-sla --workspace apps/api`;
  - `npm run runtime:h3-dispute-sla-worker --workspace apps/api`;
  - `npm run runtime:h3-dispute-sla-ops --workspace apps/api`;
  - `npm run build --workspace apps/api`, `npm run lint --workspace apps/web`, `npm run build --workspace apps/web` and `npx prisma migrate status`.
- H3 raw dispute evidence storage local proof now exists:
  - migration `20260510120000_h3_dispute_evidence_storage` added storage key/provider/size/checksum/confirmation metadata to `DisputeEvidence`;
  - buyer dispute creation and vendor dispute response can now store raw evidence bytes through the same local private storage driver used for KYC protected documents;
  - admin-only `GET /admin/disputes/evidence/:evidenceId/content` returns integrity-checked evidence content and writes `DISPUTE_EVIDENCE_OBJECT_READ` audit evidence;
  - admin dispute UI can read stored evidence content and preview image evidence;
  - buyer/vendor dispute UI now sends selected evidence file content through the existing dispute create/respond flows;
  - maintained `runtime:phase06` now includes `R1-DISP-05` and passed on `2026-05-10`, verifying private raw evidence storage and admin read integrity;
  - `npx prisma migrate deploy`, `npm run build --workspace apps/api`, `npm run lint --workspace apps/web` and `npm run build --workspace apps/web` passed on `2026-05-10`.
- H3 vendor-response SLA escalation local proof now exists:
  - command `npm run disputes:auto-escalate-vendor-response --workspace apps/api` moves overdue `VENDOR_RESPONSE` disputes to `PLATFORM_REVIEW` while leaving fresh vendor-response disputes unchanged;
  - escalation writes a system `DisputeMessage`, `DISPUTE_VENDOR_RESPONSE_SLA_ESCALATED` audit evidence and buyer/vendor/admin notification outbox rows;
  - runtime command `npm run runtime:h3-dispute-sla --workspace apps/api` passed with `H3-DISPUTE-SLA-01` through `H3-DISPUTE-SLA-04` on `2026-05-10`;
  - runtime proof verified replay safety for already escalated disputes;
  - `npm run build --workspace apps/api`, `npm run lint --workspace apps/web` and `npm run build --workspace apps/web` passed on `2026-05-10`.
- H3 dispute SLA worker local proof now exists:
  - command `npm run disputes:sla-worker --workspace apps/api` runs the same vendor-response SLA escalation through a worker loop with `--once`, interval and idle-stop controls;
  - worker writes durable `WorkerHeartbeat` state under `workerName=dispute_sla`;
  - Docker Compose `workers` profile now includes `dispute-sla-worker`, and `docker compose --profile workers config` passed on `2026-05-10`;
  - admin ops worker/queue snapshots now include dispute SLA backlog and worker heartbeat visibility;
  - runtime command `npm run runtime:h3-dispute-sla-worker --workspace apps/api` passed with `H3-DISPUTE-SLA-WORKER-01` through `H3-DISPUTE-SLA-WORKER-04` on `2026-05-10`;
  - existing `npm run runtime:h2-admin-worker-queue-ops --workspace apps/api` regression still passed after the worker/queue snapshot extension;
  - `npm run build --workspace apps/api`, `npm run lint --workspace apps/web` and `npm run build --workspace apps/web` passed on `2026-05-10`.
- H3 admin-triggerable dispute SLA ops local proof now exists:
  - admin-only `POST /admin/ops/dispute-sla/run` exposes dry-run backlog review and execute mode for vendor-response SLA escalation;
  - execute mode writes `ADMIN_DISPUTE_SLA_RUN` audit evidence with actor, threshold, backlog-before and command result;
  - admin ops UI now exposes dispute SLA dry-run/execute controls and shows the latest run result;
  - runtime command `npm run runtime:h3-dispute-sla-ops --workspace apps/api` passed with `H3-DISPUTE-SLA-OPS-01` through `H3-DISPUTE-SLA-OPS-05` on `2026-05-10`;
  - `npm run build --workspace apps/api`, `npm run lint --workspace apps/web` and `npm run build --workspace apps/web` passed on `2026-05-10`.
- Maintained `runtime:phase05` now restores its seed-vendor product stock before checkout so repeated local replays remain compatible with H1 stock reservation/decrement behavior on a non-clean DB.
- This closes local delivery-state, shipment metadata, individual timeout commands, combined order-maintenance operator-command evidence, admin-triggerable order-maintenance dry-run/execute evidence, admin-triggerable dispute SLA dry-run/execute evidence, admin-triggerable catalog search reindex evidence, local order-maintenance worker entrypoint, local dispute SLA worker entrypoint, local catalog search worker entrypoint, local Compose worker-profile wiring, local durable worker heartbeat, worker/queue DB snapshot visibility, pre-shipment cancellation stock return, no-auto-restock-after-shipment policy, API-level order timeline, first order fulfillment/timeline UI surface, first buyer/vendor dispute visibility/response UI surface, first vendor KYC application UI surface, first dispute messages/evidence metadata surface, first local raw dispute evidence storage/read surface, first basic listing media UI/API surface, local Meilisearch indexing/reindex proof, local catalog moderation lifecycle proof, local vendor-response SLA escalation command, first admin/backend ops surface, first minimal admin ops UI surface, first minimal KYC review UI surface, first minimal dispute review/resolve UI surface, first minimal vendor balance/history UI surface, first admin catalog moderation UI surface, first admin money remediation UI controls, backend money ops visibility and backend RMA inspection queue/completion only; hosted/deployed scheduler/cron evidence, hosted/deployed worker liveness proof, productized delivery evidence, live provider money evidence, hosted private-bucket evidence for KYC/dispute evidence, hosted catalog media object storage/CDN/image processing, hosted search operations/reindex scheduling, richer dispute escalation/review workflows and polished admin UI remain open.
- Second `H1` hardening target added protected KYC raw-document storage evidence:
  - migration `20260508113000_h1_kyc_private_storage`;
  - vendor upload path stores raw KYC document bytes through the local private storage driver;
  - admin-only raw read path returns integrity-checked content and writes `KYC_DOCUMENT_OBJECT_READ` audit evidence;
  - runtime command `npm run runtime:h1-storage --workspace apps/api` passed with `H1-KYC-STORAGE-01` through `H1-KYC-STORAGE-04`.
- This closes local protected-storage path evidence only; hosted S3/private-bucket deployment evidence remains open if required for launch.

---

## 2. Status Summary In The New Phase Model

| Runtime Phase | Runtime Status | Imported / Current Signal | Interpretation |
|---|---|---|---|
| `Phase 00 — Local Infrastructure` | `Verified baseline` | local Docker Compose baseline existed before the new staged runtime pass | still valid as infra foundation |
| `Phase 01 — Identity And Access` | `Core R1 auth flow runtime-verified for unblock pass` | migration, seed, live API boot and `R1-AUTH-*` checks were executed on `2026-05-07` | strong enough to unblock phase 02, but not yet launch-grade complete |
| `Phase 02 — Vendor Gate` | `Core R1 vendor gate runtime-verified for unblock pass` | migration, KYC API, admin review, audit rows and live `R1-KYC-*` checks were executed on `2026-05-08` | strong enough to unblock phase 03, but not yet launch-grade compliance depth |
| `Phase 03 — Catalog` | `Core R1 catalog flow runtime-verified for unblock pass` | migration, contract-compatible listing/catalog API and live `R1-CAT-*` checks were executed on `2026-05-08` | strong enough to unblock phase 04, but not yet launch-grade search/media depth |
| `Phase 04 — Checkout` | `Core R1 checkout flow runtime-verified for unblock pass; H1 stock reservation and expiry local proof added` | cart, checkout session, dev provider webhook, idempotency and order-fund hold checks were executed on `2026-05-08`; `H1-STOCK-RESERVATION-*` and `H1-STOCK-EXPIRY-*` also passed on `2026-05-08` | strong enough to unblock phase 05, with local reservation/decrement/expiry evidence; still not launch-grade provider/payment depth |
| `Phase 05 — Orders` | `Core R1 order operations runtime-verified for unblock pass` | checkout-created orders, buyer/vendor order views, tenant/self boundaries, valid/invalid transitions, fund release/refund and audit checks were executed on `2026-05-08` | strong enough to unblock phase 06, but not launch-grade fulfillment depth |
| `Phase 06 — Disputes And Money` | `Core R1 disputes/money flow runtime-verified for unblock pass` | dispute open, fund freeze, tenant-scoped vendor response, admin-only resolution, buyer/vendor outcomes, vendor balance ledger and audit checks were executed on `2026-05-08` | completes the numbered R1 phase pack, but not launch-grade money operations depth |

---

## 3. Highest Verified Phase

### `Phase 06 — Disputes And Money`

**Status:** core `R1` dispute recovery and money-state flow runtime-verified for the current unblock pass

Runtime evidence recorded on `2026-05-08`:

- local Docker runtime used:
  - PostgreSQL container on host port `55432`
  - Redis on `6379`
  - Meilisearch on `7700`
- dispute/money migration applied successfully:
  - `20260508050000_phase06_disputes_money`
- seed completed successfully before runtime verification
- API started successfully on `127.0.0.1:3001`
- API TypeScript build succeeded
- web lint succeeded
- web production build succeeded
- live check script succeeded:
  - `vendora_codebase/apps/api/tmp_phase06_check.mjs`
- API process was stopped after verification; `curl http://127.0.0.1:3001/health` failed to connect afterward

Executed runtime checks:

- `R1-DISP-01` pass:
  - buyer opened dispute from a shipped order
  - order moved to `DISPUTED`
  - order fund moved to `FROZEN_DISPUTE`
  - `FROZEN` vendor balance ledger entry was created
- `R1-DISP-02` pass:
  - wrong-tenant vendor response was denied
  - correct vendor response moved dispute to `PLATFORM_REVIEW`
- `R1-DISP-03` pass:
  - buyer was denied on admin dispute queue
  - platform admin could list and read dispute detail
- `R1-MONEY-01` pass:
  - platform admin resolved a dispute in vendor favor
  - order moved to `COMPLETED`
  - fund moved to `RELEASABLE`
  - `RELEASED` vendor balance ledger entry was created
- `R1-MONEY-02` pass:
  - platform admin resolved a dispute in buyer favor
  - order moved to `CANCELLED`
  - fund moved to `RETURNED_TO_BUYER`
  - `REFUNDED` vendor balance ledger entry was created
- `R1-MONEY-03` pass:
  - `GET /vendor/balance` reflected release/refund ledger evidence for each vendor
- `R1-AUDIT-01` pass:
  - dispute open/respond/resolve audit events were persisted
  - duplicate admin resolution was rejected with `DISPUTE_INVALID_STATE`

Interpretation:

- dispute recovery is no longer only a shell route over imported rows;
- buyer dispute creation, vendor response, admin resolution and vendor balance evidence were exercised against live runtime;
- money state now freezes on dispute and resolves to either vendor release or buyer refund outcome;
- this completes the numbered `R1` runtime phase pack for the current unblock-pass strategy.

---

## 4. Phase 04 Current State

### `Phase 04 — Checkout`

**Status:** core `R1` cart/checkout/payment-finalization flow runtime-verified for the current unblock pass; H1 stock reservation/decrement/expiry local proof added

Runtime evidence recorded on `2026-05-08`:

- local Docker runtime used:
  - PostgreSQL container on host port `55432`
  - Redis on `6379`
  - Meilisearch on `7700`
- checkout migration applied successfully:
  - `20260508030000_phase04_checkout`
- seed completed successfully after migration and seed consistency fix
- API started successfully on `127.0.0.1:3001`
- Prisma client generation succeeded
- API TypeScript build succeeded
- web lint succeeded
- web production build succeeded outside sandbox because Turbopack needs local process/port binding

Executed runtime checks:

- `R1-CHK-01` pass:
  - verified buyer added two eligible published listings to persisted cart
  - cart grouped items by vendor
  - cart version incremented on mutation
- `R1-CHK-02` pass:
  - checkout session validated cart version, stock, eligibility and price snapshot
  - checkout session entered `AWAITING_PAYMENT`
- `R1-CHK-03` pass:
  - repeated checkout submit with same `Idempotency-Key` returned the same checkout session
  - same key with changed request returned `IDEMPOTENCY_CONFLICT`
- `R1-CHK-04` pass:
  - signed local/dev provider success webhook finalized payment
  - finalization created one vendor-specific order per vendor atomically
  - created orders were linked to the checkout session
- `R1-CHK-05` pass:
  - each created order received an `OrderFund` row in `HELD` state
  - DB evidence showed two orders and two held fund rows for the checkout
- `R1-CHK-06` pass:
  - replayed provider event did not duplicate orders or provider event rows
  - checkout session reported `SUCCEEDED` with the created order ids
- `R1-CHK-07` pass:
  - finalized checkout cleared persisted cart items
- `R1-CHK-08` pass:
  - unpublished listing was denied at cart-add time
  - blocked-vendor listing was denied at cart-add time
- `R1-CHK-09` pass:
  - legacy direct `POST /orders` creation path is blocked with `CHECKOUT_REQUIRED`
  - regression check confirmed checkout finalization still creates orders after direct order creation was blocked
- `H1-STOCK-RESERVATION-01` through `H1-STOCK-RESERVATION-05` pass:
  - checkout session reserves stock and decrements available product quantity
  - competing checkout cannot oversell already reserved stock
  - payment failure releases reserved stock
  - payment success commits reservation without double decrement
  - webhook replay leaves reservations, orders and stock stable
- `H1-STOCK-EXPIRY-01` through `H1-STOCK-EXPIRY-05` pass:
  - checkout sessions expose expiry timestamps
  - expiry command releases abandoned reserved stock and marks sessions expired
  - expiry command replay does not release stock twice
  - late provider success/failure after expiry cannot create orders or re-consume stock

Interpretation:

- checkout is no longer direct imported order creation;
- buyer cart, checkout session, dev payment finalization, idempotency, vendor order split and held funds were exercised against live runtime;
- available stock is now reserved at checkout session creation and committed/released by provider outcome or expiry command in local runtime proof;
- direct buyer order creation now requires checkout finalization instead of bypassing payment;
- this is sufficient to stop checkout from blocking `Phase 05` work in the current unblock-pass strategy.

---

## 5. Phase 03 Current State

### `Phase 03 — Catalog`

**Status:** core `R1` listing/catalog visibility flow runtime-verified for the current unblock pass

Runtime evidence recorded on `2026-05-08`:

- local Docker runtime used:
  - PostgreSQL container on host port `55432`
  - Redis on `6379`
  - Meilisearch on `7700`
- catalog migration applied successfully:
  - `20260508020000_phase03_catalog`
- seed completed successfully after migration
- API started successfully on `127.0.0.1:3001`
- Prisma client generation succeeded
- API TypeScript build succeeded
- web lint succeeded
- web production build succeeded after rerunning outside sandbox because Turbopack attempted local process/port binding

Executed runtime checks:

- `R1-CAT-01` pass:
  - approved vendor created a draft listing through `POST /vendor/listings`
  - draft listing appeared in `GET /vendor/listings`
  - draft listing did not appear in public catalog
- `R1-CAT-02` pass:
  - approved vendor patched a draft listing through `PATCH /vendor/listings/:id`
  - patched title and stock quantity were returned correctly
- `R1-CAT-03` pass:
  - approved vendor published a listing through `POST /vendor/listings/:id/publish`
  - public `GET /catalog/products` discovered the listing by query/category/in-stock filters
  - public `GET /catalog/products/:id` returned buyer-safe product detail
- `R1-CAT-04` pass:
  - out-of-stock published listing remained publicly readable
  - public detail exposed `availability.inStock = false` and `stockQty = 0`
  - `inStock=true` public filter excluded the out-of-stock listing
- `R1-CAT-05` pass:
  - `POST /vendor/listings/:id/unpublish` removed listing from public discovery
- `R1-CAT-06` pass:
  - unapproved vendor was denied listing creation
- `R1-CAT-07` pass:
  - simulated `BLOCKED` vendor status caused its published listing to disappear from public search/detail
  - vendor status was restored to `APPROVED` after the check

Interpretation:

- the catalog slice is no longer purely imported product CRUD;
- approved vendor draft/publish/unpublish and buyer-visible discovery were exercised against live runtime;
- blocked/non-approved vendor visibility invariants are enforced in public read paths;
- this is sufficient to stop catalog from blocking `Phase 04` work in the current unblock-pass strategy.

---

## 6. Phase 02 Current State

### `Phase 02 — Vendor Gate`

**Status:** core `R1` vendor onboarding/KYC gate runtime-verified for the current unblock pass

Runtime evidence recorded on `2026-05-08`:

- local Docker runtime used:
  - PostgreSQL container on host port `55432`
  - Redis on `6379`
  - Meilisearch on `7700`
- KYC/vendor gate migration applied successfully:
  - `20260508010000_phase02_vendor_gate`
- seed completed successfully after migration
- API started successfully on `127.0.0.1:3001`
- Prisma client generation succeeded
- API TypeScript build succeeded

Executed runtime checks:

- `R1-KYC-01` pass:
  - verified vendor owner created a vendor workspace
  - initial vendor application was `DRAFT`
  - owner saved required business profile fields
- `R1-KYC-02` pass:
  - KYC document presign created protected document metadata
  - document completion moved metadata to `UPLOADED`
  - vendor-readable application response did not expose `storageKey`
- `R1-KYC-03` pass:
  - `DRAFT -> PENDING_REVIEW` submission worked only after profile and uploaded document existed
- `R1-KYC-04` pass:
  - buyer was denied on admin KYC queue
  - vendor owner was denied on admin KYC application detail
  - platform admin could read KYC application detail including protected document metadata
- `R1-KYC-05` pass:
  - platform admin approved a `PENDING_REVIEW` application
  - vendor and application both became `APPROVED`
  - approved vendor could create and publish a product
- `R1-KYC-06` pass:
  - platform admin rejected a second `PENDING_REVIEW` application
  - vendor and application both became `REJECTED`
  - rejected vendor remained outside product creation/selling flow
- `R1-KYC-07` pass:
  - unapproved vendor was denied product creation before admin approval
  - public product reads now filter to approved vendors only
- `R1-KYC-08` pass:
  - durable `AuditEvent` rows were observed for KYC application read, update, submit, approve and reject actions

Interpretation:

- the vendor gate is no longer purely theoretical;
- owner onboarding, KYC metadata, admin approve/reject and sell eligibility were exercised against live runtime;
- raw document bytes are still represented by local/dev upload metadata, but vendor-side raw storage references are not exposed;
- this is sufficient to stop vendor gate from blocking `Phase 03` work in the current unblock-pass strategy.

---

## 7. Phase 01 Current State

### `Phase 01 — Identity And Access`

**Status:** core `R1` auth flow runtime-verified for the current unblock pass

Runtime evidence recorded on `2026-05-07`:

- local Docker runtime used:
  - PostgreSQL container on host port `55432`
  - Redis on `6379`
  - Meilisearch on `7700`
- auth migration applied successfully:
  - `20260507230000_phase01_auth_foundation`
- seed completed successfully for:
  - `buyer@vendora.com`
  - `vendor@vendora.com`
  - `admin@vendora.com`
- API started successfully on `127.0.0.1:3001`
- Prisma client generation succeeded
- API TypeScript build succeeded
- web lint succeeded
- web production build succeeded after removing network-only font fetch and forcing buyer catalog dynamic rendering

Executed runtime checks:

- `R1-AUTH-01` pass:
  - buyer registration created a user
  - verification was required before full login
- `R1-AUTH-02` pass:
  - vendor owner registration succeeded
  - verification succeeded
  - vendor owner could create vendor workspace and read `/vendors/me`
- `R1-AUTH-03` pass:
  - email verification returned full authenticated session
- `R1-AUTH-04` pass:
  - five failed login attempts triggered lockout
  - locked account rejected a later correct password
- `R1-AUTH-05` pass:
  - Platform Admin signed in via separate `/admin/auth/login` path
- `R1-AUTH-06` pass-indirect:
  - seeded buyer could read own `/orders/mine`
  - second buyer saw no seeded buyer orders
- `R1-AUTH-07` pass-indirect:
  - seeded vendor saw own `/orders/vendor`
  - second vendor saw no seeded vendor orders
- `R1-AUTH-08` pass:
  - buyer and vendor were both denied on admin dispute resolve endpoint

Interpretation:

- the auth slice is no longer purely theoretical;
- main entry, verification, lockout and privileged admin path were exercised against live runtime;
- self/tenant scoping has live evidence, though part of it is indirect because the imported API surface is self-scoped rather than cross-tenant addressable;
- this was sufficient to stop auth from blocking `Phase 02`; Phase 02 now also has its own runtime evidence.

---

### What Now Exists

- Prisma user schema now includes:
  - `accountType`
  - `emailVerifiedAt`
  - `isPlatformAdmin`
  - `failedLoginAttempts`
  - `lockedUntil`
- seed now prepares verified buyer, vendor owner and platform admin identities
- `POST /auth/register` now requires explicit `BUYER` or `VENDOR_OWNER`
- register no longer issues full session immediately
- `POST /auth/verify-email` now exists
- `POST /auth/login` blocks unverified users
- `POST /admin/auth/login` now exists as separate privileged path
- `GET /auth/session` now exists
- JWT/session payload now includes:
  - `accountType`
  - `actorType`
  - `emailVerified`
  - `isPlatformAdmin`
  - vendor context fields
- auth helpers now exist:
  - `requireVerifiedEmail()`
  - `requireVendorContext()`
  - `requireVendorRole(roles)`
  - `requireVendorReadRole(roles)`
  - `requireVendorOwner()`
  - `requirePlatformAdmin()`
- failed login attempts now trigger 15-minute lockout after 5 misses
- web login/register flow now reflects verify-before-login behavior with a temporary local dev token preview

### Remaining Gaps Inside Phase 01

These gaps still matter, but they no longer block downstream runtime work:

- no real email delivery yet:
  - current local flow exposes a dev verification token instead of sending actual mail
  - durable `NotificationOutbox` artifacts now exist for verification emails
  - this means `FR-AUTH-003` is not yet launch-grade complete
- no refresh/logout/session revocation model yet
- no durable sessions table or separate `platform_admin_accounts` table yet
- `R1-AUTH-06` and `R1-AUTH-07` are proven through self-scoped route shape rather than a direct cross-resource denial endpoint
- `R1-AUTH-08` was proven on admin dispute endpoint; admin KYC surface now also has Phase 02 runtime proof
- no dedicated admin UI flow yet; current privileged path is API-first

Interpretation:

- `Phase 01` is good enough for an unblock pass;
- `Phase 01` is not yet the final launch-quality auth chapter.

---

## 8. Phase 02 Implementation Details

### What Now Exists

- Prisma schema now includes:
  - `VendorApplication`
  - `VendorApplicationDocument`
  - `AuditEvent`
  - `KycApplicationStatus`
  - `KycDocumentStatus`
  - expanded `VendorStatus` with `ONBOARDING` and `BLOCKED`
- vendor schema now stores launch KYC profile fields:
  - legal entity name
  - country
  - address snapshot
  - sales category
  - approval/review timestamps
- `GET /vendor/application` now returns current owner application without raw storage keys
- `PUT /vendor/application` now saves required business profile data while application is `DRAFT`
- `POST /vendor/application/documents/presign` now creates protected KYC document metadata with 15-minute dev upload URL
- `POST /vendor/application/documents/:documentId/complete` now marks document metadata as uploaded
- `POST /vendor/application/submit` now validates required profile and at least one uploaded document before `PENDING_REVIEW`
- `GET /admin/kyc/applications` now exposes admin-only pending queue
- `GET /admin/kyc/applications/:applicationId` now exposes admin-only application detail and protected document metadata
- `POST /admin/kyc/applications/:applicationId/approve` now moves application and vendor to `APPROVED`
- `POST /admin/kyc/applications/:applicationId/reject` now moves application and vendor to `REJECTED`
- product creation, product publishing and public product reads now enforce approved-vendor sell eligibility

### Remaining Gaps Inside Phase 02

These gaps still matter, but they no longer block downstream runtime work:

- KYC document upload now has local private raw-byte storage evidence:
  - local private storage now stores raw bytes and checksum evidence
  - no hosted S3/private-bucket deployment evidence yet
  - no real encrypted-at-rest storage proof
  - admin-only raw document read endpoint now creates per-read audit evidence
- durable notification outbox records now exist for KYC submit and approval/rejection; local `dev_log` worker shell is wired, but no real external provider delivery is wired yet
- no `REQUEST_MORE_INFO`, rejected resubmission loop, blocked/revoked access handling or session invalidation yet
- admin KYC surface is API-first; no dedicated admin UI was implemented
- audit trail is durable but minimal; no retention policy, immutable storage hardening or admin audit browser yet

Interpretation:

- `Phase 02` is good enough for an unblock pass;
- `Phase 02` is not yet the final launch-quality KYC/compliance chapter.

---

## 9. Phase 03 Implementation Details

### What Now Exists

- Prisma `Product` now carries launch listing metadata:
  - `category`
  - `currency`
  - `publishedAt`
  - `unpublishedReason`
- contract-compatible listing endpoints now exist:
  - `GET /vendor/listings`
  - `POST /vendor/listings`
  - `PATCH /vendor/listings/:id`
  - `POST /vendor/listings/:id/publish`
  - `POST /vendor/listings/:id/unpublish`
- public catalog endpoints now exist:
  - `GET /catalog/products`
  - `GET /catalog/products/:id`
- legacy imported UI endpoints remain available:
  - `GET /products`
  - `GET /products/mine`
  - `POST /products`
  - `POST /products/:id/publish`
- public catalog supports R1 query shape:
  - `q`
  - `category`
  - `vendorId`
  - `inStock`
  - `page`
  - `pageSize`
- public read paths only expose published listings from `APPROVED` vendors
- unapproved and blocked vendors are excluded from buyer-visible catalog paths
- product detail exposes simple stock availability truth

### Remaining Gaps Inside Phase 03

These gaps still matter, but they no longer block downstream runtime work:

- catalog is still backed by the imported `Product` table rather than a renamed first-class `Listing` model
- local Meilisearch indexing/reindex adapter, admin-triggerable full-replace reindex proof and local reindex worker entrypoint now exists with DB fallback; hosted search operations and deployed reindex scheduling remain open
- listing media now has local DB-backed inline image metadata, validation and web UI proof; hosted object storage/CDN/image processing remains open
- no plan/quota enforcement exists for listing creation
- local catalog moderation lifecycle and minimal admin UI now exist, but no rich moderation queue policy, appeals workflow or hosted moderation operations evidence yet
- no richer buyer-facing search UX or facets were implemented
- no dedicated product detail page was added to the web app; proof is API-first plus existing buyer catalog UI compatibility

Interpretation:

- `Phase 03` is good enough for an unblock pass;
- `Phase 03` is not yet the final launch-quality search/catalog chapter.

---

## 10. Phase 04 Implementation Details

### What Now Exists

- Prisma schema now includes:
  - `Cart`
  - `CartItem`
  - `CheckoutSession`
  - `IdempotencyRecord`
  - `PaymentProviderEvent`
  - `OrderFund`
  - `CheckoutSessionStatus`
  - `OrderFundStatus`
- order schema now stores checkout linkage and immutable launch snapshots:
  - `checkoutSessionId`
  - `orderNumber`
  - `shippingAddressJson`
  - `buyerEmailSnapshot`
  - order item title/price/line-total snapshots
- cart endpoints now exist:
  - `GET /cart`
  - `POST /cart/items`
  - `PATCH /cart/items/:itemId`
  - `DELETE /cart/items/:itemId`
- checkout endpoints now exist:
  - `POST /checkout/sessions`
  - `GET /checkout/sessions/:sessionId`
- local/dev provider webhook now exists:
  - `POST /payments/provider/webhook`
  - protected by `x-vendora-provider-secret`
- H1 local payment provider adapter-code now exists:
  - `PAYMENT_PROVIDER=dev_mock`
  - checkout provider session refs are created through the adapter
  - webhook signature parsing is delegated to the adapter
  - `PAYMENT_FAILED` path marks checkout failed without orders and enqueues notification evidence
- successful payment finalization creates vendor-specific `PAYMENT_HELD` orders and `HELD` order funds
- duplicate checkout submit and duplicate provider event replay are idempotent for the R1 path
- legacy direct `POST /orders` is blocked with `CHECKOUT_REQUIRED`
- current buyer cart UI now uses the persisted cart, checkout session and dev payment finalization path

### Remaining Gaps Inside Phase 04

These gaps still matter, but they no longer block downstream runtime work:

- no real Stripe/YooKassa/hosted provider integration or dashboard/API evidence yet
- provider webhook signing is local/dev shared-secret only
- no provider failure/recovery UI or interrupted checkout recovery
- no stock decrement/reservation model yet
- durable notification outbox records now exist for checkout/order confirmation and order transitions; local `dev_log` worker shell is wired, but no real external provider delivery is wired yet
- no guest checkout/cart merge yet
- no durable payment provider payload retention beyond hash/event id
- no price/stock race-condition stress proof beyond R1 validation

Interpretation:

- `Phase 04` is good enough for an unblock pass;
- `Phase 04` is not yet the final launch-quality checkout/payment chapter.

---

## 11. Phase 05 Implementation Details

### What Now Exists

- launch contract order endpoints now exist:
  - `GET /buyer/orders`
  - `GET /buyer/orders/:orderId`
  - `POST /buyer/orders/:orderId/confirm-receipt`
  - `GET /vendor/orders`
  - `GET /vendor/orders/:orderId`
  - `POST /vendor/orders/:orderId/confirm`
  - `POST /vendor/orders/:orderId/cancel`
  - `POST /vendor/orders/:orderId/ship`
- legacy order endpoints remain available for compatibility:
  - `GET /orders/mine`
  - `GET /orders/vendor`
  - `PATCH /orders/:id/status`
- legacy `PATCH /orders/:id/status` no longer allows arbitrary vendor state writes; it delegates to the same validated vendor transitions
- vendor order reads are tenant-scoped by `vendorId`
- buyer order detail reads are self-scoped by `buyerId`
- vendor valid transitions now enforce:
  - `PAYMENT_HELD -> CONFIRMED`
  - `PAYMENT_HELD -> CANCELLED`
  - `CONFIRMED -> SHIPPED`
- buyer receipt now enforces:
  - `SHIPPED -> COMPLETED`
- fund state now follows the R1 order path:
  - checkout success creates `HELD`
  - buyer receipt moves funds to `RELEASABLE`
  - vendor cancellation moves funds to `RETURNED_TO_BUYER`
  - dispute open hardening moves funds to `FROZEN_DISPUTE`
- order transitions now write durable `AuditEvent` rows for confirm, cancel, ship and buyer receipt
- buyer and vendor order web pages now use the contract-style endpoints instead of direct arbitrary status mutation

### Remaining Gaps Inside Phase 05

These gaps still matter, but they no longer block downstream runtime work:

- dedicated `DELIVERED` state now exists and is runtime-checked through H2 local proof; R1 `SHIPPED -> COMPLETED` remains as a backward-compatible shortcut
- shipment metadata/tracking number/carrier capture now exists on vendor ship and is runtime-checked
- local/operator delivery timeout auto-complete command now exists and is runtime-checked; deployed scheduler/cron wiring remains open
- local/operator vendor confirmation timeout auto-cancel command now exists and is runtime-checked; deployed scheduler/cron wiring remains open
- local/operator combined order maintenance command now exists and is runtime-checked; deployed scheduler/cron wiring remains open
- buyer/vendor order detail now exposes an API-level lifecycle timeline backed by durable order `AuditEvent` rows; there is still no separate timeline table
- durable notification outbox records now exist for vendor confirm/ship/cancel and buyer receipt; local `dev_log` worker shell is wired, but no real external provider delivery is wired yet
- pre-shipment cancellation now restores ordered product stock; shipped buyer-favor refunds now explicitly do not auto-restock and require return inspection metadata; full RMA workflow/inspection tooling remains open
- no vendor operations filters, pagination hardening or export/reporting depth
- dispute and payout depth remains for `Phase 06`; current dispute changes are only order-adjacent fund-state hardening

Interpretation:

- `Phase 05` is good enough for an unblock pass;
- `Phase 05` is not yet the final launch-quality order operations chapter.

---

## 12. Phase 06 Implementation Details

### What Now Exists

- Prisma schema now includes:
  - `VendorBalanceLedger`
  - `VendorLedgerEntryType`
  - `DisputeResolutionType`
  - vendor response and admin resolution metadata on `Dispute`
- contract-style dispute/money endpoints now exist:
  - `POST /buyer/orders/:orderId/disputes`
  - `POST /vendor/disputes/:disputeId/respond`
  - `GET /admin/disputes`
  - `GET /admin/disputes/:disputeId`
  - `POST /admin/disputes/:disputeId/resolve`
  - `GET /vendor/balance`
- legacy dispute endpoints remain available where they already existed:
  - `POST /orders/:orderId/dispute`
  - `GET /orders/:orderId/dispute`
  - `PATCH /orders/:orderId/dispute/resolve`
- buyer dispute open now validates order ownership and dispute-eligible state
- dispute open freezes `OrderFund` into `FROZEN_DISPUTE`
- vendor response is tenant-scoped and moves dispute to `PLATFORM_REVIEW`
- admin resolution supports:
  - `VENDOR_FAVOR_RELEASE`
  - `BUYER_FAVOR_FULL_REFUND`
- admin vendor-favor resolution moves funds to `RELEASABLE`
- admin buyer-favor resolution moves funds to `RETURNED_TO_BUYER`
- vendor balance endpoint exposes aggregate fund state and recent ledger entries
- dispute open/respond/resolve actions write durable `AuditEvent` rows

### Remaining Gaps Inside Phase 06

These gaps still matter, but they no longer block the current `R1` unblock pass:

- local `dev_mock` partial refund evidence now exists, but no live provider partial-refund API/dashboard evidence yet
- local `dev_mock` refund provider execution evidence now exists for buyer-favor disputes, but no live provider refund API/dashboard evidence yet
- local `dev_mock` payout provider execution and controlled failure evidence now exists for releasable funds, and local/internal reconciliation run evidence now exists, but no live provider payout API/dashboard/reconciliation evidence yet
- local vendor response SLA auto-escalation command, worker entrypoint and admin-triggerable dry-run/execute evidence now exists, but no hosted/deployed worker liveness proof or polished escalation review workflow yet
- dispute messages, evidence metadata and local private raw evidence storage now have local DB/API/UI proof, but hosted private-bucket evidence and richer evidence review workflows remain open
- first minimal admin dispute UI now exists, but polished review workflows and SLA/escalation remain open
- no immutable ledger hardening beyond append-only application behavior
- durable notification outbox records now exist for dispute open/respond/resolve; local `dev_log` worker shell is wired, but no real external provider delivery is wired yet
- no richer balance reporting, statements or export path

Interpretation:

- `Phase 06` is good enough for an unblock pass;
- `Phase 06` is not yet the final launch-quality disputes, escrow, refund or payout chapter.

---

## 13. Runtime Pack Closeout

There is no remaining numbered `R1` runtime phase file after:

[`execution/runtime/phase_06_disputes_money.md`](../execution/runtime/phase_06_disputes_money.md)

The next exact step is not a new phase claim. The closeout/hardening artifact now exists:

[`source/planning/r1_closeout_hardening_plan.md`](../source/planning/r1_closeout_hardening_plan.md)

The replay runbook also exists:

[`execution/runtime/r1_replay_runbook.md`](../execution/runtime/r1_replay_runbook.md)

Together they fix the next decision point:

1. decide whether to run a clean-data replay of `Phase 00 -> Phase 06`
2. choose which launch-grade gaps move into the next hardening pass
3. avoid converting local/dev proof into final production claims

If later we want stricter auth/KYC/catalog/checkout/orders/disputes-money finish before launch claim:

- replace dev verification token fallback with real email delivery
- add stronger session/logout/revocation handling
- replace dev KYC document metadata with real protected object storage
- add KYC notification delivery and stronger audit/read controls
- wire Meilisearch indexing and stronger media/search behavior
- replace `dev_mock` payment adapter proof with real payment provider sandbox/dashboard proof
- add stock decrement/reservation and checkout recovery behavior
- deploy/schedule the combined order maintenance command or equivalent cron wiring, add a dedicated timeline table only if API-derived audit timeline is not enough, and build full RMA workflow/inspection tooling if needed
- replace `dev_mock` refund/payout/reconciliation/remediation proof with real provider sandbox/dashboard proof
- re-run `Phase 01` through `Phase 06` as deeper deliberate passes

---

## 14. Current Guardrails

- do not treat the current unblock-pass proof as if all auth delivery details are final
- do not treat the current unblock-pass proof as if all KYC storage/compliance details are final
- do not treat the current unblock-pass proof as if catalog search/media/moderation are final
- do not treat the current unblock-pass proof as if payment provider integration is final
- do not treat local/operator fulfillment, delivery and timeout-command proof as if deployed scheduler/cron or order operations tooling are final
- do not treat the current unblock-pass proof as if refunds, payouts, reconciliation or dispute evidence tooling are final
- do not silently erase the email-delivery gap from future status reports
- do not silently erase the KYC object-storage/admin-UI/notification gaps from future status reports
- do not silently erase the database-backed-search/media/plan-limit gaps from future status reports
- do not silently erase the dev-provider/stock-reservation/notification gaps from future status reports
- do not silently erase the collapsed `SHIPPED -> COMPLETED` receipt shortcut from future status reports
- do not silently erase the internal-only refund/payout ledger proof gap from future status reports
- do not let later KYC/catalog work redefine auth truth without re-checking access boundaries
- do not let catalog work bypass the approved-vendor gate added during Phase 02
- if the project later replays runtime from clean data, re-record `Phase 01` through `Phase 06` evidence instead of assuming this pass replaces that replay

## 15. Session Stop Point

- Stop date: `2026-05-09`
- Runtime stopped after clean H1 email outbox, H1 KYC storage and post-H1 `runtime:r1` verification
- Clean replay completed at `2026-05-08 12:09 MSK +0300`
- Baseline commands passed: `npx prisma migrate reset --force`, `npx prisma generate`, `npm run seed`, `npm run build --workspace apps/api`, `npm run lint --workspace apps/web`, `npm run build --workspace apps/web`
- Replay command passed: `npm run runtime:r1` from `vendora_codebase/apps/api`
- H1 email/storage clean replay completed at `2026-05-08 12:37 MSK +0300`
- H1 commands passed: `npx prisma format`, `npx prisma migrate reset --force`, `npx prisma generate`, `npm run seed`, `npm run build --workspace apps/api`, `npm run runtime:h1-email`, `npm run runtime:h1-storage`, post-H1 `npm run runtime:r1`
- H1 local email worker shell passed at `2026-05-08 12:54 MSK +0300`: `npm run build --workspace apps/api`, `npm run runtime:h1-email-worker --workspace apps/api`
- H1 Resend adapter-code proof passed at `2026-05-08 13:03 MSK +0300`: `node --check scripts/runtime/h1_email_provider_check.mjs`, `npm run build --workspace apps/api`, `npm run runtime:h1-email-provider --workspace apps/api`
- H1 payment provider adapter-code proof passed by `2026-05-08 13:26 MSK +0300`: `node --check scripts/runtime/h1_payment_provider_check.mjs`, `npm run build --workspace apps/api`, `npm run runtime:h1-payment-provider --workspace apps/api`, `npm run runtime:phase04 --workspace apps/api`, `npm run runtime:r1 --workspace apps/api`
- H1 refund provider execution-code proof passed by `2026-05-08 13:40 MSK +0300`: `npx prisma format`, `npx prisma migrate deploy`, `npx prisma generate`, `npm run build --workspace apps/api`, `node --check scripts/runtime/h1_refund_provider_check.mjs`, `npm run runtime:h1-refund-provider --workspace apps/api`, `npm run runtime:phase06 --workspace apps/api`, `npm run runtime:r1 --workspace apps/api`
- H1 payout provider execution-code proof passed by `2026-05-08 20:34 MSK +0300`: `npx prisma format`, `npx prisma migrate deploy`, `npx prisma generate`, `npm run build --workspace apps/api`, `node --check scripts/runtime/h1_payout_provider_check.mjs`, `npm run runtime:h1-payout-provider --workspace apps/api`, `npm run runtime:phase05 --workspace apps/api`, `npm run runtime:phase06 --workspace apps/api`, `npm run runtime:r1 --workspace apps/api`
- H1 money reconciliation proof passed by `2026-05-08 20:50 MSK +0300`: `npx prisma format`, `npx prisma migrate deploy`, `npx prisma generate`, `npm run build --workspace apps/api`, `node --check scripts/runtime/h1_money_reconciliation_check.mjs`, `npm run runtime:h1-money-reconciliation --workspace apps/api`, `npm run runtime:r1 --workspace apps/api`
- H1 money failure-recovery proof passed after reconciliation: `npx prisma format`, `npx prisma migrate deploy`, `npx prisma generate`, `npm run build --workspace apps/api`, `node --check scripts/runtime/h1_money_failure_recovery_check.mjs`, `npm run runtime:h1-money-failure-recovery --workspace apps/api`, `npm run runtime:h1-money-reconciliation --workspace apps/api`, `npm run runtime:r1 --workspace apps/api`
- H1 partial refund proof passed by `2026-05-08 21:31 MSK +0300`: `npx prisma format`, `npx prisma migrate deploy`, `npx prisma generate`, `npm run build --workspace apps/api`, `node --check scripts/runtime/h1_partial_refund_check.mjs`, `npm run runtime:h1-partial-refund --workspace apps/api`, `npm run runtime:h1-refund-provider --workspace apps/api`, `npm run runtime:h1-payout-provider --workspace apps/api`, `npm run runtime:h1-money-failure-recovery --workspace apps/api`, `npm run runtime:h1-money-reconciliation --workspace apps/api`, `npm run runtime:r1 --workspace apps/api`
- H1 money remediation proof passed by `2026-05-08 21:47 MSK +0300`: `npx prisma format`, `npx prisma migrate deploy`, `npx prisma generate`, `npm run build --workspace apps/api`, `node --check scripts/runtime/h1_money_remediation_check.mjs`, `npm run runtime:h1-money-remediation --workspace apps/api`, `npm run runtime:h1-money-failure-recovery --workspace apps/api`, `npm run runtime:h1-money-reconciliation --workspace apps/api`, `npm run runtime:h1-partial-refund --workspace apps/api`, `npm run runtime:r1 --workspace apps/api`
- Local DB status after H1 money remediation: `npx prisma migrate status` reports 14 migrations and schema up to date
- API verification server on `:3001` was stopped after H1 money remediation; `curl http://127.0.0.1:3001/health` failed to connect afterward
- H2 delivery timeout operator-command proof passed on `2026-05-09`: `node --check apps/api/scripts/runtime/h2_delivery_timeout_check.mjs`, `npm run build --workspace apps/api`, `npm run runtime:h2-delivery-timeout --workspace apps/api`, `npm run runtime:h2-fulfillment --workspace apps/api`, `npm run runtime:phase05 --workspace apps/api`, `npm run runtime:r1 --workspace apps/api`, `npx prisma migrate status`
- `runtime:h2-delivery-timeout` covered `H2-DELIVERY-TIMEOUT-01` through `H2-DELIVERY-TIMEOUT-04` on API port `3002`, because port `3001` was occupied by a non-Vendora service
- Maintained `runtime:phase05` was made reset-friendly for repeated local runs by restoring seed-vendor product stock before checkout; post-fix `runtime:phase05` and full `runtime:r1` both passed
- H2 vendor confirmation timeout operator-command proof passed on `2026-05-09`: `node --check apps/api/scripts/runtime/h2_confirmation_timeout_check.mjs`, `node --check apps/api/src/modules/orders/auto-cancel-unconfirmed-orders.ts`, `npm run build --workspace apps/api`, `npm run runtime:h2-confirmation-timeout --workspace apps/api`, `npm run runtime:h2-delivery-timeout --workspace apps/api`, `npm run runtime:h2-fulfillment --workspace apps/api`, `npm run runtime:phase05 --workspace apps/api`, `npm run runtime:r1 --workspace apps/api`, `npx prisma migrate status`
- `runtime:h2-confirmation-timeout` covered `H2-CONFIRMATION-TIMEOUT-01` through `H2-CONFIRMATION-TIMEOUT-04` on API port `3002`, because port `3001` was occupied by a non-Vendora service
- H2 combined order maintenance proof passed on `2026-05-09`: `node --check apps/api/scripts/runtime/h2_order_maintenance_check.mjs`, `node --check apps/api/src/modules/orders/run-maintenance-jobs.ts`, `npm run build --workspace apps/api`, `npm run runtime:h2-order-maintenance --workspace apps/api`, `npm run runtime:h2-confirmation-timeout --workspace apps/api`, `npm run runtime:h2-delivery-timeout --workspace apps/api`, `npm run runtime:h1-stock-expiry --workspace apps/api`, `npm run runtime:r1 --workspace apps/api`, `npx prisma migrate status`
- `runtime:h2-order-maintenance` covered `H2-ORDER-MAINTENANCE-01` through `H2-ORDER-MAINTENANCE-04` on API port `3002`, because port `3001` was occupied by a non-Vendora service
- H2 pre-shipment cancellation stock-return proof passed on `2026-05-09`: `node --check apps/api/scripts/runtime/h2_cancel_stock_return_check.mjs`, `npm run build --workspace apps/api`, `npm run runtime:h2-cancel-stock --workspace apps/api`, `npm run runtime:phase05 --workspace apps/api`, `npm run runtime:h2-confirmation-timeout --workspace apps/api`, `npm run runtime:h2-order-maintenance --workspace apps/api`, `npm run runtime:h1-stock-reservation --workspace apps/api`, `npm run runtime:h1-stock-expiry --workspace apps/api`, `npm run runtime:r1 --workspace apps/api`, `npx prisma migrate status`
- `runtime:h2-cancel-stock` covered `H2-CANCEL-STOCK-01` through `H2-CANCEL-STOCK-04` on API port `3002`, because port `3001` was occupied by a non-Vendora service
- H2 order timeline proof passed on `2026-05-09`: `node --check apps/api/scripts/runtime/h2_order_timeline_check.mjs`, `npm run build --workspace apps/api`, `npm run runtime:h2-order-timeline --workspace apps/api`, `npm run runtime:phase05 --workspace apps/api`
- `runtime:h2-order-timeline` covered `H2-ORDER-TIMELINE-01` through `H2-ORDER-TIMELINE-05` on API port `3002`
- H2 shipped/return stock policy proof passed on `2026-05-09`: `node --check apps/api/scripts/runtime/h2_return_stock_policy_check.mjs`, `npm run build --workspace apps/api`, `npm run runtime:h2-return-stock --workspace apps/api`, `npm run runtime:phase06 --workspace apps/api`
- `runtime:h2-return-stock` covered `H2-RETURN-STOCK-01` through `H2-RETURN-STOCK-04` on API port `3002`
- H2 admin/backend ops proof passed on `2026-05-09`: `node --check apps/api/scripts/runtime/h2_admin_ops_check.mjs`, `npm run build --workspace apps/api`, `npm run runtime:h2-admin-ops --workspace apps/api`, `npm run money:reconcile --workspace apps/api`, `npm run runtime:h1-money-failure-recovery --workspace apps/api`
- `runtime:h2-admin-ops` covered `H2-ADMIN-OPS-01` through `H2-ADMIN-OPS-05` on API port `3002`
- H2 backend RMA inspection proof passed on `2026-05-09`: `node --check apps/api/scripts/runtime/h2_rma_inspection_check.mjs`, `npm run build --workspace apps/api`, `npm run runtime:h2-rma-inspection --workspace apps/api`, `npm run runtime:h2-admin-ops --workspace apps/api`
- `runtime:h2-rma-inspection` covered `H2-RMA-INSPECTION-01` through `H2-RMA-INSPECTION-05` on API port `3002`
- H2 admin order-maintenance ops proof passed on `2026-05-09`: `node --check apps/api/scripts/runtime/h2_admin_order_maintenance_ops_check.mjs`, `npm run build --workspace apps/api`, `npm run runtime:h2-admin-maintenance-ops --workspace apps/api`, `npm run runtime:h2-admin-ops --workspace apps/api`, `npm run runtime:h2-rma-inspection --workspace apps/api`
- `runtime:h2-admin-maintenance-ops` covered `H2-ADMIN-MAINTENANCE-OPS-01` through `H2-ADMIN-MAINTENANCE-OPS-05` on API port `3002`
- H2 admin money ops proof passed on `2026-05-09`: `node --check apps/api/scripts/runtime/h2_admin_money_ops_check.mjs`, `npm run build --workspace apps/api`, `npm run runtime:h2-admin-money-ops --workspace apps/api`, `npm run runtime:h2-admin-ops --workspace apps/api`, `npm run runtime:h2-admin-maintenance-ops --workspace apps/api`, `npm run runtime:h2-rma-inspection --workspace apps/api`
- `runtime:h2-admin-money-ops` covered `H2-ADMIN-MONEY-OPS-01` through `H2-ADMIN-MONEY-OPS-05` on API port `3002`
- H2 admin worker/queue ops proof passed on `2026-05-09`: `node --check apps/api/scripts/runtime/h2_admin_worker_queue_ops_check.mjs`, `npm run build --workspace apps/api`, `npm run runtime:h2-admin-worker-queue-ops --workspace apps/api`, `npm run runtime:h2-admin-ops --workspace apps/api`, `npm run runtime:h2-admin-money-ops --workspace apps/api`, `npm run runtime:h2-admin-maintenance-ops --workspace apps/api`, `npm run runtime:h2-rma-inspection --workspace apps/api`
- `runtime:h2-admin-worker-queue-ops` covered `H2-ADMIN-WORKER-QUEUE-OPS-01` through `H2-ADMIN-WORKER-QUEUE-OPS-05` on API port `3002`
- H2 worker heartbeat proof passed on `2026-05-09`: `npx prisma format`, `npx prisma generate`, `npx prisma migrate deploy`, `node --check apps/api/scripts/runtime/h2_worker_heartbeat_check.mjs`, `npm run build --workspace apps/api`, `npm run runtime:h2-worker-heartbeat --workspace apps/api`, `npm run runtime:h1-email-worker-daemon --workspace apps/api`, `npm run runtime:h2-order-maintenance-worker --workspace apps/api`, `npm run runtime:h2-admin-worker-queue-ops --workspace apps/api`, `npm run runtime:h2-admin-ops --workspace apps/api`
- `runtime:h2-worker-heartbeat` covered `H2-WORKER-HEARTBEAT-01` through `H2-WORKER-HEARTBEAT-05` on API port `3002`
- Local DB status after H2 worker heartbeat: `npx prisma migrate status` reports 18 migrations and schema up to date
- API verification server on `:3002` was stopped after H2 worker heartbeat verification; `curl http://127.0.0.1:3002/health` failed to connect afterward
- Docker services were left running:
  - PostgreSQL host port `55432`
  - Redis `6379`
  - Meilisearch `7700`
- API verification server on `:3001` was stopped
- Exact resume point: run live external email provider proof, run live payment/refund/payout provider sandbox proof, wire deployed scheduler/cron for operator jobs, or choose the next `H1`/`H2` admin-ops hardening target from [`source/planning/r1_closeout_hardening_plan.md`](../source/planning/r1_closeout_hardening_plan.md); no `phase_07` file exists; API is currently stopped
