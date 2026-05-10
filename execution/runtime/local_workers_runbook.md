# Vendora Local Worker Runbook

This runbook records local/runtime worker wiring only. It is not production deployment evidence.

## Worker Processes

The local Compose file has an explicit `workers` profile:

```bash
docker compose --profile workers up -d notification-worker order-maintenance-worker
```

Default `docker compose up -d` still starts only the local infrastructure services.

## Notification Worker

Entrypoint:

```bash
npm run notifications:worker --workspace apps/api
```

Compose service:

```text
notification-worker
```

Purpose:

- drains `NotificationOutbox`;
- writes provider name, provider message id, attempts, sent timestamp and failure error evidence;
- supports `EMAIL_PROVIDER=dev_log` for local/dev and `EMAIL_PROVIDER=resend` for the Resend adapter.

Important:

- local `dev_log` proof is not real email delivery;
- local mock Resend proof is not provider dashboard/API evidence;
- launch-grade email proof still requires real provider credentials and external provider evidence.

Live provider proof command:

```bash
npm run runtime:h1-email-live-provider:compose
```

Required environment:

```text
RESEND_API_KEY
EMAIL_FROM
EMAIL_LIVE_TEST_RECIPIENT
```

Notes:

- the command runs inside the Compose network and connects to Postgres at `postgres:5432`;
- it uses `EMAIL_PROVIDER=resend` and the real HTTPS Resend API by default;
- `RESEND_API_BASE_URL` must not point to localhost or another mock endpoint for this proof.

## Order Maintenance Worker

Entrypoint:

```bash
npm run orders:maintenance-worker --workspace apps/api
```

Compose service:

```text
order-maintenance-worker
```

Purpose:

- expires abandoned checkout sessions and releases stock reservations;
- auto-cancels old unconfirmed `PAYMENT_HELD` orders;
- auto-completes old `DELIVERED` orders and releases funds to `RELEASABLE`;
- uses the same shared service as `npm run orders:run-maintenance --workspace apps/api`.

Important:

- this is local/process wiring;
- production scheduler/cron evidence remains separate unless the same services are deployed and observed in the target environment.

## Verification Commands

```bash
npm run build --workspace apps/api
npm run runtime:h1-email-worker-daemon --workspace apps/api
npm run runtime:h2-order-maintenance-worker --workspace apps/api
docker compose --profile workers config
docker compose run --rm --no-deps notification-worker npm run notifications:worker --workspace apps/api -- --once --limit=1 --event-type=DOCKER_COMPOSE_WORKER_SMOKE --reference-id=none
docker compose run --rm --no-deps order-maintenance-worker npm run orders:maintenance-worker --workspace apps/api -- --once --limit=1 --now=1970-01-01T00:00:00.000Z
```
