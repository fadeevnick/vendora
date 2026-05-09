# Vendora — Cut Register

Этот артефакт фиксирует сознательные launch cuts.

Он нужен, чтобы:

- отделить “required capability” от “dedicated product UI”;
- явно показать, что остаётся manual/hosted в `R1`;
- не дать target-depth silently вернуться в launch scope.

---

## 1. Rules

1. Cut допустим, если capability остаётся доступной через manual, hosted или admin-assisted path.
2. Cut недопустим, если ломается money correctness, tenant isolation или trust gate.
3. Любой cut должен иметь landing zone:
   - `R1 stays manual`
   - `R2 productize`
   - `R3 target depth`

---

## 2. Hard No-Cut Invariants

These cannot be sacrificed for launch speed:

| Invariant | Why it cannot be cut |
|---|---|
| Atomic vendor-specific order creation after successful payment | otherwise checkout can produce partial money/order corruption |
| Idempotent checkout and webhook finalization | duplicate orders and duplicate holds are unacceptable |
| Tenant isolation between vendors | cross-tenant leakage is product-breaking |
| Buyer-only visibility of buyer orders | privacy and trust baseline |
| Admin-only access to raw KYC documents | compliance and trust baseline |
| Dispute-triggered freeze of disputed funds | money loop becomes unsafe without it |
| Durable evidence for KYC, dispute and money-sensitive actions | later runtime claims become unverifiable |

---

## 3. Launch Cuts

| Area | `R1` treatment | Why acceptable now | Land later |
|---|---|---|---|
| KYC review UI | manual/simple admin surface | capability exists without polished internal product | `R2` |
| Dispute resolution UI | manual-heavy admin ops | decision path matters more than polished tooling | `R2` |
| Payout initiation | hosted/provider or admin-assisted | vendor still gets paid through controlled path | `R2` |
| Vendor balance history | minimal summary only | launch needs money visibility, not full finance console | `R2` |
| Vendor team self-serve | omitted or admin-assisted | owner-only launch is acceptable | `R2/R3` |
| Subscription self-serve | hosted/manual | billing capability exists without in-product UI | `R2` |
| Guest checkout | optional or off | buyer account path is enough for honest launch | `R2` |
| Social login | deferred | email/password is enough | `R2/R3` |
| 2FA / SSO | deferred | strong launch possible without it if admin path remains controlled | `R3` |
| Rich shipment tracking | minimal ship state only | core loop needs progression, not carrier depth | `R2` |
| Auto-complete / timeout jobs | deferred | manual confirmation path can launch first | `R2` |
| Partial refunds | deferred | `FULL_REFUND` and `VENDOR_WINS` cover launch trust path | `R2` |
| Search autocomplete / fuzzy search | deferred | basic search is enough | `R2` |
| Review system | deferred | not required for first trusted revenue loop | `R3` |
| Bulk listing import | deferred | single-listing path is enough | `R3` |
| API keys and vendor webhooks | deferred | external platform surface not needed for launch | `R3` |

---

## 4. Launch Cuts That Need Extra Guardrails

### KYC Review Is Manual

Guardrails:

- approve/reject must still follow explicit states;
- raw docs remain admin-only;
- each review action must be auditable.

### Dispute Resolution Is Manual-Heavy

Guardrails:

- no one except admin resolves final outcome;
- dispute open must freeze funds immediately;
- resolution must still create durable evidence.

### Payout Execution Is Hosted Or Admin-Assisted

Guardrails:

- `releasable` math must still be correct in product truth;
- disputed funds must stay excluded;
- payout fact should later be reconcilable to provider evidence.

### Owner-Only Vendor Model

Guardrails:

- tenant boundary still enforced by `vendor_id`;
- later role model must not require data migration surprises.

---

## 5. Explicit Non-Goals For R1

Do not let these silently enter launch implementation:

- public review and rating layer
- full billing console
- advanced search engine work
- team invites and role management UX
- analytics/reporting surfaces
- API platform
- advanced compliance automation
- payout scheduling controls UI

---

## 6. Re-Entry Rules

When a deferred item returns, it must re-enter through one of these paths:

1. `R2 hardening`
   examples:
   - partial refunds
   - timeout jobs
   - richer vendor roles
2. `R2 productization`
   examples:
   - KYC review tooling
   - payout visibility/history
   - hosted/manual billing replacement
3. `R3 target depth`
   examples:
   - 2FA / SSO
   - reviews
   - API keys/webhooks
   - advanced compliance

---

## 7. Next Planning Dependency

After this register, the next useful artifact is:

- `test_matrix.md`

It should separate:

- what must be runtime-verified manually;
- what should be covered by automated checks;
- what remains acceptable as ops evidence only in early runtime.
