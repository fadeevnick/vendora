# Vendora — State Machines

Этот артефакт фиксирует stateful lifecycles, которые нельзя оставлять “примерно понятными” до runtime.

Он нужен для:

- KYC gate;
- order progression;
- dispute handling;
- payout eligibility and payout execution.

Правило:

```text
любой money-sensitive или trust-sensitive переход
должен быть явно разрешён или явно запрещён
```

---

## 1. General Rules

1. Переходы валидируются на backend, не в UI.
2. Каждый state change должен иметь actor, timestamp и audit trail там, где это чувствительно.
3. Invalid transition returns domain error and does not mutate state.
4. Timeout-driven transitions выполняются только из явно разрешённых состояний.
5. `R1` покрывает launch-happy-path и самые опасные invalid transitions.
6. `R2` добавляет retries, timeout paths и richer recovery.
7. `R3` добавляет target-depth states и richer operations.

---

## 2. KYC Application State Machine

### 2.1 Scope

- Launch-critical
- Feeds: `V-1`, `A-1`, `FR-KYC-*`, `FR-AUTH-008`

### 2.2 States

| State | Meaning | Scope |
|---|---|---|
| `DRAFT` | vendor started onboarding but has not submitted for review | Launch |
| `PENDING_REVIEW` | application submitted and waiting for platform decision | Launch |
| `APPROVED` | vendor cleared to sell | Launch |
| `REJECTED` | application rejected, no direct selling access | Launch |
| `REQUEST_MORE_INFO` | admin requests corrected or additional info | Target/R2+ |
| `BLOCKED` | previously approved vendor is operationally blocked | Target/R2+ |

### 2.3 Allowed Transitions

| From | Event | Actor | To | Runtime Depth |
|---|---|---|---|---|
| `DRAFT` | save draft | `Vendor Owner` | `DRAFT` | `R1` |
| `DRAFT` | submit application | `Vendor Owner` | `PENDING_REVIEW` | `R1` |
| `PENDING_REVIEW` | approve | `Platform Admin` | `APPROVED` | `R1` |
| `PENDING_REVIEW` | reject | `Platform Admin` | `REJECTED` | `R1` |
| `PENDING_REVIEW` | request more info | `Platform Admin` | `REQUEST_MORE_INFO` | `R2` |
| `REQUEST_MORE_INFO` | resubmit | `Vendor Owner` | `PENDING_REVIEW` | `R2` |
| `APPROVED` | block vendor access | `Platform Admin` | `BLOCKED` | `R2` |
| `BLOCKED` | restore vendor access | `Platform Admin` | `APPROVED` | `R2` |
| `APPROVED` | payout-sensitive change triggers re-review | `System Job` / `Platform Admin` | `PENDING_REVIEW` | `R2` |

### 2.4 Invalid Transitions

- `DRAFT -> APPROVED` without admin review
- `REJECTED -> APPROVED` without fresh review cycle
- `APPROVED -> DRAFT`
- `REQUEST_MORE_INFO -> APPROVED` without resubmission/admin action
- any non-admin actor moving app out of `PENDING_REVIEW`

### 2.5 Timeout And Retry Rules

- `DRAFT` may stay incomplete indefinitely, but reminder jobs begin in `R2`
- repeated rejection/resubmission cycles may be capped operationally
- payout-sensitive data changes may force return to `PENDING_REVIEW` in `R2`

### 2.6 Runtime Focus

- `R1`: `DRAFT -> PENDING_REVIEW -> APPROVED/REJECTED`
- `R2`: `REQUEST_MORE_INFO`, re-review, access revoke
- `R3`: deeper compliance/risk overlays

---

## 3. Order State Machine

### 3.1 Scope

- Launch-critical
- Feeds: `B-3`, `B-4`, `B-5`, `V-3`, `V-6`, `FR-CHECKOUT-*`, `FR-ORDER-*`, `FR-ESC-*`

### 3.2 States

| State | Meaning | Scope |
|---|---|---|
| `CREATED` | order record exists but payment finalization not yet completed | Launch |
| `PAYMENT_HELD` | payment succeeded and funds are held | Launch |
| `PAYMENT_FAILED` | payment failed, order not active | Launch |
| `CONFIRMED` | vendor accepted the order | Launch |
| `SHIPPED` | vendor marked shipment/fulfillment sent | Launch |
| `DELIVERED` | buyer received or delivery reached final state | Launch |
| `COMPLETED` | order closed successfully, funds releasable | Launch |
| `CANCELLED` | order cancelled and refund path initiated/completed | Launch |
| `DISPUTED` | buyer opened dispute and funds are frozen | Launch |

### 3.3 Allowed Transitions

| From | Event | Actor | To | Runtime Depth |
|---|---|---|---|---|
| `CREATED` | payment success finalized | `System Job` | `PAYMENT_HELD` | `R1` |
| `CREATED` | payment fails/aborts | `System Job` | `PAYMENT_FAILED` | `R1` |
| `PAYMENT_HELD` | vendor confirms | `Vendor Owner` / allowed vendor role | `CONFIRMED` | `R1` |
| `PAYMENT_HELD` | vendor cancels | `Vendor Owner` / allowed vendor role | `CANCELLED` | `R1` |
| `PAYMENT_HELD` | auto-cancel on no confirmation | `System Job` | `CANCELLED` | `R2` |
| `CONFIRMED` | vendor marks shipped | `Vendor Owner` / allowed vendor role | `SHIPPED` | `R1` |
| `SHIPPED` | shipment/delivery confirmed | `System Job` / `Buyer` | `DELIVERED` | `R2` |
| `DELIVERED` | buyer confirms receipt | `Buyer` | `COMPLETED` | `R1` |
| `DELIVERED` | buyer opens dispute | `Buyer` | `DISPUTED` | `R1` |
| `DELIVERED` | auto-complete after timeout | `System Job` | `COMPLETED` | `R2` |
| `COMPLETED` | dispute window still valid and dispute opened | `Buyer` | `DISPUTED` | `R2` |
| `DISPUTED` | admin resolves in vendor favor | `Platform Admin` | `COMPLETED` | `R1` |
| `DISPUTED` | admin resolves with refund/cancel outcome | `Platform Admin` | `CANCELLED` | `R1` |

### 3.4 Invalid Transitions

- `CREATED -> CONFIRMED`
- `PAYMENT_FAILED -> CONFIRMED`
- `CANCELLED -> SHIPPED`
- `COMPLETED -> SHIPPED`
- `DISPUTED -> PAYMENT_HELD`
- vendor-side actor moving order out of `DISPUTED`
- buyer-side actor moving order directly to `CANCELLED`

### 3.5 Timeout Rules

- confirmation timeout from `PAYMENT_HELD` may auto-cancel in `R2`
- no-response delivery timeout from `DELIVERED` may auto-complete in `R2`
- dispute-open window after `DELIVERED` must be explicit even if initially short/simple

### 3.6 Runtime Focus

- `R1`: payment success, confirm, cancel, dispute open, complete
- `R2`: timeout paths, delivery confirmation nuance, post-complete dispute edge
- `R3`: richer shipping/timeline/reporting behavior

---

## 4. Dispute State Machine

### 4.1 Scope

- Launch-critical
- Feeds: `B-5`, `A-2`, `FR-DISP-*`, `FR-ORDER-006`, `FR-SEC-003`

### 4.2 States

| State | Meaning | Scope |
|---|---|---|
| `OPEN` | dispute shell exists but vendor-response clock not yet established | optional internal pre-state |
| `VENDOR_RESPONSE` | buyer has submitted dispute and vendor must respond | Launch |
| `PLATFORM_REVIEW` | platform intervenes because parties did not resolve | Launch |
| `RESOLVED` | dispute closed with decision | Launch |
| `CLOSED_WITH_AGREEMENT` | buyer/vendor resolved without platform decision | Target/R2+ |

Launch note:

- product can collapse `OPEN` into immediate `VENDOR_RESPONSE`

### 4.3 Allowed Transitions

| From | Event | Actor | To | Runtime Depth |
|---|---|---|---|---|
| `OPEN` | submit dispute | `Buyer` | `VENDOR_RESPONSE` | `R1` |
| `VENDOR_RESPONSE` | vendor proposes acceptable solution and buyer accepts | `Buyer` | `CLOSED_WITH_AGREEMENT` | `R2` |
| `VENDOR_RESPONSE` | vendor response rejected / no agreement | `Buyer` / `System Job` | `PLATFORM_REVIEW` | `R1` / `R2` |
| `VENDOR_RESPONSE` | vendor misses SLA | `System Job` | `PLATFORM_REVIEW` | `R2` |
| `PLATFORM_REVIEW` | full refund decision | `Platform Admin` | `RESOLVED` | `R1` |
| `PLATFORM_REVIEW` | partial refund decision | `Platform Admin` | `RESOLVED` | `R2` |
| `PLATFORM_REVIEW` | vendor wins decision | `Platform Admin` | `RESOLVED` | `R1` |

### 4.4 Invalid Transitions

- `VENDOR_RESPONSE -> RESOLVED` by vendor
- `PLATFORM_REVIEW -> VENDOR_RESPONSE`
- `RESOLVED -> PLATFORM_REVIEW`
- buyer creating dispute on someone else’s order
- vendor or buyer directly mutating final financial outcome after admin resolution

### 4.5 Timeout Rules

- vendor response SLA is explicit in `R2`
- unresolved party negotiation can auto-escalate to `PLATFORM_REVIEW`
- once `RESOLVED`, dispute is immutable except through explicit admin override process outside normal flow

### 4.6 Runtime Focus

- `R1`: open dispute, freeze funds, platform review, resolve
- `R2`: response-window timeout, agreement path, partial refunds
- `R3`: richer evidence, reporting and policy-driven handling

---

## 5. Payout Eligibility State Machine

### 5.1 Scope

- Launch-critical for money loop
- Feeds: `V-6`, `FR-ESC-*`, `FR-PAY-*`, order/dispute outcomes

Important:

- this is not the same as order state
- this tracks whether vendor money is holded, releasable, frozen or already in payout processing

### 5.2 States

| State | Meaning | Scope |
|---|---|---|
| `HELD` | money captured but not releasable to vendor yet | Launch |
| `RELEASABLE` | order completed and funds may be added to vendor payout pool | Launch |
| `FROZEN_DISPUTE` | releasable flow paused due to dispute | Launch |
| `IN_PAYOUT_BATCH` | included in payout execution path | Launch/R2 |
| `PAID_OUT` | funds transferred out through payout path | Launch |
| `RETURNED_TO_BUYER` | refund path won over vendor release | Launch |
| `PAYOUT_FAILED_REVIEW` | payout attempt failed and needs operator/KYC follow-up | Target/R2+ |

### 5.3 Allowed Transitions

| From | Event | Actor | To | Runtime Depth |
|---|---|---|---|---|
| `HELD` | order completes successfully | `System Job` | `RELEASABLE` | `R1` |
| `HELD` | dispute opens before release | `System Job` | `FROZEN_DISPUTE` | `R1` |
| `HELD` | order cancelled / refunded | `System Job` | `RETURNED_TO_BUYER` | `R1` |
| `FROZEN_DISPUTE` | admin resolves for vendor | `Platform Admin` / `System Job` | `RELEASABLE` | `R1` |
| `FROZEN_DISPUTE` | admin resolves for buyer | `Platform Admin` / `System Job` | `RETURNED_TO_BUYER` | `R1` |
| `RELEASABLE` | payout job starts | `System Job` / `Platform Admin` | `IN_PAYOUT_BATCH` | `R2` |
| `IN_PAYOUT_BATCH` | payout succeeds | `System Job` | `PAID_OUT` | `R1` / `R2` |
| `IN_PAYOUT_BATCH` | payout fails and requires follow-up | `System Job` | `PAYOUT_FAILED_REVIEW` | `R2` |
| `PAYOUT_FAILED_REVIEW` | corrected payout path resumes | `Platform Admin` / `System Job` | `IN_PAYOUT_BATCH` | `R2` |

### 5.4 Invalid Transitions

- `HELD -> PAID_OUT` without completion path
- `RETURNED_TO_BUYER -> RELEASABLE`
- `PAID_OUT -> RETURNED_TO_BUYER` through normal payout state machine
- vendor actor directly moving money state
- dispute-open order remaining in `RELEASABLE`

### 5.5 Runtime Focus

- `R1`: `HELD -> RELEASABLE/FROZEN_DISPUTE/RETURNED_TO_BUYER`
- `R2`: payout batching and failed payout recovery
- `R3`: richer reconciliation, scheduled payout controls, reporting

---

## 6. Cross-Machine Invariants

1. vendor cannot sell unless KYC lifecycle allows active selling access
2. order cannot become `COMPLETED` unless payment already reached hold state
3. dispute creation must freeze releasable vendor money for the affected order
4. payout state can never advance independently of order/dispute outcome
5. only admin path can finalize disputed financial outcomes
6. blocked vendor must lose effective access to listing/order mutations

---

## 7. Runtime Checks To Carry Forward

These must be used later in runtime checklists:

### `R1`

- KYC approve/reject path
- order confirm/cancel/complete/dispute path
- dispute resolution path
- hold/release/refund correctness

### `R2`

- timeout-driven order and dispute escalations
- KYC re-review triggers
- payout batch start/failure handling
- richer invalid transition coverage

### `R3`

- request-more-info and compliance depth
- partial refund and advanced finance scenarios
- target-only state branches like team/billing/review-related expansions

---

## 8. Next Planning Dependency

This artifact should feed directly into:

- `api_contracts.md`
- `schema_drafts.md`
- `runtime_checklists.md`
- backend domain transition guards during runtime implementation
