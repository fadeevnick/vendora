# Vendora — Tech Stack

> Multi-tenant B2B Marketplace Platform

Этот артефакт теперь следует архитектурному разделению:

- `Now` — технологии для `Launch Architecture`
- `Later` — технологии для `Target Architecture`
- `Why later` — почему это не нужно тащить в первый runtime slice

Главное правило:

```text
стек выбирается из архитектуры, а не наоборот
```

Контекст выбора:

- команда 3–5 инженеров;
- AWS-compatible deployment model;
- приоритет: `speed of delivery > operational simplicity > cost`;
- money-sensitive flows и tenant isolation нельзя упрощать ниже безопасного уровня.

---

## 1. Selection Principles

1. `Now` стек должен покрывать launch architecture без скрытого overengineering.
2. `Later` стек должен быть продолжением `Now`, а не сменой парадигмы.
3. Для денег, auth и tenant isolation допускается более высокий quality bar уже на launch.
4. Для search, realtime, analytics, billing UX и API-platform допускается отложенное усиление.

---

## 2. Stack Summary

| Area | Now | Later | Why later |
|---|---|---|---|
| Backend | `Node.js + TypeScript + Fastify` | same core stack | менять backend stack смысла нет |
| Frontend | `Next.js` | same core stack | launch и target используют одни и те же product surfaces |
| Primary DB | `PostgreSQL` | `PostgreSQL + read replicas / stronger tuning` | база нужна сразу, а не позже |
| Search | `PostgreSQL FTS + pg_trgm` | `Meilisearch` | отдельный search engine нужен после роста каталога и facet depth |
| Cache / queue | `Redis` | `Redis cluster / managed scaling` | базовый Redis already covers cart, rate limit, queue |
| Workers | `BullMQ` | same, or managed queue if scale demands | отдельный broker не нужен на старте |
| Public files | `S3 + CloudFront` | same | публичное медиа нужно сразу |
| Private files | `S3 private bucket` | same + stronger controls | KYC-private storage нужно сразу |
| Image processing | `worker + Sharp` | `imgproxy` or dedicated media pipeline | launch не обязан тащить отдельный image service |
| Auth | `custom auth + JWT/refresh + Redis session support` | `2FA`, `Auth0/enterprise SSO` | enterprise identity и richer auth depth не блокируют launch |
| Payments | `Stripe + Stripe Connect` | `Stripe Billing` depth and more payout automation | базовый payment/payout path нужен сразу, billing depth позже |
| Email | `Resend` | `Resend / SendGrid / SES` at higher scale | launch требует только strong transactional email |
| Realtime | not required in `R1`; email-first | `Socket.io + Redis Pub/Sub` | realtime nice-to-have until ops pressure grows |
| Edge / WAF | `Cloudflare` | same | low-effort high-value layer |
| Ingress | `Nginx` | `Nginx / Kong if API platform grows` | gateway plugins не нужны на launch |
| CI/CD | `GitHub Actions` | `GitHub Actions + Argo CD` | GitOps overhead можно добавить позже |
| IaC | `Terraform` for durable infra | same | infra should stay reproducible |
| Secrets | `AWS Secrets Manager` | same | secrets hygiene needed immediately |
| Observability | `Sentry + basic metrics/logs` | `Grafana Cloud + OTEL + richer dashboards` | full observability suite not needed for first launch |
| Product analytics | lightweight event tracking or deferred | `PostHog` | growth analytics not needed to validate core runtime |
| Compute | `Docker` + simple AWS container runtime | `EKS` if scale/ops justify | Kubernetes can be deferred if it slows launch |

---

## 3. Application Layer

### Backend: Node.js + TypeScript + Fastify

`Now`

- единый язык across frontend and backend;
- mature ecosystem for Stripe, BullMQ, Redis and email;
- Fastify fits modular monolith and typed request/response contracts.

`Later`

- stack remains the same;
- усиливаются internal boundaries, workers, plugins and operational tooling.

Почему не менять позже:

- доменная модель и runtime discipline важнее, чем замена backend framework.

### Frontend: Next.js

`Now`

- buyer-facing pages;
- vendor dashboard;
- simple admin/ops surface;
- one codebase with route separation.

`Later`

- richer vendor/admin UX;
- better caching and performance strategy;
- optional edge optimizations for search-heavy surfaces.

Почему `Now` уже достаточно:

- launch и target используют те же основные product surfaces;
- менять frontend framework по мере роста не нужно.

---

## 4. Data And State

### Primary Database: PostgreSQL

`Now`

- ACID for checkout/order/dispute flows;
- `NUMERIC` for money;
- explicit constraints and state ownership;
- tenant isolation support;
- `pg_trgm` acceptable for launch search.

`Later`

- stronger connection management;
- read replicas;
- more aggressive indexing and partitioning where needed.

Почему `Now` уже нужен fully:

- PostgreSQL — source of truth для money, state machines и tenants;
- здесь нельзя делать временный компромисс вроде “что-то попроще”.

### Redis

`Now`

- cart persistence;
- idempotency keys;
- rate limiting;
- queue backend;
- cache where justified.

`Later`

- pub/sub for realtime;
- clustering/sharding;
- distributed lock usage for payout and scheduled ops.

Почему не нужен отдельный broker сразу:

- launch complexity не оправдывает Kafka/RabbitMQ.

### BullMQ

`Now`

- transactional emails;
- image jobs;
- payout support jobs;
- search sync;
- admin/dispute side effects.

`Later`

- retry/DLQ discipline can deepen;
- move to managed queue only if worker scale or isolation pressure demands it.

---

## 5. Search, Files And Media

### Search

`Now`: PostgreSQL full-text search + `pg_trgm`

- достаточно для launch catalog;
- keeps system simpler while search quality bar is still moderate;
- no separate operational surface.

`Later`: Meilisearch

- when catalog size, facets and ranking justify a dedicated search engine;
- remains a derived index, not source of truth.

### Public Media

`Now`

- `S3` for storage;
- `CloudFront` for delivery;
- direct upload through presigned URLs.

`Later`

- richer media pipeline;
- optimized transformations and stronger CDN strategy if needed.

### Private KYC Files

`Now`

- separate private `S3` bucket;
- no public CDN;
- short-lived signed access;
- audit-aware access path.

`Later`

- stronger KMS and access reporting if compliance pressure grows.

### Image Processing

`Now`: worker + `Sharp`

- good enough for basic thumbnails and resized product media;
- avoids introducing a separate image service in `R1`.

`Later`: `imgproxy` or dedicated media service

- when image volume, variants or transformation complexity justify it.

---

## 6. Identity, Payments And Notifications

### Authentication And Access

`Now`

- custom auth flow;
- JWT access + refresh/session support;
- email verification;
- privileged admin access path;
- backend RBAC and tenant checks.

`Later`

- social login depth;
- TOTP 2FA for privileged roles;
- Auth0 or equivalent only when enterprise SSO becomes real scope.

Почему не Auth0 сразу:

- launch не требует full enterprise IAM;
- Vendora auth deeply tied to vendor context and KYC lifecycle;
- early hosted IAM can add cost and product-shape friction.

### Payments

`Now`: Stripe + Stripe Connect

- payment intents;
- escrow-like hold/release path;
- refunds;
- vendor payout path;
- provider-driven KYC/account onboarding where relevant.

`Later`

- billing/subscription automation depth;
- more payout scheduling and finance visibility;
- richer payment surface if product growth demands it.

Почему Stripe нужен сразу:

- payment correctness and payout path are core product truth, not later nice-to-have.

### Email

`Now`: Resend

- transactional email is enough for launch;
- clean API and low setup friction.

`Later`

- scale to SendGrid/SES if volume or compliance needs change;
- add marketing-grade tooling only when growth loops need it.

### Realtime

`Now`

- not mandatory for launch;
- email-first and page-refresh-safe operational UX acceptable.

`Later`: Socket.io + Redis Pub/Sub

- add only when vendor/admin workflows benefit materially from live updates.

---

## 7. Networking, Delivery And Ops

### Edge / WAF

`Now`: Cloudflare

- DNS;
- TLS;
- basic CDN;
- WAF and DDoS reduction.

`Later`

- same layer can remain; no reason to replace it early.

### Ingress / Gateway

`Now`: Nginx

- routing;
- basic rate limiting;
- ingress control.

`Later`

- Kong or richer gateway only if vendor API platform becomes substantial.

### CI/CD

`Now`: GitHub Actions

- build, test, image publish, deploy automation.

`Later`: GitHub Actions + Argo CD

- GitOps becomes worth it when environments and deploy frequency justify it.

### Infrastructure As Code

`Now`: Terraform

- VPC/networking;
- database;
- cache;
- buckets;
- secrets wiring.

`Later`

- same tool, just more modules and stronger env separation.

### Secrets

`Now`: AWS Secrets Manager

- database URL;
- Stripe keys;
- email provider secrets;
- JWT secrets;
- bucket/KMS references.

`Later`

- rotation hardening and richer secret sync flow.

### Observability

`Now`: Sentry + basic metrics/logging

- runtime exceptions;
- key API/worker visibility;
- enough signal for early production.

`Later`: Grafana Cloud + OTEL + richer dashboards

- when queue depth, payout reliability and search performance need deeper operations visibility.

### Product Analytics

`Now`

- lightweight event tracking or even deferred setup;
- do not block launch on full analytics stack.

`Later`: PostHog

- when growth and funnel optimization become first-class work.

### Compute

`Now`

- Docker for local parity;
- simple AWS container runtime for launch.

`Later`

- EKS only if team, traffic and runtime surface justify Kubernetes overhead.

---

## 8. Concrete Stack Decisions

| Domain | Now | Later |
|---|---|---|
| API backend | `Node.js + TypeScript + Fastify` | same |
| Frontend | `Next.js` | same |
| DB | `PostgreSQL 16` | `PostgreSQL 16 + replicas/tuning` |
| Search | `PostgreSQL FTS + pg_trgm` | `Meilisearch` |
| Cache / queue | `Redis 7` | `Redis cluster` |
| Workers | `BullMQ` | same or managed queue later |
| Public media | `S3 + CloudFront` | same |
| Private KYC files | `S3 private bucket` | same + stronger controls |
| Image processing | `Sharp in workers` | `imgproxy` |
| Auth | `custom auth + JWT/refresh` | `2FA + Auth0/SSO` |
| Payments | `Stripe + Stripe Connect` | `Stripe Billing` depth |
| Email | `Resend` | `Resend / SES / SendGrid` |
| Realtime | not required | `Socket.io + Redis Pub/Sub` |
| Edge | `Cloudflare` | same |
| Ingress | `Nginx` | `Nginx / Kong` |
| CI/CD | `GitHub Actions` | `GitHub Actions + Argo CD` |
| IaC | `Terraform` | same |
| Secrets | `AWS Secrets Manager` | same |
| Observability | `Sentry + basic metrics/logs` | `Grafana Cloud + OTEL` |
| Analytics | deferred/lightweight | `PostHog` |
| Compute | `Docker + simple AWS runtime` | `EKS` |

---

## 9. Stack Summary

- `Now` стек у Vendora должен быть достаточно сильным для денег, auth, tenant isolation и async side effects.
- `Later` стек усиливает discovery, ops и enterprise depth, но не должен ломать launch shape.
- Самые важные deliberate deferrals: dedicated search engine, realtime, full billing UX, enterprise identity, API platform, Kubernetes-heavy ops.
