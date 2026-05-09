# Vendora — Business Requirements

> Multi-tenant B2B Marketplace Platform

Этот артефакт теперь читается в двух слоях:

- `Launch` — что нужно для первого реально запускаемого продукта
- `Target` — к чему продукт должен вырасти при полной проработке

Исходный смысл документа сохранён, но теперь он встроен в staged workflow Vendora.

---

## 1. Product Thesis

### Launch

Vendora на запуске — это marketplace, в котором:

- vendor проходит onboarding и KYC;
- публикует свои товары или услуги;
- buyer находит предложение, оформляет заказ и оплачивает его через платформу;
- платформа удерживает деньги до завершения сделки;
- при проблеме buyer может открыть спор;
- после успешного завершения vendor получает выплату.

### Target

Vendora в полном виде — это не только marketplace loop, но и vendor platform:

- multi-tenant vendor workspace;
- team and role model;
- subscription billing;
- payouts and operational finance;
- search and discovery layer;
- admin/compliance workflows;
- API platform and integrations.

---

## 2. Business Model

### Launch

На уровне первого релиза платформа должна уметь монетизироваться через:

- комиссию с транзакций (`take rate`);
- базовую vendor monetization model, даже если часть billing-процессов сначала закрывается упрощённо.

### Target

Полная бизнес-модель Vendora включает:

- transaction take rate;
- recurring vendor subscription revenue;
- более сложные vendor plans;
- отчётность по GMV, payouts, take rate и vendor MRR.

---

## 3. Actors

| Actor | Launch role | Target expansion |
|---|---|---|
| **Platform** | владелец продукта и правил платформы | управляет growth, monetization, compliance и ecosystem-level decisions |
| **Vendor** | размещает товары, обрабатывает заказы, получает выплаты | развивает магазин, команду, подписку, интеграции |
| **Vendor Member** | может быть ограничен минимальным role model или стартовать позже | получает полноценные роли owner/admin/manager/viewer |
| **Buyer** | ищет, покупает, отслеживает заказ, открывает спор | получает более богатые post-order, review и communication flows |
| **Platform Admin** | вручную проверяет KYC и помогает со спорами | получает полноценные admin queue, audit и operations workflows |

---

## 4. Launch Goals

- Запустить один работающий revenue loop: `vendor onboard -> listing -> buyer checkout -> order -> payout`.
- Сделать платформу безопасным посредником между vendor и buyer.
- Дать vendor понятный путь от заявки до первых продаж.
- Дать buyer понятный путь от поиска до получения заказа.
- Заложить основу для compliance-sensitive и money-sensitive flows.

---

## 5. Target Goals

- Построить полноценную vendor platform, а не только checkout shell.
- Поддержать командную работу vendor-аккаунтов.
- Поддержать subscription-driven growth.
- Поддержать enterprise-grade auth and access patterns.
- Довести продукт до сильной operational maturity в спорах, payouts, audit и analytics.

---

## 6. Launch Non-Goals

На запуске не обязаны быть полностью реализованы как самостоятельные polished domains:

- mobile app;
- advertising platform for vendors;
- ML recommendations;
- crypto payments;
- deep logistics integrations;
- rich buyer-vendor chat;
- full enterprise SSO rollout;
- full API platform.

Эти темы могут существовать как target direction, но не должны раздувать launch scope раньше времени.

---

## 7. Core Launch Loop

Критический launch loop:

1. Vendor регистрируется и подаёт заявку.
2. Платформа проверяет vendor и допускает к продажам.
3. Vendor создаёт и публикует листинг.
4. Buyer находит товар через каталог и поиск.
5. Buyer оформляет заказ и платит через платформу.
6. Заказ проходит через статусы исполнения.
7. Buyer подтверждает получение или открывает спор.
8. Escrow разблокируется по правилам платформы.
9. Vendor получает выплату, платформа удерживает комиссию.

Если этот loop не работает, launch смысла не имеет.

---

## 8. Product Domains

### 8.1 Authentication And Access

#### Launch

- Vendor и Buyer могут зарегистрироваться по email + пароль.
- Buyer может иметь гостевой checkout, если это поддержано runtime slice.
- Platform Admin должен иметь контролируемый доступ к vendor/KYC/dispute workflows.
- Минимальная access-модель должна поддерживать buyer, vendor и admin boundaries.

#### Target

- Social login для buyer и vendor.
- SSO / SAML для enterprise vendor.
- 2FA для финансово чувствительных ролей.
- Invite-only расширение команды vendor owner'ом.
- Более развитая сессионная и role-aware access model.

### 8.2 Vendor Onboarding And KYC

#### Launch

- Vendor заполняет бизнес-профиль: название, юрлицо, ИНН/VAT, адрес, категория.
- Загружает документы для KYC.
- Привязывает payout-ready реквизиты.
- Platform Admin может одобрить или отклонить заявку.
- Статусы как минимум отражают путь `PENDING_REVIEW -> APPROVED / REJECTED`.

#### Target

- Автоматическая и ручная валидация документов.
- Повторная проверка при изменении payout details.
- Более глубокий KYC state machine.
- Compliance-driven review queues и supporting audit trail.

### 8.3 Vendor Profile And Workspace

#### Launch

- Vendor имеет базовую публичную страницу или профиль.
- Может управлять настройками магазина на уровне, достаточном для продаж.
- Может видеть и обслуживать заказы.

#### Target

- Полноценная store identity: описание, логотип, баннер, политики.
- Управление командой и ролями.
- Управление payout details и subscription settings.
- API keys и ERP/WMS integration surface.

### 8.4 Catalog Management

#### Launch

- Vendor создаёт товар или услугу с названием, описанием, ценой и остатком.
- Есть черновики и публикация.
- Платформа различает опубликованный и непубличный листинг.

#### Target

- Фото до 10 штук.
- Категории, SKU и варианты товара.
- SEO fields и slug.
- Bulk import через CSV.
- Более сильная moderation and listing lifecycle model.

### 8.5 Search And Discovery

#### Launch

- Buyer видит каталог опубликованных товаров.
- Есть полнотекстовый поиск по товарам vendors.
- Есть минимально полезные фильтры и страница vendor.

#### Target

- Фасетные фильтры: категория, цена, рейтинг vendor, срок доставки, геолокация.
- Более глубокая сортировка.
- Рекомендации и richer discovery model.

### 8.6 Cart And Checkout

#### Launch

- Buyer может добавить в корзину товары нескольких vendors.
- Платформа разбивает checkout на vendor-specific orders.
- Buyer передаёт адрес и оплачивает заказ через платформу.
- Платформа удерживает деньги в escrow-like модели до завершения сделки.

#### Target

- Vendor-specific shipping methods.
- Platform-wide and vendor-specific promo codes.
- Более богатая breakdown-модель по каждой части заказа.
- Улучшенные recovery flows при проблемах в checkout.

### 8.7 Order Management

#### Launch

- Buyer видит свои заказы и их статусы.
- Vendor видит входящие заказы.
- Существует минимальная state machine исполнения заказа.
- Buyer может подтвердить получение.
- Buyer может открыть спор.

#### Target

- Real-time order updates.
- Export/history tools.
- Tracking number and carrier workflows.
- Автоподтверждение, richer timeline и post-order review loop.

### 8.8 Payments, Escrow And Billing

#### Launch

- Buyer платит картой через Stripe-like flow.
- Платформа удерживает средства до завершения сделки.
- Платформа должна уметь учитывать свою комиссию.
- Vendor должен иметь путь к выплате после корректного завершения заказа.

#### Target

- Apple Pay / Google Pay.
- Полноценные payouts по расписанию.
- Trial, recurring billing и dunning для vendor subscriptions.
- Более сильная финансовая отчётность и payout history.

### 8.9 Reviews And Ratings

#### Launch

- Reviews не обязаны быть launch-critical, если они мешают core loop.
- Если запускаются, то только как простой post-completion feedback flow.

#### Target

- Отзывы на vendor и конкретный товар.
- Оценка 1–5 + текст + фото.
- Ответ vendor на отзыв.
- Взвешенный рейтинг vendor за период.
- Moderation queue for complaints.

### 8.10 Disputes

#### Launch

- Buyer может открыть спор после проблемного заказа.
- Спор имеет понятные статусы.
- Vendor обязан ответить в ограниченный срок.
- Platform Admin может принять решение.
- Escrow должен зависеть от результата спора.

#### Target

- Более богатая evidence model: фото, документы, attachments.
- Более сильная SLA automation.
- Partial refund and more nuanced resolutions.
- Полноценный audit trail по каждому действию.

### 8.11 Notifications

#### Launch

- Транзакционные уведомления для critical events: заказ, статус заказа, спор, выплата, billing-sensitive события.
- Email — минимально обязательный канал.

#### Target

- In-app уведомления.
- Push/web notifications.
- Marketing communications.
- Granular notification preferences.

### 8.12 Analytics

#### Launch

- Платформе нужна хотя бы минимальная операционная видимость:
  - активные vendors;
  - заказы;
  - споры;
  - KYC queue.

#### Target

- Vendor dashboard с GMV, net revenue, top products, conversion.
- Platform dashboard с GMV, take rate, subscription MRR, dispute visibility.

### 8.13 Buyer-Vendor Chat

#### Launch

- Не является launch-critical, если блокирует core marketplace loop.

#### Target

- Pre-sale and order-context communication.
- Message visibility for platform in dispute resolution.
- Notification support for new messages.

### 8.14 API Platform

#### Launch

- Не обязана быть полноценной частью первого запуска.

#### Target

- API keys для vendor integrations.
- Webhooks на новые заказы, смену статусов и выплаты.
- Import/update flows for catalog and inventory.
- Sandbox-style integration experience.

---

## 9. Operational And Business Expectations

### 9.1 Availability And Performance

#### Launch

- Buyer-facing core flows должны быть достаточно быстрыми для реального использования.
- Search, checkout и product discovery не должны быть чисто номинальными.

#### Target

- SLO 99.9% для buyer-facing pages.
- Поиск p95 < 300мс.
- Checkout p95 < 500мс.
- LCP страницы товара < 2.5 сек.

### 9.2 Security And Compliance

#### Launch

- Платформа не хранит card data.
- Есть базовый compliance path around KYC and payouts.
- Есть минимальный audit-sensitive подход к money and role changes.

#### Target

- PCI-aware payment boundaries через Stripe tokenization.
- GDPR export/delete expectations.
- Audit log для финансовых операций и role-sensitive changes.
- Sensitive data at rest и strong transport encryption.

### 9.3 Scalability

#### Launch

- Продукт должен выдерживать локальный и ранний operational growth без полной переработки core flows.

#### Target

- Horizontal API scaling.
- Search isolated from primary system of record.
- Async notifications and order-side background work.
- CDN-backed media delivery.

### 9.4 Cost Management

#### Launch

- Инфраструктура не должна быть чрезмерно сложной для раннего этапа.
- Unit economics не обязаны быть идеальными, но должны быть наблюдаемыми.

#### Target

- Subscription MRR и take rate как основные revenue streams.
- Cost-aware storage and delivery model.
- Explicit view of service cost per active vendor.

---

## 10. Explicit Out Of Scope For Now

Сейчас вне ближайшего launch scope:

- physical logistics integrations;
- mobile app;
- advertising platform for vendors;
- ML-driven recommendations;
- crypto as payment method.

Эти темы остаются valid target directions, но не должны утяжелять первый runtime path.
