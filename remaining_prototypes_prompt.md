# Prompt — Remaining Vendora Prototypes

Я строю B2B маркетплейс Vendora.

Задача: доделай оставшиеся interactive high-fidelity HTML prototypes в том же стиле, что уже существует в проекте.

Обязательно изучи перед работой:

1. `files/functional_requirements_standards.md`
2. `files/user_journey_standards.md`
3. `files/design_status.md`
4. `files/user_journeys.md`
5. `files/functional_requirements.md`
6. `files/access_matrix.md`
7. `files/state_machines.md`
8. `files/api_contracts.md`
9. `files/cut_register.md`
10. Существующие прототипы в: `files/prototypes/`

Особенно используй как style reference:

- `Vendora Checkout.html`
- `Vendora Vendor Dashboard.html`
- `Vendora Dispute Flow.html`
- `Vendora Vendor Listing Creation.html`
- `tweaks-panel.jsx`

Нужно создать 4 новых отдельных HTML-файла:

Файлы:

1. `Vendora Billing.html`
2. `Vendora Payouts.html`
3. `Vendora Admin KYC Review.html`
4. `Vendora Admin Dispute Resolution.html`

## Общие требования

- Язык интерфейса: русский.
- Стиль: modern B2B SaaS, clean, high-fidelity, адаптивно под mobile/desktop.
- Акцентный цвет по умолчанию: `#2455e8`.
- Используй тот же подход, что в существующих HTML-прототипах: React in single HTML, Tailwind CSS, один интерактивный компонент на flow.
- Переиспользуй `tweaks-panel.jsx`, не создавай новый несовместимый tweaks component.
- Каждый flow должен иметь несколько экранов/состояний и переключение внутри превью.
- Не делай marketing landing page. Делай рабочий product UI.
- Не ломай и не переписывай существующие прототипы.
- Не меняй runtime/backend код.
- В каждом прототипе явно показывай launch-safe interpretation и target interpretation, если flow по `cut_register` сейчас допускает hosted/manual fallback.
- Не утверждай, что hosted/manual процессы уже fully automated. Показывай честно: launch может быть manual/hosted, target может быть self-serve.

Нужно сохранить визуальную консистентность с уже готовыми прототипами Vendora: таблицы, карточки, статусы, sidebars, status badges, timelines, modals, drawers, empty/error/loading states.

---

## FLOW 1: V-5 Billing / Subscription

Файл: `Vendora Billing.html`

Смысл:
Vendor управляет тарифом, биллингом и лимитами. На launch допустим hosted Stripe billing portal, но UI должен показать vendor-facing billing state.

Экраны/состояния:

1. Billing overview
   - текущий тариф
   - статус подписки: active / trial / past_due / cancelled
   - monthly fee / commission rate
   - лимиты: listings, team seats, monthly GMV
   - next invoice date
   - CTA: “Открыть billing portal”

2. Plan comparison
   - Standard / Pro / Enterprise
   - комиссии, лимиты, features
   - текущий план выделен
   - upgrade/downgrade action
   - hosted redirect state

3. Invoice history
   - список invoice
   - paid / pending / failed
   - download invoice
   - retry payment for failed invoice

4. Payment method / hosted portal state
   - card on file
   - “redirecting to Stripe hosted portal”
   - safe fallback: contact support / manual billing

5. Limit warning state
   - plan limit reached
   - пример: достигнут лимит листингов или team seats
   - CTA upgrade / request Enterprise

Tweaks:

- accent color
- текущий план
- subscription status
- plan limit reached toggle
- monthly GMV

---

## FLOW 2: V-6 Payouts

Файл: `Vendora Payouts.html`

Смысл:
Vendor видит баланс, pending/releasable/paid out funds, payout provider state. На launch payout может идти через hosted/provider/admin-assisted flow, но UI должен показать vendor-facing money clarity.

Экраны/состояния:

1. Payout overview
   - balance summary:
     - held
     - frozen in disputes
     - releasable
     - paid out
     - failed/review
   - next payout estimate
   - provider connection status

2. Payout method setup
   - Stripe Connect / hosted provider onboarding state
   - bank account masked
   - verification pending / verified / action required
   - CTA: continue provider onboarding

3. Payout history
   - payout rows
   - paid / pending / failed / under review
   - payout id, date, amount, provider ref

4. Payout failure / review state
   - failed payout details
   - reason
   - admin review note
   - retry requested / contact support

5. Reconciliation detail
   - order funds -> releasable -> payout
   - simple ledger timeline
   - dispute/partial refund impact

Tweaks:

- accent color
- provider status
- payout failure toggle
- balance amounts
- show partial refund scenario

---

## FLOW 3: A-1 Admin KYC Review

Файл: `Vendora Admin KYC Review.html`

Смысл:
Admin/platform operator reviews vendor KYC applications. На launch может быть Retool/manual, но prototype должен показать target admin UI и launch-safe manual interpretation.

Экраны/состояния:

1. KYC queue
   - pending/rejected/approved tabs
   - risk badges
   - SLA age
   - search/filter by vendor, INN, category, country
   - queue table

2. Application detail
   - company profile
   - legal entity info
   - submitted documents
   - document status
   - audit trail
   - vendor owner info

3. Document viewer
   - preview placeholder
   - checksum/integrity indicator
   - admin-only access warning
   - audit event “document viewed”
   - approve/reject document

4. Review decision modal
   - approve
   - reject with reason
   - request more info
   - internal admin note
   - confirmation state

5. Post-decision state
   - vendor approved: selling unlocked
   - vendor rejected: selling blocked
   - request-more-info: vendor action required

Tweaks:

- accent color
- queue risk level
- application state
- strict mode for required docs
- show manual/Retool launch banner

---

## FLOW 4: A-2 Admin Dispute Resolution

Файл: `Vendora Admin Dispute Resolution.html`

Смысл:
Platform admin resolves disputes. Launch may be API/manual/Retool, but target admin UI should show dispute queue, evidence, money impact, decision.

Экраны/состояния:

1. Dispute queue
   - tabs: new, vendor responded, platform review, resolved
   - SLA timer
   - amount at risk
   - reason code
   - buyer/vendor columns
   - search/filter

2. Dispute detail
   - order summary
   - buyer claim
   - vendor response
   - evidence attachments
   - chat timeline
   - fund state: HELD / FROZEN_DISPUTE / RELEASABLE / RETURNED_TO_BUYER

3. Evidence viewer
   - image/file previews
   - metadata
   - uploaded by buyer/vendor
   - internal notes

4. Resolution modal
   - vendor favor release
   - buyer full refund
   - buyer partial refund
   - decision reason
   - amount input for partial refund
   - money impact preview

5. Resolution result
   - final dispute state
   - order state
   - fund state
   - refund/payout provider evidence placeholder
   - audit trail

Tweaks:

- accent color
- default resolution
- partial refund amount
- SLA breached toggle
- provider failure/review toggle

---

## Quality Bar

- Прототипы должны выглядеть как настоящая SaaS-продуктовая поверхность, не как wireframe.
- Все кнопки/табы/модалки должны быть интерактивны.
- Добавь realistic sample data.
- Добавь loading/disabled/success/error states там, где это важно.
- Mobile layout должен не ломаться.
- Не используй внешние картинки, если можно сделать аккуратные placeholders.
- Не используй эмодзи как основной UI. Можно использовать lucide-like inline icons or simple SVG symbols, если в существующих прототипах так принято.

## Expected Output

- Созданы 4 HTML-файла.
- Все открываются локально в браузере.
- Каждый содержит full interactive prototype.
- Визуально совпадает с существующей Vendora prototype system.
