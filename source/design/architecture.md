# Vendora — Architecture

> Multi-tenant B2B Marketplace Platform

Этот артефакт теперь читается в трёх слоях:

- `Launch Architecture` — что реально нужно для первого работающего marketplace loop
- `Target Architecture` — полная система, покрывающая весь учебный полигон
- `Migration Notes` — как расти от launch к target, не ломая доменные границы

Главное правило:

```text
R1 runtime опирается только на Launch Architecture.
Target Architecture не имеет права молча попадать в launch implementation.
```

---

## 1. Architecture Thesis

Vendora должна стартовать как money-sensitive marketplace с vendor onboarding, каталогом, checkout, order state machine, disputes и payouts.

При этом:

- доменные границы надо заложить сразу;
- infrastructure footprint на launch должен быть проще target-state;
- расширение в сторону search, billing, realtime, API platform и advanced ops должно идти без пересборки доменной модели с нуля.

Стабильное архитектурное решение для обеих стадий:

```text
Modular Monolith first
```

То есть:

- один основной application backend;
- явные доменные модули;
- строгие state machines и data boundaries;
- event/outbox слой для асинхронных side effects;
- постепенное усиление инфраструктуры по мере роста нагрузки и доменной глубины.

---

## 2. System Context

### Launch Architecture Context

```text
Buyer ───────┐
Vendor ──────┼──► Vendora Web Surfaces ─► Vendora API ─► PostgreSQL
Admin/Ops ───┘                           │              ├► Redis
                                         │              ├► S3 media
                                         │              ├► S3 KYC
                                         │              ├► Stripe
                                         └──────────────└► Resend
```

Launch-контур предполагает:

- buyer-side web app;
- vendor-side dashboard;
- минимальный admin/ops surface;
- API + background workers;
- одна primary transactional database;
- cache/queue layer;
- публичное и приватное file storage;
- платежный провайдер и transactional email.

### Target Architecture Context

```text
Buyer / Vendor / Admin / Vendor API Clients
        │
        ▼
  Web Surfaces + Admin Operations + API Platform
        │
        ▼
  Vendora API + Workers + Webhook Delivery + Search Sync
        │
        ├► PostgreSQL + RLS
        ├► Redis / queue / pubsub
        ├► Search Engine
        ├► Public/Private File Storage
        ├► Stripe + Stripe Connect + Billing
        ├► Email / Realtime channels
        └► External KYC / analytics / enterprise identity
```

Target-контур добавляет:

- richer admin operations;
- dedicated search engine;
- realtime delivery;
- subscription automation;
- vendor API/webhooks;
- external identity/compliance integrations.

---

## 3. Stable Architectural Style

### ADR-001: Modular Monolith

**Decision:** Vendora строится как modular monolith.

**Why:**

- продукт новый, а доменные boundaries ещё эволюционируют;
- checkout, disputes и payouts требуют сильной транзакционной согласованности;
- ранние микросервисы добавят distributed complexity раньше времени;
- модульный монолит легче довести до runtime truth в `R1` и `R2`.

### Stable Domain Modules

| Module | Launch Role | Target Expansion |
|---|---|---|
| `auth` | регистрация, логин, email verification, admin access path | social login, 2FA, SSO, session management depth |
| `vendor` | vendor profile, KYC application, approval gates | team management, richer workspace settings |
| `catalog` | listing create/edit/publish, stock, public visibility | variants, bulk import, moderation |
| `search` | базовая product discovery | dedicated search engine, facets, ranking |
| `cart` | cart persistence and grouping by vendor | cart merge, richer recovery |
| `orders` | order creation, status transitions, buyer/vendor views | tracking, auto-complete, richer timeline |
| `payments` | payment provider integration, escrow hold/release | richer payment methods and financial tooling |
| `payouts` | releasable balance and payout execution path | scheduled payouts, history, reconciliation |
| `disputes` | dispute opening, freeze, admin resolution | SLA automation, richer evidence and queueing |
| `subscriptions` | plan assignment and entitlement boundaries | billing automation, dunning, self-serve plan changes |
| `notifications` | transactional emails and core event fan-out | preferences, realtime, push |
| `files` | product media and private KYC documents | richer processing and moderation |
| `reviews` | extensibility only | public rating/review system |
| `api-platform` | not required at launch | API keys, vendor webhooks, external integrations |

**Invariant:** modules talk through explicit service boundaries or domain events, not through direct ownership of each other's tables.

---

## 4. Launch Architecture

### 4.1 Launch Containers

```text
┌────────────────────────────────────────────────────────────┐
│                 Buyer / Vendor / Admin UI                 │
│            web surfaces, one product workspace            │
└────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────┐
│                        Vendora API                         │
│ auth · vendor · catalog · cart · orders · payments        │
│ disputes · notifications · files · subscriptions(min)     │
└────────────────────────────┬───────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
     PostgreSQL           Redis           Background Workers
          │                  │                  │
          ├──────────────┐   │                  ├► email jobs
          │              │   │                  ├► search sync/basic indexing
          ▼              ▼   ▼                  ├► payout jobs
      S3 media        S3 KYC queue/cache        └► dispute/admin ops support
          │
          ▼
       Stripe + Resend
```

### 4.2 Launch Data Boundaries

Launch не обязан включать всю target-схему, но обязан включать эти core entities:

- `users`
- `vendors`
- `vendor_members`
  launch может стартовать с single-owner bias, но membership model лучше заложить сразу
- `kyc_applications`
- `kyc_documents`
- `products`
- `product_images`
- `orders`
- `order_items`
- `escrow_events`
- `disputes`
- `audit_log`

Допустимые launch simplifications:

- `product_variants` может быть минимальным или отложенным;
- `payout_batches` могут начинаться с простой operational model;
- `reviews`, `api_keys`, `webhook_deliveries` не обязательны.

### 4.3 Launch-Critical Patterns

#### 4.3.1 Checkout: Payment Webhook + Idempotency + Outbox

Launch money flow должен строиться так:

1. buyer инициирует checkout;
2. платёж подтверждается через provider flow;
3. order creation считается истинным только после provider-confirmed success path;
4. orders, escrow hold и domain events фиксируются атомарно;
5. downstream side effects уходят через outbox/queue.

Это закрывает 3 главных риска:

- duplicate order creation;
- рассинхрон между оплатой и заказом;
- потеря side effects после commit.

#### 4.3.2 Order State Machine

Launch state model должна быть явной и валидируемой:

```text
CREATED -> PAYMENT_HELD -> CONFIRMED -> SHIPPED -> DELIVERED -> COMPLETED
                    |            |
              PAYMENT_FAILED  CANCELLED
                                          \
                                           DISPUTED
```

Переходы:

- валидируются на backend;
- логируются;
- выполняются под lock/transaction discipline;
- публикуют events только после успешного state change.

#### 4.3.3 KYC Gate

Vendor не должен обходить approval gate.

Минимальная launch state machine:

```text
DRAFT -> PENDING_REVIEW -> APPROVED
                       \-> REJECTED
```

`REQUEST_MORE_INFO` может быть добавлен позже без поломки модели.

#### 4.3.4 Tenant Isolation

Даже на launch multi-tenancy не может быть “потом”.

Обязательные меры:

- tenant-aware ownership в таблицах;
- RBAC checks на backend;
- database-level isolation policy preferable from day one;
- vendor A никогда не должен прочитать vendor B.

Если PostgreSQL RLS доступен с начала, это правильный launch choice.

#### 4.3.5 File Segregation

Сразу разделяются два file classes:

- public marketplace media;
- private KYC documents.

KYC files:

- never public;
- never served from public CDN;
- always accessed through time-limited signed access;
- audit-sensitive.

#### 4.3.6 Async Job Model

На launch асинхронно должны жить как минимум:

- transactional emails;
- image processing;
- payout execution support;
- search/index sync;
- dispute/admin side effects.

Это снижает latency pressure на request path и облегчает runtime verification.

### 4.4 Launch Architecture Explicitly Does Not Require

На `R1` не должны silently притащиться такие вещи:

- dedicated search engine, если PostgreSQL-backed launch search проходит quality bar;
- WebSocket as mandatory dependency;
- full self-serve billing UI;
- full self-serve team management;
- public reviews;
- vendor API platform;
- enterprise SSO;
- advanced payout dashboards.

---

## 5. Target Architecture

### 5.1 Expanded Containers

Target-система добавляет к launch-контуру:

- dedicated search engine for large catalog discovery;
- realtime delivery layer for vendor/admin operational UX;
- richer admin operations surface;
- subscription/billing automation;
- vendor API/webhook delivery subsystem;
- enterprise identity integrations;
- deeper observability and reporting surfaces.

Пример target container expansion:

```text
UI Surfaces
  ├► Buyer App
  ├► Vendor Dashboard
  ├► Admin Operations
  └► Vendor API Clients

Core Runtime
  ├► Vendora API
  ├► Workers
  ├► Search Sync
  ├► Webhook Delivery
  └► Realtime/Event Fan-out

State + Infra
  ├► PostgreSQL + RLS
  ├► Redis queue/pubsub/cache
  ├► Search Engine
  ├► Public Media Storage
  ├► Private KYC Storage
  ├► Stripe Billing/Connect
  └► External Identity / Compliance systems
```

### 5.2 Target Data Expansion

К launch core добавляются или усиливаются:

- `product_variants`
- `payout_batches`
- `vendor_balances`
- `subscriptions`
- `reviews`
- `review_responses`
- `api_keys`
- `webhook_endpoints`
- `webhook_deliveries`
- `notification_preferences`
- richer audit/event tables

### 5.3 Target-Critical Patterns

#### Dedicated Search Engine

Переход к search engine оправдан, когда:

- catalog size перерастает simple DB search;
- нужна rich faceting and ranking;
- launch latency bar начинает ломаться.

Поиск остаётся derived system, не source of truth.

#### Realtime Fan-Out

Target realtime используется для:

- new order badges;
- dispute updates;
- richer operational dashboards.

Но деньги и state machines не должны зависеть от realtime доставки как от source of truth.

#### Automated Payout Batching

Target payouts переходят от manual/hosted initiation к:

- payout schedule;
- hold/release math;
- payout batch history;
- reconciliation workflow.

#### Rich Dispute Operations

Target disputes включают:

- SLA timers;
- structured evidence;
- queue management;
- policy-driven resolution;
- richer audit/reporting.

#### Subscription Automation

Target subscriptions включают:

- self-serve plan changes;
- dunning;
- grace periods;
- plan entitlements reflected across modules.

#### Vendor API Platform

Target API surface требует:

- scoped API keys;
- signed webhooks;
- delivery history;
- rate limits by plan.

---

## 6. Migration Notes

### 6.1 Stable First, Fancy Later

Нельзя менять domain boundaries только потому, что инфраструктура стала сложнее.

Меняться должны:

- internal implementations;
- sidecar systems;
- ops tooling;
- automation depth.

Не должны меняться без серьёзной причины:

- ownership of money flow;
- order/dispute state semantics;
- tenant boundaries;
- KYC gate.

### 6.2 Launch To Target Evolution Map

| Area | Launch | Target | Migration Trigger |
|---|---|---|---|
| Search | PostgreSQL-backed simple search acceptable | dedicated search engine | catalog size, relevance, facet depth |
| Notifications | email-first | realtime + preference management | vendor activity and ops load |
| Payouts | manual/hosted initiation acceptable | scheduled payout batches | payout volume and finance ops pressure |
| Admin ops | simple admin queue/manual tooling | rich admin operations surface | KYC/dispute queue complexity |
| Billing | plan assignment and hosted flows | full subscription automation | monetization depth |
| Auth | email/password + privileged admin access | 2FA, social login, SSO | compliance and enterprise demand |
| Catalog | simple listings | variants, bulk import, moderation | merchant sophistication |
| API | none | keys, webhooks, partner integrations | vendor integration demand |

### 6.3 Runtime Consequence

Это напрямую влияет на runtime depths:

- `R1` проверяет launch architecture and core invariants;
- `R2` проверяет strengthened paths и часть migration-ready capabilities;
- `R3` проверяет full target architecture against the richer design pack.

---

## 7. ADR Summary

### ADR-001: Modular Monolith First

- `Launch`: required
- `Target`: still valid

### ADR-002: Stripe / Stripe Connect As Payment Backbone

- `Launch`: required for payment, escrow-like hold and payout path
- `Target`: expands into billing and deeper payout ops

### ADR-003: PostgreSQL As System Of Record, Preferably With RLS

- `Launch`: transactional source of truth and tenant boundary
- `Target`: continues as primary system of record

### ADR-004: Outbox + Idempotent Consumers For Financial Events

- `Launch`: required for checkout/order/payout correctness
- `Target`: continues as reliability backbone

### ADR-005: Search Engine As Derived System, Not Launch Requirement

- `Launch`: optional if DB-backed search passes the bar
- `Target`: likely required

### ADR-006: Separate Public And Private File Domains

- `Launch`: required
- `Target`: remains required with stronger controls

---

## 8. Architecture Summary

- Launch architecture у Vendora должна быть проще target-state, но не слабой по инвариантам.
- Самые жёсткие архитектурные требования касаются денег, tenant isolation, KYC и state transitions.
- Search, realtime, billing UI, team UI и API platform должны входить позже, через explicit migration, а не через расползание `R1`.
