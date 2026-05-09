# Vendora — Runtime Checklists

Этот артефакт задаёт, что именно должно быть проверено, когда Vendora перейдёт из `Artifact Completion` в `Runtime Realization`.

Он нужен, чтобы:

- не заявлять “works” без явного run evidence;
- отделить `R1` launch verification от более глубоких `R2` и `R3` проходов;
- проверить не только happy path, но и самые опасные access/state/money инварианты.

Пока runtime ещё не начат, это planning artifact.

---

## 1. Runtime Evidence Rules

Каждая выполненная проверка потом должна фиксировать:

- date/time
- runtime phase
- runtime depth
- actor used
- preconditions
- action taken
- expected result
- actual result
- evidence reference: screen, log, DB state, email, provider callback

Минимальное правило:

```text
no runtime claim without recorded evidence
```

---

## 2. R1 Must-Pass Checklist

`R1` = честный working launch loop.

Если любой из этих пунктов не пройден, runtime-ready launch claim делать нельзя.

### 2.1 Identity And Access

| Check ID | What to verify | Expected result |
|---|---|---|
| `R1-AUTH-01` | Buyer registration via email/password | user created, verification required |
| `R1-AUTH-02` | Vendor owner registration via email/password | user created, vendor onboarding path available |
| `R1-AUTH-03` | Email verification | verified user gets full session access |
| `R1-AUTH-04` | 5 failed login attempts | lockout triggers per `FR-AUTH-004` |
| `R1-AUTH-05` | Platform Admin privileged sign-in path | admin signs in through separate path |
| `R1-AUTH-06` | Buyer cannot read another buyer order | request denied or not found |
| `R1-AUTH-07` | Vendor cannot read another vendor tenant data | request denied or not found |
| `R1-AUTH-08` | Non-admin cannot access admin KYC/dispute endpoints | request denied |

### 2.2 Vendor Onboarding And KYC

| Check ID | What to verify | Expected result |
|---|---|---|
| `R1-KYC-01` | Vendor owner creates or updates onboarding draft | draft persists with required fields |
| `R1-KYC-02` | KYC document upload metadata path | protected document metadata created |
| `R1-KYC-03` | Submit application from `DRAFT` | state becomes `PENDING_REVIEW` |
| `R1-KYC-04` | Duplicate submit with same idempotency key | no duplicate application transition |
| `R1-KYC-05` | Admin can view review queue | pending application visible |
| `R1-KYC-06` | Admin approves application | vendor becomes sell-eligible |
| `R1-KYC-07` | Admin rejects application | vendor remains non-sellable and gets reason |
| `R1-KYC-08` | Vendor cannot read raw stored KYC documents after upload | access denied |

### 2.3 Listing, Catalog And Search

| Check ID | What to verify | Expected result |
|---|---|---|
| `R1-CAT-01` | Approved vendor creates draft listing | draft saved |
| `R1-CAT-02` | Non-approved vendor tries to publish | blocked |
| `R1-CAT-03` | Approved vendor publishes listing | listing becomes public |
| `R1-CAT-04` | Public catalog/search returns published listing | buyer can discover item |
| `R1-CAT-05` | Out-of-stock listing remains visible but unavailable | stock state shown correctly |
| `R1-CAT-06` | Blocked vendor listing disappears from public side | listing removed from public results |

### 2.4 Cart And Checkout

| Check ID | What to verify | Expected result |
|---|---|---|
| `R1-CHK-01` | Buyer adds item to cart | cart contains item grouped by vendor |
| `R1-CHK-02` | Checkout session creation revalidates price and stock | stale cart gets validation error or updated totals |
| `R1-CHK-03` | Checkout session create with same idempotency key retried | same session returned, no duplicate |
| `R1-CHK-04` | Successful payment webhook finalization | vendor-specific orders created atomically |
| `R1-CHK-05` | Provider webhook replay | no duplicate orders or duplicate hold rows |
| `R1-CHK-06` | Payment failure path | checkout not converted into active orders |
| `R1-CHK-07` | Buyer receives order confirmation | confirmation evidence exists |

### 2.5 Orders

| Check ID | What to verify | Expected result |
|---|---|---|
| `R1-ORD-01` | Vendor sees only own tenant order queue | correct isolation |
| `R1-ORD-02` | Vendor confirms order from `PAYMENT_HELD` | state becomes `CONFIRMED` |
| `R1-ORD-03` | Vendor cancels order from `PAYMENT_HELD` | state becomes `CANCELLED`, refund initiated |
| `R1-ORD-04` | Vendor cannot confirm from invalid state | transition denied |
| `R1-ORD-05` | Vendor marks order as shipped | state becomes `SHIPPED` |
| `R1-ORD-06` | Buyer sees own order details | correct state and vendor snapshot shown |
| `R1-ORD-07` | Buyer confirms receipt from allowed state | order moves to `COMPLETED` |

### 2.6 Disputes

| Check ID | What to verify | Expected result |
|---|---|---|
| `R1-DISP-01` | Buyer opens dispute from allowed order state | dispute created and order moves to `DISPUTED` |
| `R1-DISP-02` | Disputed amount freezes immediately | money state becomes `FROZEN_DISPUTE` |
| `R1-DISP-03` | Vendor responds only to own dispute | allowed for same tenant, denied cross-tenant |
| `R1-DISP-04` | Non-admin actor attempts final resolution | denied |
| `R1-DISP-05` | Admin resolves dispute in buyer favor | refund path executes and dispute closes |
| `R1-DISP-06` | Admin resolves dispute in vendor favor | funds release path executes and dispute closes |

### 2.7 Money, Balance And Audit

| Check ID | What to verify | Expected result |
|---|---|---|
| `R1-MONEY-01` | Successful checkout creates held funds | `order_funds.state = HELD` equivalent runtime state |
| `R1-MONEY-02` | Completed order becomes releasable | state becomes `RELEASABLE` |
| `R1-MONEY-03` | Cancelled/refunded order returns buyer funds | state becomes `RETURNED_TO_BUYER` |
| `R1-MONEY-04` | Vendor balance endpoint reflects held/releasable/frozen amounts correctly | values align with order/dispute state |
| `R1-AUDIT-01` | KYC approve/reject action creates audit record | durable event exists |
| `R1-AUDIT-02` | Dispute resolution creates audit record | durable event exists |
| `R1-AUDIT-03` | Money-sensitive state change creates audit or ledger evidence | durable evidence exists |

---

## 3. R2 Expansion Checklist

`R2` усиливает launch и alternative paths.

### Access And Sessions

- blocked vendor sessions get revoked quickly after KYC/admin block
- richer lockout recovery and session invalidation behavior
- deeper role checks for `ADMIN`, `MANAGER`, `VIEWER`

### KYC

- `REQUEST_MORE_INFO` path
- reject/resubmit cycle
- reminder/resume flows

### Catalog And Checkout

- stock/price race conditions
- stronger cart merge or guest expansion if enabled
- provider interruption recovery

### Orders And Disputes

- auto-cancel on no vendor confirmation
- delivery timeout / auto-complete
- vendor-response SLA escalation
- partial refund decisions

### Money

- payout initiation/recovery path
- failed payout handling
- stronger reconciliation evidence

---

## 4. R3 Expansion Checklist

`R3` приближает runtime к полной target depth.

- social login and 2FA
- deeper compliance/risk overlays
- team management
- richer shipping/tracking
- reviews
- subscription lifecycle and dunning
- payout scheduling/reporting maturity
- analytics and operational tooling

---

## 5. Phase Mapping

These checks now map into runtime phases:

- `phase_00_local_infra.md`: environment boot, migrations, seed reproducibility
- `phase_01_auth.md`: `R1-AUTH-*`
- `phase_02_vendor_gate.md`: `R1-KYC-*`
- `phase_03_catalog.md`: `R1-CAT-*`
- `phase_04_checkout.md`: `R1-CHK-*`
- `phase_05_orders.md`: `R1-ORD-*`
- `phase_06_disputes_money.md`: `R1-DISP-*`, `R1-MONEY-*`, `R1-AUDIT-*`

---

## 6. Next Planning Dependency

After this checklist, the next useful artifact is:

- `test_matrix.md`

It should separate:

- automated checks from runtime-manual checks
- high-risk invariants from lower-risk usability checks
- `R1` proof from deeper `R2` and `R3` coverage
