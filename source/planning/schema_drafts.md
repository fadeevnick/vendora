# Vendora — Schema Drafts

Этот артефакт переводит launch-first planning layer в storage shape.

Он нужен, чтобы:

- связать access matrix, state machines и API contracts с конкретными сущностями;
- не оставлять tenant isolation и money path “примерно понятными”;
- не затащить target-only таблицы в `R1` без причины.

Это не финальный SQL.
Это canonical draft того, какие данные обязаны существовать и какие инварианты должны быть сохранены.

---

## 1. Drafting Rules

1. Любая vendor-scoped сущность должна иметь `vendor_id`.
2. Любая buyer-scoped сущность должна иметь `buyer_user_id` или явную guest-compatible owner model.
3. Raw KYC/dispute/listing files не лежат в БД; в БД хранится только metadata + storage key.
4. Money-sensitive изменения не должны опираться только на mutable current-state row; нужен durable event trail.
5. Launch-first schema может быть уже target, но не должна включать таблицы, которые не помогают `R1`.

---

## 2. Launch-First Entity Map

| Entity | Purpose | Scope |
|---|---|---|
| `users` | buyer/vendor/admin identities | Launch |
| `password_credentials` | email/password auth | Launch |
| `email_verification_tokens` | verify-email flow | Launch |
| `sessions` | active user sessions | Launch |
| `platform_admin_accounts` | separate privileged admin path | Launch |
| `vendors` | vendor workspace and high-level status | Launch |
| `vendor_memberships` | owner-first tenant access model | Launch |
| `vendor_applications` | KYC/application submission lifecycle | Launch |
| `vendor_application_documents` | admin-only KYC document metadata | Launch |
| `listings` | vendor sellable supply | Launch |
| `listing_media` | listing file metadata | Launch |
| `carts` | buyer or guest-compatible cart shell | Launch |
| `cart_items` | grouped vendor items in cart | Launch |
| `checkout_sessions` | validated checkout intent and provider session | Launch |
| `stock_reservations` | checkout-owned available-stock reservation evidence | H1 |
| `idempotency_records` | protects duplicate-prone mutations | Launch |
| `payment_provider_events` | webhook replay safety | Launch |
| `refund_provider_executions` | provider refund evidence for buyer-favor outcomes | H1 |
| `orders` | vendor-specific orders | Launch |
| `order_items` | order line items snapshot | Launch |
| `disputes` | dispute lifecycle and final resolution | Launch |
| `dispute_messages` | buyer/vendor/admin thread | Launch |
| `dispute_evidence` | evidence file metadata | Launch |
| `order_funds` | per-order escrow/payout eligibility state | Launch |
| `payout_provider_executions` | provider payout evidence for paid-out vendor funds | H1 |
| `vendor_balance_ledger` | durable money trail per vendor | Launch |
| `notification_outbox` | transactional notifications queue | Launch |
| `audit_events` | immutable log for KYC/money/dispute/admin actions | Launch |

---

## 3. Identity And Access Tables

### `users`

Core identity row for every human actor.

| Column | Notes |
|---|---|
| `id` | primary key |
| `email` | unique, case-insensitive |
| `display_name` | optional in `R1` |
| `email_verified_at` | null until verify flow completes |
| `status` | `ACTIVE`, `BLOCKED`, `PENDING_VERIFICATION` |
| `created_at`, `updated_at` | timestamps |

Notes:

- no global “vendor/admin/buyer only” hard split in this table;
- actor authority comes from memberships and admin assignment rows.

### `password_credentials`

| Column | Notes |
|---|---|
| `user_id` | unique FK to `users` |
| `password_hash` | never plaintext |
| `password_updated_at` | credential rotation support |
| `failed_login_count` | can be cached later, durable fallback acceptable |
| `locked_until` | supports `FR-AUTH-004` |

### `email_verification_tokens`

| Column | Notes |
|---|---|
| `id` | primary key |
| `user_id` | FK |
| `token_hash` | do not store raw token |
| `expires_at` | supports 48h TTL |
| `consumed_at` | one-time use |

### `sessions`

| Column | Notes |
|---|---|
| `id` | primary key |
| `user_id` | FK |
| `session_token_hash` | never raw token |
| `actor_context` | buyer-only, vendor context, admin path |
| `expires_at` | session expiry |
| `revoked_at` | required for block/revoke |

### `platform_admin_accounts`

Separate privileged access assignment for `FR-AUTH-007`.

| Column | Notes |
|---|---|
| `user_id` | unique FK |
| `status` | `ACTIVE`, `SUSPENDED` |
| `granted_by_user_id` | auditability |
| `created_at` | timestamp |

Launch note:

- this can stay simple;
- admin-specific SSO/2FA belongs to later runtime depth.

---

## 4. Vendor And KYC Tables

### `vendors`

Workspace-level tenant row.

| Column | Notes |
|---|---|
| `id` | primary key |
| `slug` | unique public/vendor identifier |
| `business_name` | required |
| `legal_entity_name` | required |
| `tax_id` | required |
| `country` | required |
| `address_json` | launch-friendly address snapshot |
| `sales_category` | required |
| `status` | `ONBOARDING`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `BLOCKED` |
| `approved_at` | nullable |
| `blocked_at` | nullable |
| `created_at`, `updated_at` | timestamps |

### `vendor_memberships`

Tenant access boundary.

| Column | Notes |
|---|---|
| `id` | primary key |
| `vendor_id` | FK |
| `user_id` | FK |
| `role` | `OWNER`, `ADMIN`, `MANAGER`, `VIEWER` |
| `status` | `ACTIVE`, `REVOKED`, `INVITED` |
| `created_at`, `revoked_at` | timestamps |

Launch rule:

- `R1` can effectively operate with only `OWNER`;
- schema still preserves future roles.

### `vendor_applications`

Current KYC/application lifecycle.

| Column | Notes |
|---|---|
| `id` | primary key |
| `vendor_id` | FK |
| `submitted_by_user_id` | owner identity |
| `status` | `DRAFT`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `REQUEST_MORE_INFO`, `BLOCKED` |
| `review_note` | latest admin note |
| `reviewed_by_user_id` | nullable |
| `submitted_at`, `reviewed_at` | timestamps |
| `rejection_reason_code` | nullable |

State authority:

- must follow `state_machines.md`;
- `vendors.status` and `vendor_applications.status` must not drift.

### `vendor_application_documents`

Protected KYC metadata only.

| Column | Notes |
|---|---|
| `id` | primary key |
| `vendor_application_id` | FK |
| `document_type` | e.g. registration certificate |
| `file_name` | original file name |
| `content_type` | PDF/JPEG/PNG |
| `size_bytes` | max validation support |
| `storage_key` | object storage reference |
| `storage_provider` | current private storage driver |
| `stored_size_bytes` | actual stored object size |
| `content_sha256` | stored object integrity evidence |
| `uploaded_by_user_id` | owner identity |
| `created_at` | timestamp |
| `storage_confirmed_at` | raw object write confirmation |

Critical rule:

- raw file access is admin-only;
- every admin read of this document must create an `audit_events` row.

---

## 5. Catalog Tables

### `listings`

| Column | Notes |
|---|---|
| `id` | primary key |
| `vendor_id` | FK |
| `title` | required |
| `description` | required |
| `category` | required |
| `price_minor` | required |
| `currency` | required |
| `stock_qty` | required, integer >= 0 |
| `status` | `DRAFT`, `PUBLISHED`, `UNPUBLISHED` |
| `published_at` | nullable |
| `unpublished_reason` | nullable |
| `created_at`, `updated_at` | timestamps |

Launch rule:

- only `APPROVED` vendors can publish;
- blocked vendor listings must disappear from public read paths without manual edits.

### `listing_media`

| Column | Notes |
|---|---|
| `id` | primary key |
| `listing_id` | FK |
| `storage_key` | object storage reference |
| `sort_order` | launch may keep simple integer order |
| `content_type` | metadata |
| `created_at` | timestamp |

Launch note:

- no need for variants/thumbnails table in `R1`;
- CDN/image derivations can come later.

---

## 6. Cart And Checkout Tables

### `carts`

| Column | Notes |
|---|---|
| `id` | primary key |
| `buyer_user_id` | nullable if guest cart path enabled |
| `guest_key` | nullable, unique for guest path |
| `currency` | launch single-currency friendly |
| `version` | increment on each mutation |
| `expires_at` | supports guest persistence TTL |
| `created_at`, `updated_at` | timestamps |

Constraint:

- either `buyer_user_id` or `guest_key` must be present;
- only one active cart per owner context.

### `cart_items`

| Column | Notes |
|---|---|
| `id` | primary key |
| `cart_id` | FK |
| `listing_id` | FK |
| `vendor_id` | denormalized for grouping and validation |
| `quantity` | integer > 0 |
| `unit_price_minor_snapshot` | launch revalidation baseline |
| `created_at`, `updated_at` | timestamps |

### `checkout_sessions`

Validated checkout intent before provider finalization.

| Column | Notes |
|---|---|
| `id` | primary key |
| `buyer_user_id` | nullable only if guest checkout enabled later |
| `cart_id` | FK |
| `cart_version` | must match request |
| `shipping_address_json` | order snapshot source |
| `total_minor` | validated total |
| `currency` | required |
| `provider_name` | e.g. Stripe |
| `provider_session_id` | unique external reference |
| `status` | `AWAITING_PAYMENT`, `SUCCEEDED`, `FAILED`, `EXPIRED` |
| `expires_at` | reservation/session expiry deadline |
| `completed_at` | nullable |
| `created_at`, `updated_at` | timestamps |

Launch rule:

- checkout session is not the final order;
- final orders appear only after trusted payment event.

### `stock_reservations`

Local H1 stock hardening treats product stock as available stock and explains checkout-owned decrements.

| Column | Notes |
|---|---|
| `id` | primary key |
| `checkout_session_id` | FK |
| `product_id` | FK |
| `quantity` | reserved quantity |
| `status` | `RESERVED`, `COMMITTED`, `RELEASED` |
| `created_at`, `updated_at` | timestamps |

Rules:

- checkout session creation atomically decrements available product stock and creates `RESERVED` rows;
- payment failure releases `RESERVED` rows and increments available product stock;
- payment success commits reservations without a second product-stock decrement;
- checkout expiry releases abandoned `RESERVED` rows and marks checkout sessions `EXPIRED`;
- provider webhook replay must not duplicate reservations, orders or stock changes.

Remaining hardening:

- deployed scheduler/cron wiring for the expiry reaper;
- broader concurrency stress around simultaneous checkout attempts.

### `idempotency_records`

Protects `checkout`, `submit application`, `confirm receipt`, `open dispute`, `resolve dispute`.

| Column | Notes |
|---|---|
| `id` | primary key |
| `actor_user_id` | nullable for signed system/provider path |
| `route_key` | e.g. `POST:/api/checkout/sessions` |
| `idempotency_key` | caller-provided key |
| `request_hash` | detect conflicting reuse |
| `response_ref_type` | e.g. `checkout_session` |
| `response_ref_id` | points to created row |
| `created_at`, `expires_at` | timestamps |

Unique constraint:

- `(actor_user_id, route_key, idempotency_key)`

### `payment_provider_events`

Webhook replay protection.

| Column | Notes |
|---|---|
| `id` | primary key |
| `provider_name` | required |
| `provider_event_id` | unique |
| `checkout_session_id` | FK if resolved |
| `event_type` | payment success/failure/etc |
| `payload_hash` | immutable reference |
| `processed_at` | idempotent processing marker |
| `created_at` | timestamp |

---

## 7. Order Tables

### `orders`

One row per vendor-specific order produced from a successful checkout.

| Column | Notes |
|---|---|
| `id` | primary key |
| `checkout_session_id` | FK |
| `buyer_user_id` | buyer owner |
| `vendor_id` | FK |
| `order_number` | unique public-friendly identifier |
| `state` | `CREATED`, `PAYMENT_HELD`, `PAYMENT_FAILED`, `CONFIRMED`, `SHIPPED`, `DELIVERED`, `COMPLETED`, `CANCELLED`, `DISPUTED` |
| `shipping_address_json` | immutable purchase snapshot |
| `shipment_carrier` | optional carrier captured on vendor ship |
| `shipment_tracking_number` | optional tracking reference captured on vendor ship |
| `shipment_metadata_json` | optional provider/carrier/service metadata |
| `shipped_at` | nullable timestamp |
| `buyer_email_snapshot` | confirmation path stability |
| `vendor_confirmation_deadline_at` | useful for later timeout |
| `delivered_at`, `completed_at`, `cancelled_at` | nullable timestamps |
| `created_at`, `updated_at` | timestamps |

Rules:

- must never be cross-tenant readable;
- state transitions only through explicit allowed events.
- H2 local proof now covers optional shipment metadata capture and `SHIPPED -> DELIVERED -> COMPLETED`.
- H2 local/operator proof now uses `delivered_at` for delivery-timeout auto-complete from old `DELIVERED` orders to `COMPLETED`.
- H2 local/operator proof now uses `created_at` for vendor-confirmation-timeout auto-cancel from old `PAYMENT_HELD` orders to `CANCELLED`.

### `order_items`

| Column | Notes |
|---|---|
| `id` | primary key |
| `order_id` | FK |
| `listing_id` | original source listing |
| `listing_title_snapshot` | immutable snapshot |
| `quantity` | integer > 0 |
| `unit_price_minor` | immutable purchase snapshot |
| `line_total_minor` | stored to avoid recalculation ambiguity |

Launch note:

- order item snapshot prevents later listing edits from mutating historical orders.

---

## 8. Dispute Tables

### `disputes`

| Column | Notes |
|---|---|
| `id` | primary key |
| `order_id` | FK, unique for one active dispute at a time |
| `vendor_id` | denormalized tenant boundary |
| `buyer_user_id` | buyer owner |
| `state` | `OPEN`, `VENDOR_RESPONSE`, `PLATFORM_REVIEW`, `RESOLVED`, `CLOSED_WITH_AGREEMENT` |
| `reason_code` | buyer-selected reason |
| `description` | buyer statement |
| `resolution_type` | nullable until resolved |
| `resolved_by_user_id` | nullable admin FK |
| `resolved_at` | nullable |
| `created_at`, `updated_at` | timestamps |

Launch rule:

- product may collapse `OPEN` into immediate `VENDOR_RESPONSE`;
- `BUYER_FAVOR_PARTIAL_REFUND` is now active in local H1 runtime proof.

### `dispute_messages`

| Column | Notes |
|---|---|
| `id` | primary key |
| `dispute_id` | FK |
| `author_user_id` | buyer/vendor/admin actor |
| `author_actor_type` | `BUYER`, `VENDOR`, `ADMIN`, `SYSTEM` |
| `message` | text |
| `created_at` | timestamp |

### `dispute_evidence`

| Column | Notes |
|---|---|
| `id` | primary key |
| `dispute_id` | FK |
| `uploaded_by_user_id` | actor identity |
| `file_name` | metadata |
| `content_type` | PDF/JPEG/PNG |
| `storage_key` | object storage reference |
| `created_at` | timestamp |

---

## 9. Money And Audit Tables

### `order_funds`

One money row per order for escrow/payout eligibility state.

| Column | Notes |
|---|---|
| `id` | primary key |
| `order_id` | unique FK |
| `vendor_id` | FK |
| `gross_amount_minor` | total captured for this vendor order |
| `commission_amount_minor` | platform fee |
| `net_amount_minor` | vendor amount before payout |
| `refunded_amount_minor` | partial/full refund amount already returned to buyer |
| `frozen_amount_minor` | disputed portion, if modeled separately later |
| `state` | `HELD`, `RELEASABLE`, `FROZEN_DISPUTE`, `IN_PAYOUT_BATCH`, `PAID_OUT`, `RETURNED_TO_BUYER`, `PAYOUT_FAILED_REVIEW` |
| `provider_charge_ref` | external money reference |
| `releasable_at` | nullable |
| `paid_out_at` | nullable |
| `created_at`, `updated_at` | timestamps |

Rules:

- vendor actor never mutates this table directly;
- state follows payout eligibility machine;
- dispute-open order cannot remain effectively releasable.
- partial refund leaves `state = RELEASABLE`, sets `refunded_amount_minor`, and makes only the remaining amount payout-eligible.

### `vendor_balance_ledger`

Durable append-only money trail for aggregation and audit.

| Column | Notes |
|---|---|
| `id` | primary key |
| `vendor_id` | FK |
| `order_id` | nullable FK for order-linked entries |
| `entry_type` | `HOLD_CREATED`, `RELEASED`, `FROZEN`, `REFUNDED`, `PAID_OUT`, `PAYOUT_SENT`, `PAYOUT_FAILED` |
| `amount_minor` | signed or explicitly typed amount |
| `currency` | required |
| `reference_type` | payment, dispute, payout |
| `reference_id` | domain pointer |
| `created_at` | immutable timestamp |

Use:

- powers `GET /api/vendor/balance`;
- keeps money history independent from mutable current-state rows.

### `refund_provider_executions`

Local/provider refund execution evidence for buyer-favor dispute outcomes.

| Column | Notes |
|---|---|
| `id` | primary key |
| `dispute_id` | FK, unique for one full-refund execution in current H1 path |
| `order_id` | FK |
| `provider_name` | e.g. `dev_mock`, Stripe/YooKassa later |
| `provider_refund_id` | external/provider reference |
| `amount_minor` | refunded amount |
| `currency` | required |
| `status` | `SUCCEEDED`, `FAILED` |
| `reviewed_at`, `reviewed_by_user_id`, `review_note` | operator review metadata for failed executions |
| `raw_payload_json` | provider response/reference payload |
| `created_at`, `updated_at` | timestamps |

Launch note:

- current proof is local `REFUND_PROVIDER=dev_mock`;
- partial refund uses the requested refund amount instead of the full order fund amount;
- failed local refund provider execution leaves dispute/funds in review-safe state;
- live provider dashboard/API refund evidence remains outside this local proof.

### `payout_provider_executions`

Local/provider payout execution evidence for releasable vendor funds.

| Column | Notes |
|---|---|
| `id` | primary key |
| `order_fund_id` | FK, unique for current one-fund payout path |
| `order_id` | FK |
| `vendor_id` | FK |
| `provider_name` | e.g. `dev_mock`, Stripe/YooKassa later |
| `provider_payout_id` | external/provider reference |
| `amount_minor` | paid vendor net amount |
| `currency` | required |
| `status` | `SUCCEEDED`, `FAILED` |
| `reviewed_at`, `reviewed_by_user_id`, `review_note` | operator review metadata for failed executions |
| `raw_payload_json` | provider response/reference payload |
| `created_at`, `updated_at` | timestamps |

Launch note:

- current proof is local `PAYOUT_PROVIDER=dev_mock`;
- failed local payout provider execution moves funds to `PAYOUT_FAILED_REVIEW` without creating paid-out ledger evidence;
- failed local payout/refund executions can be marked reviewed or retried by admin-only remediation endpoints;
- live provider dashboard/API payout and reconciliation evidence remains outside this local proof.

### `money_reconciliation_runs`

Operator/internal reconciliation run summary over local provider artifacts.

| Column | Notes |
|---|---|
| `id` | primary key |
| `status` | `SUCCEEDED` or `FAILED` |
| `checked_payments` | processed payment provider event count |
| `checked_refunds` | refund execution count |
| `checked_payouts` | payout execution count |
| `mismatches` | mismatched item count |
| `started_at`, `completed_at` | timestamps |

### `money_reconciliation_items`

Item-level reconciliation evidence.

| Column | Notes |
|---|---|
| `id` | primary key |
| `run_id` | FK |
| `item_type` | `PAYMENT_EVENT`, `REFUND_EXECUTION`, `PAYOUT_EXECUTION` |
| `resource_id` | checked domain/provider artifact id |
| `status` | `MATCHED` or `MISMATCHED` |
| `detail_json` | comparison details |
| `created_at` | timestamp |

Launch note:

- current reconciliation proof checks local/internal artifacts;
- controlled local provider failures are matched only when their domain state remains review-safe;
- external provider dashboard/API reconciliation remains separate launch-grade evidence.

### `notification_outbox`

| Column | Notes |
|---|---|
| `id` | primary key |
| `event_type` | `ORDER_CREATED`, `DISPUTE_OPENED`, `KYC_APPROVED`, etc |
| `recipient_user_id` | nullable for external-only email |
| `recipient_email` | fallback snapshot |
| `payload_json` | render context |
| `status` | `PENDING`, `SENT`, `FAILED` |
| `scheduled_at`, `sent_at` | timestamps |

Launch note:

- enough for transactional emails;
- richer channel preferences come later.

### `audit_events`

Immutable log for privileged and sensitive actions.

| Column | Notes |
|---|---|
| `id` | primary key |
| `actor_user_id` | nullable for system/provider events |
| `actor_type` | `BUYER`, `VENDOR`, `ADMIN`, `SYSTEM`, `PROVIDER` |
| `event_type` | e.g. `KYC_DOCUMENT_VIEWED`, `DISPUTE_RESOLVED` |
| `resource_type` | vendor application, order, dispute, payout |
| `resource_id` | domain pointer |
| `metadata_json` | reason, diff summary, references |
| `created_at` | immutable timestamp |

Must include:

- KYC review decisions;
- raw KYC document reads;
- dispute resolutions;
- money-state changes;
- admin-only overrides.

---

## 10. Constraints And Invariants

1. `users.email` unique case-insensitively.
2. Every `vendor` must have at least one active `OWNER` membership.
3. Every vendor-scoped row must reference a valid `vendor_id`.
4. `vendor_application_documents.storage_key` is never exposed directly to non-admin actors.
5. `payment_provider_events.provider_event_id` unique per provider.
6. `orders` are created atomically from one successful checkout finalization.
7. Only one active dispute per order in `R1`.
8. `order_funds.state` and `orders.state` must remain semantically aligned with dispute/cancel/complete outcomes.
9. `audit_events` rows are append-only.
10. `vendor_balance_ledger` rows are append-only.
11. `money_reconciliation_items.status` must reflect the comparison result at run time and should not mutate historical run evidence.
12. `stock_reservations` must be unique per `(checkout_session_id, product_id)` and may only release stock while still `RESERVED`.

---

## 11. Deferred Structures

These should not be forced into `R1`:

- `team_invites`
- `subscription_plans`
- `vendor_plan_assignments`
- `payout_batches`
- `payout_failures`
- `reviews`
- `review_responses`
- `api_keys`
- `webhook_endpoints`
- `saved_searches`

Reason:

```text
launch-first schema should preserve the working revenue and trust loop,
not every target capability already imagined in the design pack
```

---

## 12. Next Planning Dependency

These schema drafts should now feed:

- `runtime_checklists.md`
- `cut_register.md`
- later migration/file planning inside `vendora_codebase/`
