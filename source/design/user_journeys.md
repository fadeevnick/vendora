# Vendora — User Journeys

> Multi-tenant B2B Marketplace Platform

Этот артефакт теперь читается в трёх разрезах:

- `Launch Path` — что нужно для первого рабочего revenue loop
- `Target Expansion` — к чему флоу должны вырасти при полной проработке
- `Runtime Pressure` — что позже должно проверяться в `R1`, `R2`, `R3`

Исходное покрытие Vendora сохранено, но теперь journeys приведены к launch-first, target-aware модели.

---

## 1. Reading Model

- Флоу сгруппированы по актору.
- Каждый journey явно показывает, обязателен ли он для запуска или относится к более позднему слою.
- `Launch Path` задаёт то, что должно питать `../planning/launch_roadmap.md`, `functional_requirements.md` и ранний runtime.
- `Target Expansion` сохраняет полноту учебного полигона и будущую зрелую версию продукта.
- `Runtime Pressure` раскладывает флоу по глубинам:
  - `R1` — рабочий launch path и критические инварианты
  - `R2` — альтернативные пути, ошибки, роли, state transitions
  - `R3` — полная operational and compliance depth

---

## 2. Vendor Journeys

### V-1. Registration And KYC Onboarding

`Launch Scope:` required for launch

**Trigger:** компания хочет начать продавать на Vendora  
**Actor:** будущий Vendor

**Launch Path:**
1. Vendor переходит на `/become-a-vendor`.
2. Регистрируется по email + пароль.
3. Подтверждает email.
4. Заполняет бизнес-профиль: название, юрлицо, ИНН/VAT, страна, адрес.
5. Выбирает категорию продаж.
6. Загружает ключевые KYC-документы.
7. Передаёт payout-ready данные через Stripe-like onboarding или эквивалентный flow.
8. Отправляет заявку со статусом `PENDING_REVIEW`.
9. Platform Admin одобряет или отклоняет заявку.
10. При одобрении vendor входит в dashboard и может начинать продажи.

**Target Expansion:**
- social login для vendor;
- reminder/resume flows для незавершённого onboarding;
- `REQUEST_MORE_INFO` и более богатая KYC state machine;
- automated sanctions/document checks;
- deeper compliance queue и richer audit trail.

**Alternative Paths:**
- документы отклонены с комментарием и повторной загрузкой;
- onboarding брошен посередине и может быть продолжен позже;
- страна vendor не поддерживается и заявка уходит в waitlist/manual handling.

**Result:** vendor либо получает статус `APPROVED`, либо возвращается на доработку заявки.

**Runtime Pressure:**
- `R1`: регистрация, email verification, `PENDING_REVIEW -> APPROVED / REJECTED`, защищённый доступ к документам, базовый admin review.
- `R2`: resume flow, reminder jobs, `REQUEST_MORE_INFO`, повторная проверка payout details.
- `R3`: compliance escalation, automation checks, полный audit-sensitive review flow.

### V-2. Listing Creation

`Launch Scope:` required for launch

**Trigger:** vendor хочет выставить товар или услугу  
**Actor:** Vendor

**Launch Path:**
1. Vendor открывает dashboard и идёт в каталог.
2. Создаёт листинг с названием, описанием, категорией, ценой и остатком.
3. Добавляет хотя бы одно изображение или другой минимально обязательный media asset.
4. Сохраняет черновик или публикует листинг.
5. После публикации листинг становится виден buyer в каталоге и поиске.

**Target Expansion:**
- rich text, теги и расширенная категоризация;
- до 10 фото с reorder и preview;
- варианты товара и SKU generation;
- SEO fields и editable slug;
- bulk import through CSV;
- moderation lifecycle и более глубокая индексация.

**Alternative Paths:**
- vendor упирается в лимит плана и получает upgrade prompt;
- media asset не проходит валидацию или moderation;
- импорт даёт preview ошибок до подтверждения.

**Result:** опубликованный листинг становится частью buyer-facing каталога.

**Runtime Pressure:**
- `R1`: draft/publish lifecycle, корректная публичность листинга, попадание опубликованного товара в каталог.
- `R2`: quota checks, async indexing, richer validation и media processing.
- `R3`: variants, bulk import, listing moderation, deeper catalog lifecycle.

### V-3. Incoming Order Handling

`Launch Scope:` required for launch

**Trigger:** buyer оформил заказ у vendor  
**Actor:** Vendor

**Launch Path:**
1. Vendor получает уведомление о новом заказе.
2. Открывает заказ в статусе `PAYMENT_HELD`.
3. Просматривает состав заказа, адрес и контакты buyer.
4. Подтверждает заказ или отменяет с причиной.
5. Если заказ исполняется, помечает его как отправленный или готовый к получению.
6. Buyer подтверждает получение или переводит заказ в спор.
7. При успешном завершении заказ переходит в `COMPLETED`, а releasable balance становится доступен к выплате.

**Target Expansion:**
- real-time dashboard updates;
- tracking number and carrier workflows;
- richer order timeline;
- export/history tools;
- auto-confirmation after timeout.

**Alternative Paths:**
- vendor отменяет заказ и платформа делает refund;
- buyer открывает спор и выплата замораживается;
- частичное исполнение или операционные задержки требуют ручного admin follow-up.

**Result:** заказ либо успешно закрыт, либо корректно переведён в refund/dispute path.

**Runtime Pressure:**
- `R1`: order state machine, cancel/refund path, freeze/release of funds, переход в `DISPUTED`.
- `R2`: tracking updates, auto-confirmation, notification fanout.
- `R3`: payout scheduling, deep history, richer vendor ops tooling.

### V-4. Team Management

`Launch Scope:` target-first

**Trigger:** vendor хочет добавить сотрудника  
**Actor:** Vendor owner

**Launch Path:**
1. На первом запуске продукт может работать с одним vendor owner.
2. Если второму оператору нужен доступ до полноценного team UI, platform admin может выдать его вручную.
3. Любой выданный доступ всё равно должен уважать tenant boundary vendor.

**Target Expansion:**
- self-serve page `Settings -> Team`;
- invite flow с TTL;
- роли `owner / admin / manager / viewer`;
- plan-based member limits;
- remove, resend, revoke, role change.

**Alternative Paths:**
- превышен лимит участников;
- ссылка-приглашение истекла;
- owner отзывает приглашение до принятия.

**Result:** vendor account может перейти от single-owner mode к team-aware workspace.

**Runtime Pressure:**
- `R1`: owner-only model и строгая tenant isolation.
- `R2`: basic invite flow и role enforcement.
- `R3`: full self-serve team management, limits, audit trail.

### V-5. Subscription Management

`Launch Scope:` launch-supporting, but can be manual or hosted

**Trigger:** vendor нужен upgrade, downgrade или понимание текущего плана  
**Actor:** Vendor owner

**Launch Path:**
1. На запуске vendor получает план через hosted billing page, Stripe portal или manual platform ops.
2. Изменение плана отражается в доступных лимитах и возможностях vendor.
3. Подтверждение и billing artifacts приходят от платёжного провайдера или support flow.

**Target Expansion:**
- собственный billing UI;
- plan comparison and upgrade UX;
- prorated billing;
- dunning и grace period;
- full invoice history.

**Alternative Paths:**
- неуспешный платёж и переход в grace period;
- downgrade после окончания пробного периода;
- ограничение фич из-за истечения подписки.

**Result:** у vendor есть актуальный commercial plan и понятные лимиты.

**Runtime Pressure:**
- `R1`: plan assignment и enforcement лимитов, даже если источник hosted/manual.
- `R2`: subscription webhook handling, grace period, payment failure recovery.
- `R3`: full billing lifecycle, invoices, dunning, plan transitions.

### V-6. Payout Receipt

`Launch Scope:` required for the financial loop, dedicated UI can start simplified

**Trigger:** completed orders сформировали сумму к выплате  
**Actor:** Vendor owner

**Launch Path:**
1. Платформа считает releasable balance как сумму завершённых и неоспариваемых заказов за вычетом комиссии.
2. Платформа инициирует payout по расписанию или вручную через provider/admin ops.
3. Vendor получает подтверждение, что выплата отправлена.
4. Минимальная прозрачность по payout status доступна хотя бы через support/admin channel.

**Target Expansion:**
- vendor-facing finance dashboard;
- payout history и статусы;
- weekly/monthly schedule settings;
- retry flow для невалидных реквизитов;
- reconciliation reporting.

**Alternative Paths:**
- баланс ниже минимума и переносится на следующий период;
- payout блокируется из-за реквизитов или dispute hold;
- требуется ручная сверка перед release.

**Result:** заработанные средства доходят до vendor по контролируемому финансовому пути.

**Runtime Pressure:**
- `R1`: корректная payout eligibility math и блокировка disputed funds.
- `R2`: failed payout handling, hold/release rules, vendor-visible statuses.
- `R3`: scheduled payouts, reconciliation, financial reporting depth.

---

## 3. Buyer Journeys

### B-1. Registration And First Entry

`Launch Scope:` required for launch

**Trigger:** buyer хочет зарегистрироваться или сделать первую покупку  
**Actor:** Buyer

**Launch Path:**
1. Buyer регистрируется по email + пароль.
2. Подтверждает email.
3. Получает короткое объяснение, что платформа поддерживает безопасную покупку через escrow-like flow.
4. Переходит в поиск.
5. Если guest checkout разрешён для launch slice, buyer может сначала оформить заказ как гость, а аккаунт создать позже.

**Target Expansion:**
- social login;
- richer onboarding and personalization;
- smoother account creation after guest checkout;
- stronger session/device management.

**Alternative Paths:**
- email уже занят;
- buyer не подтверждает email вовремя;
- guest checkout конвертируется в аккаунт после заказа.

**Result:** buyer получает путь в каталог и checkout, с аккаунтом или в guest-compatible режиме.

**Runtime Pressure:**
- `R1`: email registration, session creation, optional guest checkout boundary.
- `R2`: social auth, better onboarding recovery, account-linking edge cases.
- `R3`: deeper session/security model and richer identity management.

### B-2. Search And Product Selection

`Launch Scope:` required for launch

**Trigger:** buyer ищет товар или изучает предложения  
**Actor:** Buyer

**Launch Path:**
1. Buyer открывает каталог или вводит поисковый запрос.
2. Видит список опубликованных товаров с базовой ценой и vendor attribution.
3. Применяет минимальные фильтры, если они доступны в launch slice.
4. Открывает карточку товара.
5. Смотрит описание, цену, наличие и информацию о vendor.
6. Добавляет товар в корзину и продолжает покупки.

**Target Expansion:**
- vendor ratings and review context;
- richer vendor profile;
- faceted filters;
- recommendations and discovery tuning;
- stock alerts and saved searches.

**Alternative Paths:**
- товар закончился;
- поиск ничего не нашёл;
- vendor profile требует более глубокого trust context.

**Result:** buyer выбирает нужный товар и переносит намерение в cart/checkout.

**Runtime Pressure:**
- `R1`: видимость только опубликованных товаров, базовый поиск, добавление в корзину.
- `R2`: filters, stock handling, richer vendor context.
- `R3`: recommendation logic, rating aggregation, advanced discovery behavior.

### B-3. Checkout

`Launch Scope:` required for launch

**Trigger:** buyer переходит к оформлению заказа  
**Actor:** Buyer

**Launch Path:**
1. Корзина показывает товары, сгруппированные по vendors.
2. Buyer вводит или выбирает адрес доставки.
3. Подтверждает состав заказа и итоговую сумму.
4. Платит картой через Stripe-like flow.
5. Если требуется, проходит 3DS.
6. Система создаёт vendor-specific orders в одном согласованном checkout flow.
7. Средства фиксируются в escrow-like модели до завершения или решения спора.
8. Buyer получает подтверждение заказа.

**Target Expansion:**
- Apple Pay / Google Pay;
- vendor-specific shipping methods;
- promo codes;
- richer per-vendor breakdown;
- stronger recovery flows на середине checkout.

**Alternative Paths:**
- часть товара исчезла из наличия между корзиной и оплатой;
- платёж отклонён;
- нельзя допустить partial success между vendor-specific order creations.

**Result:** buyer успешно превращает cart в набор заказов с удержанием средств на платформе.

**Runtime Pressure:**
- `R1`: idempotent checkout, atomic order creation, escrow hold, отсутствие partial commit.
- `R2`: shipping methods, promo paths, recovery after checkout interruptions.
- `R3`: richer breakdown, deeper payment method surface, advanced checkout resilience.

### B-4. Order Tracking And Receipt Confirmation

`Launch Scope:` required for launch, but can start minimal

**Trigger:** buyer хочет понять статус заказа  
**Actor:** Buyer

**Launch Path:**
1. Buyer открывает список своих заказов.
2. Видит текущий статус каждого заказа.
3. Открывает конкретный заказ и видит базовые детали.
4. Если заказ уже отправлен, получает минимальный shipment context или статус.
5. Подтверждает получение, после чего заказ может перейти в `COMPLETED`.

**Target Expansion:**
- timeline of status changes;
- tracking number and carrier links;
- automatic confirmation after timeout;
- richer post-order nudges.

**Alternative Paths:**
- buyer не подтверждает получение вовремя;
- shipment задерживается и buyer переходит к спору;
- order details требуют support intervention.

**Result:** buyer видит post-purchase состояние и может закрыть успешный заказ.

**Runtime Pressure:**
- `R1`: order visibility, confirmation action, переход к completion/dispute.
- `R2`: shipment metadata, timeout auto-confirmation, clearer timeline.
- `R3`: richer post-order UX and stronger event history.

### B-5. Dispute Opening

`Launch Scope:` required for launch

**Trigger:** buyer недоволен заказом  
**Actor:** Buyer

**Launch Path:**
1. Buyer открывает заказ и нажимает «Открыть спор».
2. Выбирает причину и описывает проблему.
3. Прикладывает evidence, если это нужно.
4. Спор создаётся в статусе `VENDOR_RESPONSE`.
5. Средства по спорному заказу замораживаются.
6. Vendor отвечает предложением решения.
7. Если стороны не договорились, спор уходит в `PLATFORM_REVIEW`.
8. Platform Admin принимает решение, после чего refund/release происходит по правилам платформы.

**Target Expansion:**
- structured evidence packs;
- SLA timers;
- richer buyer-vendor communication inside dispute;
- internal admin notes and escalation policy.

**Alternative Paths:**
- vendor и buyer соглашаются без admin escalation;
- buyer подаёт неполный dispute и должен дополнить данные;
- требуется частичный refund.

**Result:** спор либо закрывается мирно, либо доходит до платформенного решения без потери контроля над деньгами.

**Runtime Pressure:**
- `R1`: dispute creation, fund freeze, admin resolution, financial execution of decision.
- `R2`: vendor response windows, partial refund paths, richer evidence handling.
- `R3`: full dispute operations depth, SLA automation, audit-heavy workflows.

### B-6. Reviews And Ratings

`Launch Scope:` target-first

**Trigger:** заказ завершён и buyer готов оставить отзыв  
**Actor:** Buyer

**Launch Path:**
1. Платформа может запуститься без публичной review system.
2. Если feedback нужен раньше, его можно собирать через email/support без отдельного product loop.

**Target Expansion:**
- отзыв на товар и vendor;
- rating 1-5;
- текст и media attachments;
- public vendor response;
- moderation and abuse handling.

**Alternative Paths:**
- отзыв подозрителен и скрывается до модерации;
- пользователь жалуется на чужой отзыв;
- vendor отвечает публично.

**Result:** после запуска core marketplace можно добавить trust/reputation layer.

**Runtime Pressure:**
- `R1`: not required beyond preserving extensibility.
- `R2`: basic review submission and moderation.
- `R3`: public reputation system, abuse controls, vendor response loop.

---

## 4. Platform Admin Journeys

### A-1. KYC Review

`Launch Scope:` required for launch, can start with simple admin ops

**Trigger:** vendor подал заявку  
**Actor:** Platform Admin

**Launch Path:**
1. Admin открывает очередь новых vendor заявок.
2. Просматривает бизнес-профиль, документы и payout context.
3. Принимает решение: `APPROVED` или `REJECTED`.
4. При необходимости оставляет комментарий.
5. Vendor получает уведомление о результате.

**Target Expansion:**
- `REQUEST_MORE_INFO`;
- automated blacklist/sanctions checks;
- compliance escalation;
- richer review queue, filters and audit metadata.

**Alternative Paths:**
- заявка требует доработки;
- обнаружен риск и кейс эскалируется;
- review надо переработать после изменения payout details.

**Result:** platform контролирует вход vendor в доверенную часть marketplace.

**Runtime Pressure:**
- `R1`: простая review queue, approve/reject, notifications, access control к документам.
- `R2`: request-more-info loop, richer logs, repeated checks.
- `R3`: compliance automation and deeper risk workflow.

### A-2. Dispute Resolution

`Launch Scope:` required for launch, can start with manual-heavy ops

**Trigger:** dispute эскалирован на платформу  
**Actor:** Platform Admin

**Launch Path:**
1. Admin открывает спор в статусе `PLATFORM_REVIEW`.
2. Смотрит заказ, историю статусов, сообщения сторон и evidence.
3. Выбирает решение: full refund, partial refund, vendor wins.
4. Фиксирует reason.
5. Платформа исполняет финансовое решение.
6. Обе стороны получают уведомление.

**Target Expansion:**
- SLA dashboards;
- internal notes;
- repeatable decision playbooks;
- analytics по причинам споров и vendor quality.

**Alternative Paths:**
- спор закрывается до admin decision;
- нужны дополнительные доказательства;
- решение требует ручной financial reconciliation.

**Result:** money-sensitive конфликт закрывается под контролем платформы.

**Runtime Pressure:**
- `R1`: admin decision path и корректное финансовое исполнение решения.
- `R2`: partial refund logic, richer evidence review, queue management.
- `R3`: dispute operations maturity, reporting, policy-driven decisions.

---

## 5. Launch Scope Map

| Scope | Journeys |
|---|---|
| **Required for launch** | `V-1`, `V-2`, `V-3`, `B-1`, `B-2`, `B-3`, `B-4`, `B-5`, `A-1`, `A-2` |
| **Required, but can start manual or hosted** | `V-5`, `V-6` |
| **Target-first** | `V-4`, `B-6` |

---

## 6. Critical Runtime Paths

1. `Vendor onboarding -> admin approval`
   без этого не открывается supply side.
2. `Listing publish -> search visibility -> cart -> checkout`
   это основной buyer acquisition and conversion path.
3. `Checkout -> order creation -> escrow hold`
   здесь нельзя ломать money integrity и idempotency.
4. `Order progression -> completion/dispute -> payout release`
   это критический post-order trust and finance path.
5. `Dispute -> admin decision -> refund/release`
   здесь нужен самый жёсткий контроль состояния и денег.

На уровне staged execution это означает:

- `R1` должен довести до конца полный working launch loop.
- `R2` должен пройти ключевые альтернативные и негативные пути.
- `R3` должен приблизить runtime к полной operational depth полного design pack.
