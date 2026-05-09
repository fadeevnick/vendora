# Vendora — Статус дизайна

## Workflow Note

Vendora is now interpreted through the staged workflow defined in:

- `README.md`
- `source/context/`
- `source/planning/runtime_entry_gate.md`
- `execution/runtime/runtime_profiles.md`

Current stage:

- `Runtime Realization — R1 unblock pass`

Current transitional rule:

- `source/design/`, `source/planning/`, `tracking/` and `prototypes/` are now the canonical artifact tree;
- `vendora_codebase/` remains separate as execution asset;
- launch design/planning pack is already strong enough and remains the canonical product truth;
- runtime has now formally started with chosen depth `R1`;
- the current runtime pass is reset-friendly and should not override artifact truth.

## Workflow Migration

- `source/design/business_requirements.md` rewritten into the new launch/target-aware workflow shape
- `source/design/user_journeys.md` rewritten into the new launch/target-aware workflow shape
- `source/design/functional_requirements.md` rewritten into the new workflow shape with `Scope`, `Launch Delivery` and `Runtime`
- `source/design/architecture.md` rewritten into the new workflow shape with `Launch Architecture`, `Target Architecture` and `Migration Notes`
- `source/design/tech_stack.md` rewritten into the new workflow shape with `Now`, `Later` and explicit deferrals
- `source/planning/launch_roadmap.md` rewritten into explicit launch sequencing with `must`, `manual/hosted acceptable`, and `post-launch`
- `source/planning/implementation_guide.md` rewritten into a staged bridge from artifacts to runtime with phase expectations for `R1`, `R2`, `R3`
- `source/planning/access_matrix.md` created as the first implementation-near access and RBAC artifact
- `source/planning/state_machines.md` created with explicit state transitions for KYC, orders, disputes and payout eligibility
- `source/planning/api_contracts.md` created with launch-first endpoint contracts tied to access rules and state transitions
- `source/planning/schema_drafts.md` created with launch-first storage entities, money path and tenant-boundary invariants
- `source/planning/runtime_checklists.md` created with explicit `R1` must-pass checks and `R2`/`R3` runtime expansions
- `source/planning/cut_register.md` created with explicit launch cuts, manual/hosted allowances and no-cut invariants
- `source/planning/test_matrix.md` created with risk-based verification methods across automation, runtime-manual and ops evidence
- `execution/runtime/README.md` created as the runtime navigation entrypoint
- `execution/runtime/phase_02_vendor_gate.md` through `phase_06_disputes_money.md` created to complete launch-runtime phase coverage
- `source/planning/adr/README.md` created and seeded with ADRs for owner-first access, webhook-finalized order creation and money-state/ledger split
- `source/planning/runtime_gate_review.md` updated: gate is ready and no longer blocks runtime
- `tracking/implementation_status.md` rewritten into the new runtime phase model and now reflects active `R1` entry into `phase_01_auth`
- no mandatory launch planning artifact remains before or during current runtime entry

## Artifact Readiness

- core design chain is complete for the launch slice
- implementation-near planning pack is complete enough for launch runtime entry
- launch runtime phase docs now cover phases `00` through `06`
- launch-required prototype coverage is now complete
- hosted/manual/admin-side prototype coverage now also exists for the previously deferred V-5, V-6, A-1 and A-2 surfaces
- no launch-required user journey remains without HTML prototype coverage

## Прототипы Готовы (14 флоу)
- B-1 Registration And First Entry — `prototypes/Vendora Buyer Registration.html`
- B-2 Поиск и выбор товара — `prototypes/Vendora Search.html`
- B-3 Checkout — `prototypes/Vendora Checkout.html`
- B-4 Order Tracking And Receipt Confirmation — `prototypes/Vendora Order Tracking.html`
- B-5 Спор — `prototypes/Vendora Dispute Flow.html`
- B-6 Reviews And Ratings — `prototypes/Vendora Reviews.html`
- V-1 Vendor Onboarding — `prototypes/Vendora Vendor Onboarding.html`
- V-2 Listing Creation — `prototypes/Vendora Vendor Listing Creation.html`
- V-3 Обработка заказа — `prototypes/Vendora Vendor Dashboard.html`
- V-4 Team Management — `prototypes/Vendora Team Management.html`
- V-5 Billing / Subscription — `prototypes/Vendora Billing.html`
- V-6 Payouts — `prototypes/Vendora Payouts.html`
- A-1 KYC Review — `prototypes/Vendora Admin KYC Review.html`
- A-2 Dispute Resolution Admin — `prototypes/Vendora Admin Dispute Resolution.html`

## Prototype Coverage Status
- launch-required buyer and vendor journeys now have active HTML prototypes
- `B-1` now covers registration, email verification, trust intro and guest-compatible first entry
- `B-4` now covers buyer order list, status visibility, shipment context, receipt confirmation and dispute handoff
- `B-6` now covers launch fallback feedback collection and target review/rating layer with moderation and vendor-response states
- `V-2` now covers vendor catalog creation, media minimum, draft/publish lifecycle and buyer-visible visibility state
- `V-4` now covers owner-only launch fallback, admin-assisted seat request, self-serve target team UI, role model and plan-limit paths
- `V-5` now covers vendor-facing billing state, plan comparison, invoice history and hosted Stripe portal fallback
- `V-6` now covers vendor-facing payout balances, provider onboarding, payout history, failure/review and reconciliation detail
- `A-1` now covers target admin KYC queue/detail/document review/decision states while preserving Retool/manual launch interpretation
- `A-2` now covers target admin dispute queue/detail/evidence/resolution states while preserving API/manual/Retool launch interpretation

Важно:

- visual prototype coverage is now complete for all launch-required journeys;
- visual prototype coverage now also exists for the previously deferred hosted/manual/admin-side surfaces;
- `B-4` is now covered as the buyer post-purchase tracking layer that connects launch checkout to completion/dispute;
- `B-6` is now covered as the target-first trust/reputation layer with an explicit launch-safe no-review fallback;
- `V-4` is now covered as target-first vendor workspace expansion with explicit launch-safe owner-only interpretation;
- V-5/V-6/A-1/A-2 prototypes do not change the launch cut: hosted/manual/Retool remains acceptable where recorded;
- artifact readiness is unchanged: it remains strong enough for launch runtime;
- runtime is no longer deferred by user choice and is now tracked separately in `tracking/implementation_status.md`.

## Hosted / Manual Launch Cuts Still Allowed
- V-5 Billing / подписка — prototype exists, but Stripe hosted pages remain acceptable for launch
- V-6 Payouts — prototype exists, but Stripe Connect / hosted provider flow remains acceptable for launch
- A-1 KYC Review — prototype exists, but Retool/manual review remains acceptable for launch
- A-2 Разрешение спора (Admin) — prototype exists, but Retool/manual/API-first resolution remains acceptable for launch
