# Vendora — Test Matrix

Этот артефакт фиксирует, чем именно должны проверяться самые рискованные части launch loop.

Он нужен, чтобы:

- отделить automated proof от runtime-manual verification;
- не свести `R1` к “покликали happy path”;
- не требовать от `R1` full target-depth test burden.

Это не список конкретных test files.
Это verification model, которой потом должны соответствовать реализация и runtime runs.

---

## 1. Verification Types

| Type | Meaning | When it is strongest |
|---|---|---|
| `A1 Domain` | automated domain/state logic checks | state transitions, idempotency, money math |
| `A2 Integration` | automated persistence/API integration checks | tenant isolation, order creation, audit writes |
| `A3 Contract` | automated API contract/shape checks | request/response shape, auth boundary, error envelope |
| `R Manual` | runtime-manual end-to-end verification | launch flow reality, provider/webhook orchestration, email evidence |
| `O Ops Evidence` | logs, DB rows, provider dashboard, email artifacts | sensitive or hosted/manual launch paths |

Rule:

```text
R1 should combine automation for invariants
with runtime-manual proof for the real launch loop
```

---

## 2. R1 Minimum Quality Bar

`R1` does not need exhaustive target coverage.
But it does need stronger proof than ad-hoc smoke.

### Required in `R1`

- every money-sensitive invariant must have at least one automated check
- every tenant-boundary invariant must have at least one automated or runtime denial check
- every launch-critical actor flow must have runtime-manual proof
- every manual/hosted launch capability must still leave ops evidence

### Acceptable in `R1`

- manual KYC review with audit evidence
- manual-heavy dispute resolution with audit evidence
- hosted/admin-assisted payout initiation with provider evidence

### Not Acceptable in `R1`

- only manual proof for checkout idempotency
- only manual proof for atomic order creation
- only UI-level confidence for access control
- runtime claim without evidence link

---

## 3. Risk-Based Matrix

| Area | Invariant / capability | Primary verification | Secondary verification | `R1` | `R2` | `R3` |
|---|---|---|---|---|---|---|
| Auth | email/password registration and verification | `A2 Integration` | `R Manual` | required | keep | keep |
| Auth | failed-login lockout | `A2 Integration` | `R Manual` | required | stronger recovery | keep |
| Access | buyer cannot read чужой order | `A2 Integration` | `R Manual` denial | required | keep | keep |
| Access | vendor cannot cross tenant boundary | `A2 Integration` | `R Manual` denial | required | richer roles | keep |
| Access | non-admin blocked from KYC/dispute admin APIs | `A2 Integration` | `A3 Contract` | required | keep | keep |
| KYC | submit application state change | `A1 Domain` | `R Manual` | required | keep | keep |
| KYC | approve/reject review path | `A2 Integration` | `R Manual` + `O Ops Evidence` | required | resubmit loops | compliance depth |
| KYC | raw docs admin-only | `A2 Integration` | `R Manual` denial | required | keep | keep |
| Catalog | approved vendor can publish | `A2 Integration` | `R Manual` | required | validation depth | keep |
| Catalog | blocked vendor listing disappears publicly | `A2 Integration` | `R Manual` search/catalog check | required | keep | keep |
| Search | public discovery of published listing | `R Manual` | `A2 Integration` | required | filters/fuzzy | advanced discovery |
| Cart | grouped totals per vendor | `A2 Integration` | `R Manual` | required | keep | keep |
| Checkout | stock/price revalidation | `A2 Integration` | `R Manual` stale cart scenario | required | race variants | keep |
| Checkout | idempotent checkout create | `A1 Domain` | `A2 Integration` | required | keep | keep |
| Payments | webhook replay safety | `A2 Integration` | `O Ops Evidence` | required | provider edge cases | keep |
| Orders | atomic vendor-specific order creation | `A2 Integration` | `R Manual` + DB evidence | required | keep | keep |
| Orders | valid/invalid order transitions | `A1 Domain` | `R Manual` | required | timeout paths | richer ops |
| Orders | vendor cancel triggers refund path | `A2 Integration` | `R Manual` + provider evidence | required | keep | keep |
| Disputes | dispute open freezes disputed amount | `A2 Integration` | `R Manual` + DB evidence | required | partial refunds | keep |
| Disputes | only admin resolves final outcome | `A2 Integration` | `R Manual` denial | required | queue depth | keep |
| Money | hold -> releasable math | `A1 Domain` | `A2 Integration` | required | payout batching | reconciliation/reporting |
| Money | vendor balance summary accuracy | `A2 Integration` | `R Manual` | required | payout history | finance depth |
| Audit | KYC/dispute/money actions durable | `A2 Integration` | `O Ops Evidence` | required | richer metadata | reporting depth |
| Notifications | order/KYC/dispute emails emitted | `R Manual` | `O Ops Evidence` | required | retry handling | channel preferences |

---

## 4. Phase-Oriented View

### Phase 00 — Local Infrastructure

- `R Manual`: local boot, dependency reachability
- `O Ops Evidence`: service logs, startup health, seed evidence

### Phase 01 — Auth

- `A2 Integration`: auth/session/lockout/access denials
- `A3 Contract`: auth endpoint shape
- `R Manual`: buyer, vendor, admin sign-in flows

### Phase 02 — Vendor Gate

- `A1 Domain`: KYC state transitions
- `A2 Integration`: KYC docs access, approve/reject effects
- `R Manual`: submit/review/approval loop

### Phase 03 — Catalog

- `A2 Integration`: publish visibility, blocked vendor removal
- `R Manual`: listing create/publish/search visibility

### Phase 04 — Checkout

- `A1 Domain`: idempotency logic
- `A2 Integration`: atomic order creation and hold rows
- `R Manual`: cart -> payment -> confirmation flow
- `O Ops Evidence`: provider callback and email evidence

### Phase 05 — Orders

- `A1 Domain`: order state rules
- `A2 Integration`: confirm/cancel/ship effects
- `R Manual`: vendor queue and buyer receipt confirmation

### Phase 06 — Disputes And Money

- `A1 Domain`: dispute and fund-state transitions
- `A2 Integration`: freeze/release/refund/audit
- `R Manual`: dispute opening and admin resolution path
- `O Ops Evidence`: provider/refund evidence if hosted/manual

---

## 5. Manual-Only Exceptions

These areas may remain manual-heavy in `R1`, but not evidence-free:

| Area | Why manual is acceptable | Required evidence |
|---|---|---|
| KYC review tooling | simple admin/ops surface is enough for launch | decision record + audit row |
| Dispute resolution tooling | capability matters more than polished UI | resolution record + audit row + financial evidence |
| Payout initiation | hosted/provider/admin-assisted launch is acceptable | provider evidence + balance state evidence |

---

## 6. Mapping To Planning Artifacts

- `runtime_checklists.md` defines what must be checked at runtime
- `cut_register.md` defines what may stay manual/hosted
- this file defines how each risky area should be proven
- runtime phase docs define where those checks execute

---

## 7. Next Planning Dependency

After this matrix, the next strongest planning step is to formalize ADRs for the highest-cost implementation decisions:

- owner-first vendor role model
- payment-webhook-finalized order creation
- order funds + vendor balance ledger split
