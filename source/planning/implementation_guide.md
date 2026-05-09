# Vendora — Implementation Guide

Этот документ больше не является просто длинным backlog list.

Теперь его роль:

- быть мостом между `Artifact Completion` и `Runtime Realization`;
- задавать порядок фаз для launch implementation;
- объяснять, как одна и та же фаза усиливается в `R1`, `R2`, `R3`;
- не смешивать план реализации с фактическим runtime-прогрессом.

Фактическое состояние по выполнению и проверкам фиксируется в `tracking/implementation_status.md`.

---

## 1. Stage Role

Vendora uses this staged model:

1. `Artifact Completion`
2. `Runtime Realization`

Этот файл живёт на границе между ними.

Он отвечает на вопрос:

```text
что именно брать в работу после завершения артефактов
и как проходить реализацию по фазам,
не затаскивая target scope внутрь первого runtime запуска
```

---

## 2. Entry Rule

До формального начала runtime должны быть готовы:

- `../design/business_requirements.md`
- `../design/user_journeys.md`
- `../design/functional_requirements.md`
- `../design/architecture.md`
- `../design/tech_stack.md`
- `launch_roadmap.md`
- `source/planning/runtime_entry_gate.md`
- `tracking/design_status.md` must indicate artifact readiness

Пока это не выполнено, код может существовать, но проект всё ещё считается в `Artifact Completion`.

---

## 3. Runtime Depth Model

### `R1 — Launch Runtime`

Цель:

- довести до конца честный working launch loop.

Фокус:

- happy path;
- money correctness;
- access boundaries;
- basic operational recovery.

### `R2 — Strong Runtime`

Цель:

- усилить launch implementation по ключевым альтернативным и негативным путям.

Фокус:

- alternative paths;
- role checks;
- retries;
- timeout-driven transitions;
- manual-to-product improvements.

### `R3 — Full Runtime`

Цель:

- приблизить runtime к полной target depth из design pack.

Фокус:

- target-first capabilities;
- operational maturity;
- richer automation;
- admin/reporting/compliance depth.

---

## 4. Implementation Principles

1. Сначала phase prerequisites, потом schema/env, потом backend/service layer, потом UI, потом runtime verification.
2. Нельзя считать фазу закрытой без runtime-проверки на выбранной глубине.
3. `R1` не обязан реализовать весь target-state, даже если он уже описан.
4. Hosted/manual launch paths допустимы, если они честно зафиксированы в артефактах.
5. Для money-sensitive и tenant-sensitive инвариантов automated checks желательны уже в `R1`.

---

## 5. Launch Phases

### Phase 0. Local Runtime Foundation

**Goal**

- поднять локальную среду и baseline runtime skeleton.

**Includes**

- app/runtime skeleton;
- database and cache availability;
- migrations;
- seed data;
- env handling;
- basic app boot.

**R1**

- локально поднимаются все launch dependencies;
- migrations and seed reproducible;
- buyer/vendor/admin surfaces и API стартуют.

**R2**

- stronger local parity;
- better operational scripts;
- safer reset/reseed workflows.

**R3**

- closer environment parity with staging;
- deeper infrastructure automation.

### Phase 1. Identity And Access Foundation

**Goal**

- дать Buyer, Vendor и Admin безопасный identity foundation.

**Includes**

- registration/login;
- email verification;
- vendor/admin access paths;
- RBAC foundation;
- tenant isolation discipline.

**R1**

- email/password auth works;
- admin access path separated;
- tenant boundary enforced;
- launch roles respected.

**R2**

- retry/lockout behavior;
- richer session handling;
- deeper revoke/block flows.

**R3**

- 2FA;
- social login depth;
- enterprise SSO where relevant.

### Phase 2. Vendor Approval Gate

**Goal**

- сделать supply-side entry controlled and trustworthy.

**Includes**

- vendor onboarding;
- KYC submission;
- admin review path;
- approve/reject loop.

**R1**

- vendor can submit application;
- admin can approve/reject;
- approved vendor can enter selling path.

**R2**

- reject/resubmit;
- reminder/resume logic;
- richer audit trail.

**R3**

- request-more-info;
- deeper compliance checks;
- richer ops queueing.

### Phase 3. Listing And Catalog Visibility

**Goal**

- дать approved vendor возможность создать sellable supply.

**Includes**

- listing create/edit;
- draft/publish;
- public visibility;
- basic stock state.

**R1**

- vendor can publish listing;
- buyer sees only public/eligible listings;
- blocked vendor listings disappear from public side.

**R2**

- better media validation;
- stronger catalog constraints;
- plan-limit aware behavior.

**R3**

- variants;
- bulk import;
- moderation lifecycle.

### Phase 4. Discovery And Checkout

**Goal**

- превратить buyer intent в paid order set.

**Includes**

- search;
- cart;
- checkout;
- payment success/failure handling;
- escrow hold.

**R1**

- buyer can find listing;
- add to cart;
- pay successfully;
- system creates vendor-specific orders atomically;
- funds go into hold path.

**R2**

- stronger stock/price change handling;
- guest/cart merge or equivalent expansions;
- recovery flows around checkout failures.

**R3**

- dedicated search engine;
- richer payment methods;
- promo logic and deeper discovery.

### Phase 5. Order Progression

**Goal**

- довести paid order до completion path under controlled states.

**Includes**

- vendor order handling;
- buyer order visibility;
- state transitions;
- completion trigger.

**R1**

- vendor confirms/cancels;
- buyer sees order states;
- successful orders can close cleanly.

**R2**

- timeout-driven transitions;
- tracking/shipping detail;
- stronger notifications and negative cases.

**R3**

- realtime operational UX;
- richer timelines;
- deeper vendor operational tooling.

### Phase 6. Dispute And Payout

**Goal**

- закрыть trust-and-money recovery path.

**Includes**

- dispute creation;
- fund freeze;
- admin resolution;
- payout eligibility and execution path.

**R1**

- buyer can open dispute;
- admin can resolve;
- platform can refund/release correctly;
- vendor can receive payout via agreed launch path.

**R2**

- partial refund depth;
- payout hold edge cases;
- richer finance visibility and ops.

**R3**

- scheduled payouts;
- reconciliation;
- SLA-heavy dispute operations;
- stronger audit/reporting.

---

## 6. Post-Launch Expansion Phases

Эти фазы не должны блокировать первый runtime launch:

- team management
- public reviews
- subscription automation and dunning depth
- realtime dashboards
- dedicated search engine
- vendor API platform
- enterprise identity

Они могут идти:

- как дополнительные `R2`/`R3` проходы существующих фаз;
- или как новые hardening/expansion phases после закрытия launch loop.

---

## 7. Verification Discipline

Для каждой фазы проверка должна происходить в такой логике:

1. schema/env changes applied;
2. backend behavior works;
3. UI or ops path reaches the behavior;
4. runtime scenario actually reproduced;
5. result logged in `tracking/implementation_status.md`.

Проверка не должна ограничиваться словами:

```text
“код написан”
```

Нужен подтверждённый runtime факт.

---

## 8. Done Criteria By Depth

### Phase done in `R1`

- launch path работает end-to-end;
- критические инварианты соблюдены;
- accepted manual/hosted fallback documented.

### Phase done in `R2`

- ключевые альтернативные и негативные пути пройдены;
- role/time/state edge cases покрыты сильнее;
- phase стала устойчивее operationally.

### Phase done in `R3`

- phase приближена к полной target depth;
- richer tooling and automation added;
- operational maturity materially improved.

---

## 9. Current Guidance

На текущем этапе этот guide должен использоваться так:

- finishing artifacts first;
- then choosing one explicit runtime depth;
- then moving phase by phase in launch order;
- then recording truth only in `tracking/implementation_status.md`.

Следующий planning layer после этого документа должен уточнять:

- access matrix;
- API contracts;
- state machines;
- schema drafts;
- runtime checklists;
- cut register.
