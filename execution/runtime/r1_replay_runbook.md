# Vendora — R1 Replay Runbook

This runbook records how to replay the current `R1` runtime proof from a reset-friendly local baseline.

It is intentionally conservative:

- it does not claim a fully automated replay harness exists yet;
- it separates safe verification commands from destructive reset commands;
- it keeps local/dev proof separate from launch-grade provider proof.

---

## 1. Current Replay Status

```text
Replay status: maintained full-harness entrypoints, clean-data replay recorded.
```

What exists:

- migrations for `Phase 01` through `Phase 06`;
- seed script for baseline buyer/vendor/admin data;
- stable live check entrypoints currently present for every numbered R1 phase:
  - `apps/api/scripts/runtime/phase01_auth_check.mjs`
  - `apps/api/scripts/runtime/phase02_vendor_gate_check.mjs`
  - `apps/api/scripts/runtime/phase03_catalog_check.mjs`
  - `apps/api/scripts/runtime/phase04_checkout_check.mjs`
  - `apps/api/scripts/runtime/phase05_orders_check.mjs`
  - `apps/api/scripts/runtime/phase06_disputes_money_check.mjs`
- those entrypoints now contain the maintained Phase 05/06 check bodies;
- historical/compatibility copies still exist at:
  - `apps/api/tmp_phase05_check.mjs`
  - `apps/api/tmp_phase06_check.mjs`
- npm replay commands:
  - `npm run runtime:r1`
  - `npm run runtime:r1-partial`
- status-recorded runtime evidence for:
  - `R1-AUTH-*`
  - `R1-KYC-*`
  - `R1-CAT-*`
  - `R1-CHK-*`
  - `R1-ORD-*`
  - `R1-DISP-*`
  - `R1-MONEY-*`
  - `R1-AUDIT-*`

Latest clean replay:

- date: `2026-05-08 12:37 MSK +0300`;
- local services:
  - PostgreSQL on host port `55432`;
  - Redis on `6379`;
  - Meilisearch on `7700`;
- reset/reseed:
  - `npx prisma migrate reset --force` applied `20260501205500_init`, `20260507230000_phase01_auth_foundation`, `20260508010000_phase02_vendor_gate`, `20260508020000_phase03_catalog`, `20260508030000_phase04_checkout`, `20260508050000_phase06_disputes_money`, `20260508110000_h1_notification_outbox`, `20260508113000_h1_kyc_private_storage`;
  - `npx prisma generate` succeeded;
  - `npm run seed` succeeded and created baseline buyer/vendor/admin plus 3 published products;
- baseline verification:
  - `npm run build --workspace apps/api` succeeded;
  - earlier same-day clean replay also passed `npm run lint --workspace apps/web` and `npm run build --workspace apps/web`;
- API:
  - started with `npm run dev --workspace apps/api`;
  - listened on `127.0.0.1:3001`;
  - stopped after replay;
  - `curl -sS --max-time 2 http://127.0.0.1:3001/health` failed to connect afterward, as expected;
- replay:
  - `npm run runtime:h1-email` succeeded from `vendora_codebase/apps/api`;
  - `npm run runtime:h1-storage` succeeded from `vendora_codebase/apps/api`;
  - `npm run runtime:r1` succeeded from `vendora_codebase/apps/api`;
  - all Phase 01 through Phase 06 maintained runtime checks returned `ok: true`.

Remaining gap:

- this is local/dev clean replay evidence only; it does not replace launch-grade provider, storage, fulfillment, refund, payout, reconciliation, notification, or admin-UI proof.

Interpretation:

- this runbook is enough to run a one-command full local R1 replay when the API is running;
- the maintained harness now has fresh clean-data local replay evidence;
- launch-grade external-provider proof remains separate hardening work.

---

## 2. Preconditions

Expected local services:

- PostgreSQL on host port `55432`
- Redis on `6379`
- Meilisearch on `7700`

Expected working directories:

- project root: `/home/nickf/Documents/product_development/vendora`
- execution asset: `/home/nickf/Documents/product_development/vendora/vendora_codebase`
- API app: `/home/nickf/Documents/product_development/vendora/vendora_codebase/apps/api`

Expected API env:

- `apps/api/.env`
- `DATABASE_URL="postgresql://vendora:vendora@127.0.0.1:55432/vendora"` for the current local Docker Postgres
- `JWT_SECRET="local-dev-secret"`

API process rule:

- API should be stopped before replay starts;
- API should be stopped again after replay evidence is collected.

---

## 3. Safe Baseline Verification

From `vendora_codebase/`:

```bash
npm run build --workspace apps/api
npm run lint --workspace apps/web
npm run build --workspace apps/web
```

From `vendora_codebase/apps/api/`:

```bash
npx prisma migrate status
```

If the host-side Prisma check reports `P1001` while the Compose Postgres service is healthy, run the
same migration status check inside the Compose network from `vendora_codebase/`:

```bash
npm run db:migrate:deploy:compose
npm run db:migrate:status:compose
```

Expected result:

- API build succeeds;
- web lint succeeds;
- web build succeeds;
- migrations are applied or pending migrations are explicit before runtime proof.

Current local note:

- on `2026-05-10`, host-side Node/Prisma access to the published Postgres port `127.0.0.1:55432`
  showed an environment-level connection/handshake failure;
- the same Prisma migration status command succeeded inside the Compose network against
  `postgres:5432`, reporting 23 migrations and `Database schema is up to date!`;
- the one-off slim Node tooling container may print Prisma OpenSSL detection warnings; treat the
  migration status result and exit code as the replay gate for this command;
- this keeps replay verification on the Docker-backed runtime path without treating host port
  publishing as migration evidence.

---

## 4. Clean Replay Sequence

Use this only when the intent is to replay from clean runtime data.

Destructive reset warning:

- database data will be wiped;
- do not run this on shared or production-like data;
- keep Docker services running unless the goal is infra reset too.

From `vendora_codebase/apps/api/`:

```bash
npx prisma migrate reset --force
npx prisma generate
npm run seed
```

From `vendora_codebase/`:

```bash
npm run build --workspace apps/api
npm run lint --workspace apps/web
npm run build --workspace apps/web
```

Start API from `vendora_codebase/`:

```bash
npm run dev --workspace apps/api
```

If port `3001` is occupied by another local service, start the API on another port and pass `RUNTIME_API_URL` to runtime scripts:

```bash
PORT=3002 npm run dev --workspace apps/api
RUNTIME_API_URL=http://127.0.0.1:3002 npm run runtime:r1 --workspace apps/api
```

Then run available maintained checks from `vendora_codebase/apps/api/`:

```bash
npm run runtime:r1
```

If intentionally checking only the already older-maintained Phase 05/06 subset:

```bash
npm run runtime:r1-partial
```

Stop API after checks.

Confirm API is stopped:

```bash
curl -sS --max-time 2 http://127.0.0.1:3001/health
```

Expected stopped result:

```text
curl: (7) Failed to connect
```

---

## 5. Full R1 Replay Harness

A full replay of the numbered `R1` pack now has maintained check entrypoints for:

- `phase01_auth_check`
- `phase02_vendor_gate_check`
- `phase03_catalog_check`
- `phase04_checkout_check`
- `phase05_orders_check`
- `phase06_disputes_money_check`

Current state:

- the full `runtime:r1` command was executed from clean data on `2026-05-08` and recorded as a fresh local replay result;
- after H1 stock reservation hardening, `npm run runtime:h1-stock-reservation --workspace apps/api`, `npm run runtime:phase04 --workspace apps/api` and `npm run runtime:r1 --workspace apps/api` passed on the current local DB/API on `2026-05-08`;
- after H1 checkout expiry/reaper hardening, `npm run runtime:h1-stock-expiry --workspace apps/api`, `npm run runtime:h1-stock-reservation --workspace apps/api`, `npm run runtime:phase04 --workspace apps/api` and `npm run runtime:r1 --workspace apps/api` passed on the current local DB/API on `2026-05-08`;
- after H2 fulfillment/delivery hardening, `npm run runtime:h2-fulfillment --workspace apps/api`, `npm run runtime:phase05 --workspace apps/api` and `npm run runtime:r1 --workspace apps/api` passed on `2026-05-09` using `RUNTIME_API_URL=http://127.0.0.1:3002`;
- after H2 delivery timeout hardening, `npm run runtime:h2-delivery-timeout --workspace apps/api`, `npm run runtime:h2-fulfillment --workspace apps/api`, `npm run runtime:phase05 --workspace apps/api` and `npm run runtime:r1 --workspace apps/api` passed on `2026-05-09` using `RUNTIME_API_URL=http://127.0.0.1:3002`;
- after H2 vendor confirmation timeout hardening, `npm run runtime:h2-confirmation-timeout --workspace apps/api`, `npm run runtime:h2-delivery-timeout --workspace apps/api`, `npm run runtime:h2-fulfillment --workspace apps/api`, `npm run runtime:phase05 --workspace apps/api` and `npm run runtime:r1 --workspace apps/api` passed on `2026-05-09` using `RUNTIME_API_URL=http://127.0.0.1:3002`;
- after H2 combined order maintenance hardening, `npm run runtime:h2-order-maintenance --workspace apps/api`, `npm run runtime:h2-confirmation-timeout --workspace apps/api`, `npm run runtime:h2-delivery-timeout --workspace apps/api`, `npm run runtime:h1-stock-expiry --workspace apps/api` and `npm run runtime:r1 --workspace apps/api` passed on `2026-05-09` using `RUNTIME_API_URL=http://127.0.0.1:3002`;
- after H2 pre-shipment cancellation stock-return hardening, `npm run runtime:h2-cancel-stock --workspace apps/api`, `npm run runtime:phase05 --workspace apps/api`, `npm run runtime:h2-confirmation-timeout --workspace apps/api`, `npm run runtime:h2-order-maintenance --workspace apps/api`, `npm run runtime:h1-stock-reservation --workspace apps/api`, `npm run runtime:h1-stock-expiry --workspace apps/api` and `npm run runtime:r1 --workspace apps/api` passed on `2026-05-09` using `RUNTIME_API_URL=http://127.0.0.1:3002`;
- `runtime:phase05` now restores its seed-vendor product stock before checkout, which keeps repeated local replays compatible with H1 stock reservation/decrement on non-clean data;
- Phase 01 through Phase 04 reconstructed maintained scripts now have clean replay confirmation;
- the Phase 05 and Phase 06 entrypoints now contain maintained check bodies and honor `RUNTIME_API_URL`;
- `tmp_phase05_check.mjs` and `tmp_phase06_check.mjs` remain only historical/compatibility copies.

Required H0 hardening:

1. keep scripts reset-friendly and safe for repeated local runs;
2. keep status files as the source of truth for what each check proves;
3. choose the next `H1` provider/storage hardening target without upgrading local/dev proof into launch-grade claims.

---

## 6. Evidence Rules

Every replay must record:

- date and local service ports;
- migration state;
- seed result;
- build/lint result;
- API start/stop fact;
- check IDs executed;
- known gaps that remain after replay.

Never record:

- local/dev email token, local `dev_log` worker proof, or local mock Resend proof as real email delivery;
- local/dev payment webhook as real provider integration;
- internal refund ledger as provider refund execution;
- `RELEASABLE` balance as provider payout completion;
- API-only admin flow as polished launch UI.
- local worker entrypoints as deployed scheduler/cron evidence.

---

## 7. Latest Clean Replay Check IDs

Recorded `2026-05-08` by `npm run runtime:r1`:

- `R1-AUTH-01` through `R1-AUTH-08`
- `R1-KYC-01` through `R1-KYC-08`
- `R1-CAT-01` through `R1-CAT-07`
- `R1-CHK-01` through `R1-CHK-09`
- `R1-ORD-01` through `R1-ORD-07`
- `R1-DISP-01` through `R1-DISP-03`
- `R1-MONEY-01` through `R1-MONEY-03`
- `R1-AUDIT-01`

Latest H1 local/internal money reconciliation evidence recorded `2026-05-08`:

- `H1-MONEY-RECON-01`
- `H1-MONEY-RECON-02`
- `H1-MONEY-RECON-03`

Latest H1 local/internal money failure-recovery evidence:

- `H1-MONEY-FAILURE-01`
- `H1-MONEY-FAILURE-02`
- `H1-MONEY-FAILURE-03`
- `H1-MONEY-FAILURE-04`

Latest H1 local/internal partial refund evidence:

- `H1-PARTIAL-REFUND-01`
- `H1-PARTIAL-REFUND-02`
- `H1-PARTIAL-REFUND-03`
- `H1-PARTIAL-REFUND-04`

Latest H1 local/internal money remediation evidence:

- `H1-MONEY-REMEDIATION-01`
- `H1-MONEY-REMEDIATION-02`
- `H1-MONEY-REMEDIATION-03`
- `H1-MONEY-REMEDIATION-04`
- `H1-MONEY-REMEDIATION-05`

Recommended next action:

```text
Continue H1 from source/planning/r1_closeout_hardening_plan.md:
run live external email provider proof,
run live payment/refund/payout provider sandbox proof,
or choose the next H1/H2 admin-ops target.
```
