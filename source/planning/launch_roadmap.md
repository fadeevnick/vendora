# Vendora — MVP Roadmap

Этот файл описывает только launch sequencing.

Он не означает, что runtime уже начался.
Он не заменяет `implementation_guide.md`.
Он не фиксирует фактический прогресс.

Его задача:

- зафиксировать, что именно считается launch;
- отделить `must for launch` от `manual acceptable at launch`;
- показать, что уходит в `post-launch`.

---

## 1. Launch Thesis

Vendora считается запущенной, если работает один честный core loop:

```text
vendor onboard -> listing publish -> buyer search -> checkout -> order progression -> dispute or completion -> payout
```

Если этот loop не проходит end-to-end, launch не считается закрытым.

---

## 2. Must For Launch

### Supply Side

- vendor registration and email verification
- vendor KYC submission
- admin approval/rejection path
- vendor listing creation and publish

### Demand Side

- buyer registration or agreed launch-compatible identity path
- catalog visibility
- basic search
- cart
- checkout

### Order And Money

- vendor-specific order creation
- payment success/failure handling
- escrow-like hold
- order state progression
- dispute opening
- admin dispute resolution path
- payout execution path

### Cross-Cutting

- transactional emails
- tenant isolation
- audit-sensitive logging for money/KYC/disputes

---

## 3. Manual Or Hosted Acceptable At Launch

Эти capability должны существовать, но не обязаны иметь polished dedicated product UI:

- KYC review может идти через простой admin surface или ops-assisted flow
- dispute resolution может быть manual-heavy
- payout initiation может идти через provider/admin ops path
- vendor plan assignment может идти через hosted billing или manual ops
- advanced notifications preferences не нужны
- richer shipment/tracking detail может быть минимальным

Правило:

```text
capability required
dedicated UX optional
```

---

## 4. Post-Launch

- team management
- public reviews and ratings
- social login depth
- 2FA / enterprise SSO
- dedicated search engine
- realtime dashboard updates
- full subscription automation and dunning
- bulk import
- promo codes
- vendor API platform and webhooks
- mobile app
- advanced analytics surfaces

---

## 5. Launch Sequence

### Slice 1. Identity And Gatekeeping

- buyer/vendor auth foundation
- vendor approval gate
- admin access path

Outcome:

- trusted actors can enter the system with correct boundaries.

### Slice 2. Supply Creation

- vendor listing creation
- publish/unpublish
- buyer-visible catalog

Outcome:

- approved vendor can create something sellable.

### Slice 3. Demand And Conversion

- search
- cart
- checkout
- payment hold

Outcome:

- buyer can find and pay for a vendor offer.

### Slice 4. Post-Checkout Fulfillment

- vendor order handling
- buyer order visibility
- completion path

Outcome:

- paid order can move toward successful completion.

### Slice 5. Trust And Recovery

- dispute open
- admin resolution
- refund/release logic

Outcome:

- failure path is controlled, not improvised.

### Slice 6. Vendor Money Return

- releasable balance
- payout execution path
- payout notification

Outcome:

- vendor actually gets paid after a successful order.

---

## 6. Launch Exit Criteria

Vendora launch slice считается собранным, когда:

1. approved vendor can publish a listing;
2. buyer can discover and buy it;
3. platform can hold funds correctly;
4. order can either complete or enter dispute;
5. platform can resolve the dispute path;
6. vendor can receive payout through the agreed launch path.

---

## 7. Roadmap Guardrails

- не добавлять target capabilities в launch только потому, что они уже спроектированы;
- не считать hosted/manual fallback “грязным хакающим исключением”, если он честно зафиксирован;
- не смешивать roadmap with implementation fact;
- все runtime claims потом должны подтверждаться в `tracking/implementation_status.md`, а не здесь.
