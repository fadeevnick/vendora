# Vendora — API Contracts

Этот артефакт фиксирует launch-first API surface до старта formal runtime.

Его задача:

- превратить journeys, FR и state machines в конкретные backend contracts;
- явно связать endpoint с actor boundary;
- не дать `R1` silently расползтись в target-only API surface.

Основные зависимости:

- `access_matrix.md`
- `state_machines.md`
- `../design/functional_requirements.md`

---

## 1. Contract Rules

1. Default transport: JSON over HTTPS.
2. Every response returns either `data` or `error`.
3. Money is always sent in minor units:
   - `amountMinor`
   - `currency`
4. Timestamps use ISO-8601 UTC.
5. Backend authorization is authoritative; UI visibility means nothing without server-side checks.
6. State-changing endpoints must validate allowed transitions from `state_machines.md`.
7. Money-sensitive or duplicate-prone mutations require `Idempotency-Key`.

### 1.1 Success Envelope

```json
{
  "data": {},
  "meta": {}
}
```

### 1.2 Error Envelope

```json
{
  "error": {
    "code": "ORDER_INVALID_STATE",
    "message": "Order cannot be confirmed from DELIVERED",
    "details": {
      "currentState": "DELIVERED"
    },
    "retryable": false
  }
}
```

### 1.3 Common Error Codes

- `AUTH_REQUIRED`
- `EMAIL_NOT_VERIFIED`
- `FORBIDDEN`
- `TENANT_SCOPE_REQUIRED`
- `RESOURCE_NOT_FOUND`
- `VALIDATION_ERROR`
- `IDEMPOTENCY_CONFLICT`
- `ORDER_INVALID_STATE`
- `KYC_INVALID_STATE`
- `DISPUTE_INVALID_STATE`
- `STOCK_RESERVATION_INVALID_STATE`
- `PAYMENT_PROVIDER_ERROR`

---

## 2. Launch Contract Surface

| Domain | Endpoint | Access | Feeds | Runtime |
|---|---|---|---|---|
| Auth | `POST /api/auth/register` | `public` | `FR-AUTH-001`, `FR-AUTH-003` | `R1` |
| Auth | `POST /api/auth/login` | `public` | `FR-AUTH-001`, `FR-AUTH-004` | `R1` |
| Auth | `POST /api/auth/verify-email` | `public` | `FR-AUTH-003` | `R1` |
| Auth | `POST /api/admin/auth/login` | `public` | `FR-AUTH-007` | `R1` |
| Auth | `GET /api/auth/session` | `self` | `FR-SEC-004` | `R1` |
| KYC | `GET /api/vendor/application` | `owner` | `FR-KYC-001`, `FR-KYC-005` | `R1` |
| KYC | `PUT /api/vendor/application` | `owner` | `FR-KYC-001` | `R1` |
| KYC | `POST /api/vendor/application/documents/presign` | `owner` | `FR-KYC-002`, `FR-KYC-003` | `R1` |
| KYC | `POST /api/vendor/application/documents/{documentId}/upload` | `owner` | `FR-KYC-002`, `FR-KYC-003` | `H1` |
| KYC | `POST /api/vendor/application/documents/{documentId}/complete` | `owner` | `FR-KYC-002`, `FR-KYC-003` | `R1` |
| KYC | `POST /api/vendor/application/submit` | `owner` | `FR-KYC-005` | `R1` |
| Admin KYC | `GET /api/admin/kyc/applications` | `admin` | `FR-KYC-006`, `FR-SEC-006` | `R1` |
| Admin KYC | `GET /api/admin/kyc/applications/{applicationId}` | `admin` | `FR-KYC-006`, `FR-SEC-006` | `R1` |
| Admin KYC | `GET /api/admin/kyc/documents/{documentId}/content` | `admin` | `FR-KYC-006`, `FR-SEC-006` | `H1` |
| Admin KYC | `POST /api/admin/kyc/applications/{applicationId}/approve` | `admin` | `FR-KYC-006`, `FR-KYC-007` | `R1` |
| Admin KYC | `POST /api/admin/kyc/applications/{applicationId}/reject` | `admin` | `FR-KYC-006`, `FR-KYC-007` | `R1` |
| Catalog | `GET /api/vendor/listings` | `tenant-read` | `FR-CAT-001` | `R1` |
| Catalog | `POST /api/vendor/listings` | `tenant` | `FR-CAT-001` | `R1` |
| Catalog | `PATCH /api/vendor/listings/{listingId}` | `tenant` | `FR-CAT-001` | `R1` |
| Catalog | `POST /api/vendor/listings/{listingId}/publish` | `owner` | `FR-CAT-006`, `FR-CAT-008` | `R1` |
| Catalog | `POST /api/vendor/listings/{listingId}/unpublish` | `owner` | `FR-CAT-008` | `R1` |
| Search | `GET /api/catalog/products` | `public` | `FR-SEARCH-001`, `FR-SEARCH-003`, `FR-SEARCH-004` | `R1` |
| Search | `GET /api/catalog/products/{productId}` | `public` | `FR-CAT-009`, `FR-PERF-002` | `R1` |
| Cart | `GET /api/cart` | `self` | `FR-CART-001`, `FR-CART-002` | `R1` |
| Cart | `POST /api/cart/items` | `self` | `FR-CART-001`, `FR-CART-002` | `R1` |
| Cart | `PATCH /api/cart/items/{itemId}` | `self` | `FR-CART-004` | `R1` |
| Cart | `DELETE /api/cart/items/{itemId}` | `self` | `FR-CART-001` | `R1` |
| Checkout | `POST /api/checkout/sessions` | `self` | `FR-CART-004`, `FR-CHECKOUT-002` | `R1` |
| Checkout | `GET /api/checkout/sessions/{sessionId}` | `self` | `FR-CHECKOUT-001`, `FR-CHECKOUT-004` | `R1` |
| Payments | `POST /api/payments/provider/webhook` | signed provider | `FR-CHECKOUT-001`, `FR-CHECKOUT-003` | `R1` |
| Buyer Orders | `GET /api/buyer/orders` | `self` | `FR-ORDER-005` | `R1` |
| Buyer Orders | `GET /api/buyer/orders/{orderId}` | `self` | `FR-ORDER-*` | `R1` |
| Buyer Orders | `POST /api/buyer/orders/{orderId}/mark-delivered` | `self` | `FR-ORDER-*` | `H2` |
| Buyer Orders | `POST /api/buyer/orders/{orderId}/confirm-receipt` | `self` | `FR-ESC-003` | `R1` |
| Buyer Orders | `POST /api/buyer/orders/{orderId}/disputes` | `self` | `FR-ORDER-005`, `FR-DISP-001` | `R1` |
| Vendor Orders | `GET /api/vendor/orders` | `tenant-read` | `FR-ORDER-001` | `R1` |
| Vendor Orders | `GET /api/vendor/orders/{orderId}` | `tenant-read` | `FR-ORDER-*` | `R1` |
| Vendor Orders | `POST /api/vendor/orders/{orderId}/confirm` | `tenant` | `FR-ORDER-002` | `R1` |
| Vendor Orders | `POST /api/vendor/orders/{orderId}/cancel` | `tenant` | `FR-ORDER-002`, `FR-ORDER-007` | `R1` |
| Vendor Orders | `POST /api/vendor/orders/{orderId}/ship` | `tenant` | `FR-ORDER-002` | `R1` |
| Disputes | `POST /api/vendor/disputes/{disputeId}/respond` | `tenant` | `FR-DISP-002`, `FR-DISP-004` | `R1` |
| Admin Disputes | `GET /api/admin/disputes` | `admin` | `FR-DISP-005` | `R1` |
| Admin Disputes | `GET /api/admin/disputes/{disputeId}` | `admin` | `FR-DISP-005` | `R1` |
| Admin Disputes | `POST /api/admin/disputes/{disputeId}/resolve` | `admin` | `FR-DISP-005`, `FR-DISP-006` | `R1` |
| Vendor Money | `GET /api/vendor/balance` | `tenant-read` | `FR-ESC-002`, `FR-PAY-002` | `R1` |
| Admin Ops | `GET /api/admin/ops/summary` | `admin` | `FR-NOTIF-*`, `FR-ORDER-*`, `FR-PAY-*` | `H2` |
| Admin Ops | `GET /api/admin/ops/workers` | `admin` | `FR-NOTIF-*`, `FR-ORDER-*`, `FR-PAY-*` | `H2` |
| Admin Ops | `GET /api/admin/ops/queues` | `admin` | `FR-NOTIF-*`, `FR-ORDER-*`, `FR-PAY-*`, `FR-DISP-*` | `H2` |
| Admin Ops | `GET /api/admin/ops/notifications` | `admin` | `FR-NOTIF-*` | `H2` |
| Admin Ops | `POST /api/admin/ops/notifications/{notificationId}/retry` | `admin` | `FR-NOTIF-*` | `H2` |
| Admin Ops | `POST /api/admin/ops/order-maintenance/run` | `admin` | `FR-ORDER-*`, `FR-PAY-*` | `H2` |
| Admin Ops | `GET /api/admin/ops/money/reconciliation` | `admin` | `FR-PAY-*`, `FR-DISP-*` | `H2` |
| Admin Ops | `GET /api/admin/ops/money/failures` | `admin` | `FR-PAY-*`, `FR-DISP-*` | `H2` |
| Admin Ops | `GET /api/admin/ops/return-inspections` | `admin` | `FR-DISP-*`, `FR-ORDER-*` | `H2` |
| Admin Ops | `POST /api/admin/ops/return-inspections/{disputeId}/complete` | `admin` | `FR-DISP-*`, `FR-ORDER-*` | `H2` |

---

## 3. Identity Contracts

### `POST /api/auth/register`

- Access: `public`
- Runtime: `R1`
- Purpose: create `BUYER` or `VENDOR_OWNER` identity before email verification.

Request:

```json
{
  "accountType": "BUYER",
  "email": "buyer@example.com",
  "password": "StrongPass1"
}
```

Vendor owner uses the same endpoint with `"accountType": "VENDOR_OWNER"`.

Response:

```json
{
  "data": {
    "userId": "usr_123",
    "emailVerificationRequired": true
  }
}
```

Key rules:

- email must be unique;
- password must satisfy `FR-AUTH-001`;
- no session becomes fully active until email is verified.

### `POST /api/auth/login`

- Access: `public`
- Runtime: `R1`

Request:

```json
{
  "email": "buyer@example.com",
  "password": "StrongPass1"
}
```

Response:

```json
{
  "data": {
    "sessionId": "sess_123",
    "user": {
      "id": "usr_123",
      "actorType": "BUYER",
      "emailVerified": true
    }
  }
}
```

Rules:

- repeated failures trigger `FR-AUTH-004`;
- unverified email may authenticate only into limited pre-verification state or return `EMAIL_NOT_VERIFIED`.

### `POST /api/auth/verify-email`

- Access: `public`
- Runtime: `R1`

Request:

```json
{
  "token": "email-verification-token"
}
```

Effect:

- marks email verified;
- allows full buyer/vendor session use.

### `POST /api/admin/auth/login`

- Access: `public`
- Runtime: `R1`
- Separate privileged path per `FR-AUTH-007`.

### `GET /api/auth/session`

- Access: `self`
- Runtime: `R1`

Returns:

- current user identity;
- actor type;
- vendor membership if present;
- vendor KYC status if relevant;
- allowed top-level capabilities for current session.

---

## 4. Vendor Onboarding And KYC Contracts

### `GET /api/vendor/application`

- Access: `owner`
- Runtime: `R1`
- Reads current vendor onboarding draft or active application.

Response fields:

- `status`: `DRAFT | PENDING_REVIEW | APPROVED | REJECTED`
- `businessProfile`
- `documents[]`
- `rejectionReason`

### `PUT /api/vendor/application`

- Access: `owner`
- Runtime: `R1`
- Allowed only from `DRAFT` or `REJECTED`.

Request:

```json
{
  "businessName": "Acme Supply",
  "legalEntityName": "Acme Supply LLC",
  "taxId": "123456789",
  "country": "US",
  "address": {
    "line1": "1 Main St",
    "city": "Austin",
    "postalCode": "78701"
  },
  "salesCategory": "industrial-parts"
}
```

Invalid state example:

- `PENDING_REVIEW` draft mutation without admin reset returns `KYC_INVALID_STATE`.

### `POST /api/vendor/application/documents/presign`

- Access: `owner`
- Runtime: `R1`
- Creates admin-only protected upload slot.

Request:

```json
{
  "documentType": "REGISTRATION_CERTIFICATE",
  "fileName": "cert.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 1048576
}
```

Response:

```json
{
  "data": {
    "documentId": "doc_123",
    "uploadUrl": "https://storage.example/presigned",
    "expiresAt": "2026-05-07T12:00:00Z"
  }
}
```

### `POST /api/vendor/application/documents/{documentId}/complete`

- Access: `owner`
- Runtime: `R1`
- Commits uploaded document metadata after successful object upload.

Rules:

- raw file remains unreadable to vendor after upload;
- every later admin document read must be auditable.

### `POST /api/vendor/application/documents/{documentId}/upload`

- Access: `owner`
- Runtime: `H1`
- Stores raw KYC bytes in protected private storage for the existing document slot.

Request:

```json
{
  "contentBase64": "JVBERi0xLjQK..."
}
```

Rules:

- uploaded byte size must match the declared `sizeBytes`;
- vendor application reads still do not expose `storageKey` or raw content;
- local/private storage evidence is not the same as hosted S3/private-bucket launch proof.

### `GET /api/admin/kyc/documents/{documentId}/content`

- Access: `admin`
- Runtime: `H1`
- Reads raw KYC bytes through the protected API path.

Rules:

- non-admin actors are denied;
- response includes integrity evidence (`contentSha256`);
- every successful read writes `KYC_DOCUMENT_OBJECT_READ` audit evidence.

### `POST /api/vendor/application/submit`

- Access: `owner`
- Runtime: `R1`
- State transition: `DRAFT -> PENDING_REVIEW`

Headers:

- `Idempotency-Key`

Request:

```json
{
  "confirmAccurateInformation": true
}
```

Response:

```json
{
  "data": {
    "applicationId": "app_123",
    "status": "PENDING_REVIEW"
  }
}
```

### `GET /api/admin/kyc/applications`

- Access: `admin`
- Runtime: `R1`

Supported filters:

- `status=PENDING_REVIEW|REJECTED|APPROVED`
- `country`
- `createdBefore`

### `GET /api/admin/kyc/applications/{applicationId}`

- Access: `admin`
- Runtime: `R1`

Returns:

- business profile;
- document metadata;
- admin-safe download handles or presigned read links;
- previous review decisions.

### `POST /api/admin/kyc/applications/{applicationId}/approve`

- Access: `admin`
- Runtime: `R1`
- State transition: `PENDING_REVIEW -> APPROVED`

Request:

```json
{
  "note": "Basic documents verified"
}
```

Key effects:

- vendor selling access opens;
- notification is queued to vendor.

### `POST /api/admin/kyc/applications/{applicationId}/reject`

- Access: `admin`
- Runtime: `R1`
- State transition: `PENDING_REVIEW -> REJECTED`

Request:

```json
{
  "reasonCode": "DOCUMENT_MISMATCH",
  "message": "Registration certificate is unreadable"
}
```

---

## 5. Listing, Catalog And Search Contracts

### `GET /api/vendor/listings`

- Access: `tenant-read`
- Runtime: `R1`
- Launch may narrow effective mutation rights to owner-only while still allowing tenant-scoped reads later.

### `POST /api/vendor/listings`

- Access: `tenant`
- Runtime: `R1`
- Allowed only for `APPROVED` vendors.

Request:

```json
{
  "title": "Hydraulic Pump",
  "description": "Industrial pump",
  "category": "industrial-parts",
  "priceMinor": 129900,
  "currency": "USD",
  "stockQty": 12,
  "media": [
    {
      "assetId": "asset_123"
    }
  ]
}
```

Response includes:

- `listingId`
- `status: DRAFT`

### `PATCH /api/vendor/listings/{listingId}`

- Access: `tenant`
- Runtime: `R1`
- Allowed from draft-like state only.

### `POST /api/vendor/listings/{listingId}/publish`

- Access: `owner`
- Runtime: `R1`

Rules:

- vendor must remain `APPROVED`;
- required fields must be present;
- resulting listing becomes eligible for public catalog and search indexing.

### `POST /api/vendor/listings/{listingId}/unpublish`

- Access: `owner`
- Runtime: `R1`

Used for:

- vendor-side removal;
- admin/block-driven public visibility removal.

### `GET /api/catalog/products`

- Access: `public`
- Runtime: `R1`

Query params:

- `q`
- `category`
- `vendorId`
- `inStock=true`
- `page`
- `pageSize`

Rules:

- only public listings from eligible vendors appear;
- blocked vendor listings must disappear automatically.

### `GET /api/catalog/products/{productId}`

- Access: `public`
- Runtime: `R1`

Returns:

- public title/description;
- price;
- availability;
- public vendor summary.

---

## 6. Cart, Checkout And Payment Contracts

### `GET /api/cart`

- Access: `self`
- Runtime: `R1`

Returns:

- items grouped by vendor;
- subtotal per vendor;
- overall total;
- cart version for optimistic revalidation.

### `POST /api/cart/items`

- Access: `self`
- Runtime: `R1`

Request:

```json
{
  "listingId": "lst_123",
  "quantity": 2
}
```

### `PATCH /api/cart/items/{itemId}`

- Access: `self`
- Runtime: `R1`

Request:

```json
{
  "quantity": 3
}
```

Must revalidate:

- latest price;
- latest stock;
- listing public eligibility.

### `DELETE /api/cart/items/{itemId}`

- Access: `self`
- Runtime: `R1`

### `POST /api/checkout/sessions`

- Access: `self`
- Runtime: `R1`
- Purpose: validate cart and create provider payment session, but not final vendor orders yet.

Headers:

- `Idempotency-Key`

Request:

```json
{
  "cartVersion": 7,
  "shippingAddress": {
    "fullName": "Alice Buyer",
    "line1": "10 Market St",
    "city": "Austin",
    "postalCode": "78701",
    "country": "US"
  },
  "returnUrl": "https://app.example/checkout/success",
  "cancelUrl": "https://app.example/cart"
}
```

Response:

```json
{
  "data": {
    "checkoutSessionId": "chk_123",
    "paymentProvider": "stripe",
    "providerSessionSecret": "secret_or_url",
    "status": "AWAITING_PAYMENT",
    "expiresAt": "2026-05-08T21:00:00.000Z"
  }
}
```

Rules:

- re-check price and available stock before session creation;
- local H1 hardening now reserves stock at checkout-session creation by decrementing available `Product.stock` and creating `StockReservation` evidence;
- checkout sessions carry an expiry timestamp; the local `checkout:expire` operator command releases abandoned reserved stock and marks sessions `EXPIRED`;
- if validation changes cart totals, return `VALIDATION_ERROR` with updated totals;
- repeated request with same idempotency key must return the same session result.

### `GET /api/checkout/sessions/{sessionId}`

- Access: `self`
- Runtime: `R1`

Returns:

- `AWAITING_PAYMENT`
- `SUCCEEDED`
- `FAILED`
- `EXPIRED`
- if succeeded, created buyer-visible order ids.

### `POST /api/payments/provider/webhook`

- Access: signed provider
- Runtime: `R1`
- System endpoint, not human-facing.
- Current local implementation parses this through `PAYMENT_PROVIDER=dev_mock`; live provider signature/session evidence remains H1 hardening work.
- Current local stock behavior commits checkout stock reservations on payment success and releases them on payment failure; webhook replay must leave orders, reservations and available stock unchanged.

On payment success it must:

1. finalize provider payment event once;
2. create vendor-specific orders atomically;
3. create escrow hold records;
4. commit checkout stock reservations;
5. emit confirmation notifications;
6. leave no duplicate orders on webhook replay.

Failure behavior:

- invalid signature -> `FORBIDDEN`
- duplicate provider event -> idempotent no-op
- local payment failure -> checkout `FAILED` and reserved stock released once
- late provider event after local expiry -> idempotent no-op without order creation or stock mutation

---

## 7. Order Contracts

### `GET /api/buyer/orders`

- Access: `self`
- Runtime: `R1`

Returns only buyer-owned orders with:

- order number;
- current state;
- vendor summary;
- total;
- created at.

### `GET /api/buyer/orders/{orderId}`

- Access: `self`
- Runtime: `R1`; `H2` local proof adds order timeline

Must never leak another buyer's order.

Current local detail response includes a chronological `timeline` array derived from durable order `AuditEvent` rows plus a synthetic `ORDER_PAYMENT_HELD` order-created event:

```json
{
  "timeline": [
    {
      "code": "ORDER_PAYMENT_HELD",
      "label": "Payment authorized and vendor order created",
      "status": "PAYMENT_HELD",
      "actor": "system",
      "actorUserId": null,
      "happenedAt": "2026-05-09T00:00:00.000Z",
      "metadata": {}
    }
  ]
}
```

### `POST /api/buyer/orders/{orderId}/confirm-receipt`

- Access: `self`
- Runtime: `R1`
- State transition: `DELIVERED -> COMPLETED`
- Compatibility: current local implementation still accepts the legacy R1 shortcut `SHIPPED -> COMPLETED`.

Headers:

- `Idempotency-Key`

### `POST /api/buyer/orders/{orderId}/mark-delivered`

- Access: `self`
- Runtime: `H2` local proof
- State transition: `SHIPPED -> DELIVERED`

Effect:

- records `deliveredAt`;
- keeps order funds `HELD` until receipt confirmation;
- writes order audit evidence and vendor notification outbox evidence.

### Operator Command: `npm run orders:auto-complete-delivered`

- Access: trusted operator/runtime process
- Runtime: `H2` local/operator proof
- State transition: old `DELIVERED -> COMPLETED`

Effect:

- selects delivered orders older than the configured threshold while funds are still `HELD`;
- moves funds to `RELEASABLE`;
- writes `ORDER_AUTO_COMPLETED_DELIVERY_TIMEOUT` audit evidence;
- enqueues buyer and vendor notification outbox records;
- is replay-safe for already completed/released orders.

### Operator Command: `npm run orders:auto-cancel-unconfirmed`

- Access: trusted operator/runtime process
- Runtime: `H2` local/operator proof
- State transition: old `PAYMENT_HELD -> CANCELLED`

Effect:

- selects payment-held orders older than the configured threshold while funds are still `HELD`;
- moves funds to `RETURNED_TO_BUYER`;
- restores ordered product stock for pre-shipment cancellation;
- writes `ORDER_AUTO_CANCELLED_CONFIRMATION_TIMEOUT` audit evidence;
- enqueues buyer and vendor notification outbox records;
- blocks late vendor confirmation through normal order-state validation;
- is replay-safe for already cancelled/returned orders.

### Operator Command: `npm run orders:run-maintenance`

- Access: trusted operator/runtime process
- Runtime: `H2` local/operator proof

Effect:

- runs abandoned checkout expiry;
- runs vendor confirmation timeout auto-cancel;
- runs buyer delivery timeout auto-complete;
- returns a grouped JSON summary for each job;
- is replay-safe when no due rows remain.

### `POST /api/buyer/orders/{orderId}/disputes`

- Access: `self`
- Runtime: `R1`
- State transition: `DELIVERED -> DISPUTED`
- Compatibility: current local implementation still allows `SHIPPED` and `COMPLETED` dispute-open states used by the R1 replay.

Headers:

- `Idempotency-Key`

Request:

```json
{
  "reasonCode": "DAMAGED_ITEM",
  "description": "Received damaged product",
  "evidenceIds": [
    "evi_123"
  ]
}
```

Rules:

- allowed only inside explicit dispute-open window;
- must freeze disputed amount immediately.

### `GET /api/vendor/orders`

- Access: `tenant-read`
- Runtime: `R1`

Filters:

- `state`
- `createdAfter`

### `GET /api/vendor/orders/{orderId}`

- Access: `tenant-read`
- Runtime: `R1`; `H2` local proof adds order timeline

Must never leak another vendor tenant order.

Current local detail response includes the same `timeline` shape as buyer order detail, scoped by vendor tenant access.

### `POST /api/vendor/orders/{orderId}/confirm`

- Access: `tenant`
- Runtime: `R1`
- State transition: `PAYMENT_HELD -> CONFIRMED`

### `POST /api/vendor/orders/{orderId}/cancel`

- Access: `tenant`
- Runtime: `R1`
- State transition: `PAYMENT_HELD -> CANCELLED`

Request:

```json
{
  "reason": "OUT_OF_STOCK"
}
```

Effect:

- Current local implementation records `REFUND_PROVIDER=dev_mock` execution evidence for buyer-favor full refunds; live provider refund evidence remains H1 hardening work.

### `POST /api/vendor/orders/{orderId}/ship`

- Access: `tenant`
- Runtime: `R1`
- State transition: `CONFIRMED -> SHIPPED`

Optional request body:

```json
{
  "carrier": "DHL",
  "trackingNumber": "TRACK123",
  "metadata": {
    "serviceLevel": "standard"
  }
}
```

Current local H2 behavior:

- carrier/tracking/metadata stay optional;
- when provided, they are stored on the order with `shippedAt`;
- `runtime:h2-fulfillment` proves shipment metadata capture and the `SHIPPED -> DELIVERED -> COMPLETED` path.

---

## 8. Dispute And Resolution Contracts

### `POST /api/vendor/disputes/{disputeId}/respond`

- Access: `tenant`
- Runtime: `R1`
- Allowed only in `VENDOR_RESPONSE`.

Request:

```json
{
  "message": "We can replace the item",
  "proposedOutcome": "REPLACE"
}
```

Launch note:

- `proposedOutcome` is advisory in `R1`;
- buyer-acceptance agreement flow is target/R2 expansion.

### `GET /api/admin/disputes`

- Access: `admin`
- Runtime: `R1`

Filters:

- `state`
- `vendorId`
- `openedBefore`

### `GET /api/admin/disputes/{disputeId}`

- Access: `admin`
- Runtime: `R1`

Returns:

- order summary;
- dispute thread;
- evidence metadata;
- payout hold context;
- prior vendor response.

### `POST /api/admin/disputes/{disputeId}/resolve`

- Access: `admin`
- Runtime: `R1`
- Allowed only in `PLATFORM_REVIEW`.

Headers:

- `Idempotency-Key`

Request:

```json
{
  "resolutionType": "BUYER_FAVOR_PARTIAL_REFUND",
  "refundAmountMinor": 900
}
```

`R1` allowed resolutions:

- `BUYER_FAVOR_FULL_REFUND`
- `BUYER_FAVOR_PARTIAL_REFUND`
- `VENDOR_FAVOR_RELEASE`

Effects:

- execute refund or funds release;
- partial refund executes only the requested refund amount and releases the vendor remainder;
- buyer-favor refund after shipment does not automatically restock product inventory; current local policy records `stockPolicy=NO_AUTO_RESTOCK_AFTER_SHIPMENT`, `restockedQuantity=0` and `returnInspectionRequired=true` in dispute-resolution audit/notification metadata;
- close dispute;
- notify both parties;
- write durable audit event.

---

## 9. Vendor Balance Contract

### `GET /api/vendor/balance`

- Access: `tenant-read`
- Runtime: `R1`

Returns:

```json
{
  "data": {
    "currency": "USD",
    "heldAmountMinor": 120000,
    "releasableAmountMinor": 450000,
    "frozenDisputeAmountMinor": 30000,
    "lastUpdatedAt": "2026-05-07T12:00:00Z"
  }
}
```

Launch note:

- Current local implementation records `PAYOUT_PROVIDER=dev_mock` execution evidence and moves paid funds to `PAID_OUT`; live provider payout/reconciliation evidence remains H1 hardening work.
- Current local reconciliation command persists run/item evidence over payment events, refund executions and payout executions; live provider dashboard/API reconciliation remains H1 hardening work.
- payout execution itself may remain hosted/manual in `R1`;
- dedicated payout mutation APIs should wait until `R2`, when payout batching and failure recovery are productized.

### Operational Money Reconciliation Command

- Access: internal/operator command
- Runtime: `H1` local/internal proof
- Current command: `npm run money:reconcile --workspace apps/api`

Checks:

- processed payment provider events align with checkout session outcomes and created orders;
- refund provider executions align with buyer-favor dispute outcomes, returned funds and refunded ledger entries;
- payout provider executions align with paid-out fund state and paid-out ledger entries.
- late provider events after an expired checkout session with no orders are treated as matched safe no-op evidence.

Launch note:

- `npm run runtime:h1-money-reconciliation --workspace apps/api` proves local reconciliation over local `dev_mock` artifacts only;
- live provider/dashboard/API reconciliation evidence is still required before claiming launch-grade external money reconciliation.

### `GET /api/admin/money/provider-failures`

- Access: `admin`
- Runtime: `H1` local/internal proof

Returns failed local/provider money executions requiring operator attention:

- failed refund provider executions with dispute/order/fund context;
- failed payout provider executions with vendor/order-fund context.

Current local behavior:

- failed refund execution leaves the dispute in `PLATFORM_REVIEW` and fund in `FROZEN_DISPUTE`;
- failed payout execution moves fund to `PAYOUT_FAILED_REVIEW` and does not create a paid-out ledger entry;
- partial refund leaves only the vendor remainder eligible for payout;
- reconciliation treats these controlled failures as matched operational evidence.

Launch note:

- this is an API-first operator visibility/remediation surface, not a polished admin UI;
- live provider dashboard/API failure evidence remains separate launch-grade proof.

### Admin Money Provider Remediation

- Access: `admin`
- Runtime: `H1` local/internal proof

Endpoints:

- `POST /api/admin/money/refund-failures/{executionId}/retry`
- `POST /api/admin/money/payout-failures/{executionId}/retry`
- `POST /api/admin/money/refund-failures/{executionId}/mark-reviewed`
- `POST /api/admin/money/payout-failures/{executionId}/mark-reviewed`

Rules:

- retry is allowed only for failed provider executions;
- refund retry can complete the dispute/order/fund path when funds are still frozen for review;
- payout retry can move `PAYOUT_FAILED_REVIEW` funds to `PAID_OUT`;
- mark-reviewed records operator note, actor and time without pretending provider execution succeeded;
- all remediation actions write audit evidence.

### `GET /api/admin/ops/summary`

- Access: `admin`
- Runtime: `H2` local/backend-ops proof

Returns dashboard source data for:

- notification outbox counts by status and oldest pending notification;
- money provider failure counts, split by refund/payout and reviewed/unreviewed;
- latest money reconciliation run summary;
- order maintenance backlog counts for checkout expiry, vendor confirmation timeout and delivery timeout jobs.

### `GET /api/admin/ops/workers`

- Access: `admin`
- Runtime: `H2` local/backend-ops proof

Returns a DB/config snapshot for:

- notification worker provider/default limit/default max attempts/default interval;
- notification worker durable heartbeat status, latest heartbeat and recent instances;
- notification queue pending/failed/sent/suppressed counts and oldest pending/failed rows;
- order maintenance worker default limit/default timeout thresholds/default interval;
- order maintenance worker durable heartbeat status, latest heartbeat and recent instances;
- order maintenance backlog for checkout expiry, vendor confirmation timeout and delivery timeout jobs;
- latest audit-backed ops activity.

Current limitation:

- local worker entrypoints write durable heartbeat rows with `RUNNING`, `STOPPED` or `ERROR`;
- old `RUNNING` rows are surfaced as `STALE`;
- this proves local/runtime worker liveness state in the current DB, not hosted/deployed worker execution.

### `GET /api/admin/ops/queues`

- Access: `admin`
- Runtime: `H2` local/backend-ops proof

Returns read-only queue/actionable backlog counts for:

- notification outbox;
- order maintenance due jobs;
- return inspections;
- unreviewed money failures.

### `GET /api/admin/ops/notifications`

- Access: `admin`
- Runtime: `H2` local/backend-ops proof

Query filters:

- `status`
- `eventType`
- `referenceId`
- `limit`

Returns notification outbox rows suitable for operator review.

### `POST /api/admin/ops/notifications/{notificationId}/retry`

- Access: `admin`
- Runtime: `H2` local/backend-ops proof

Rules:

- allowed only for `FAILED` notification outbox rows;
- resets row to `PENDING`, clears provider/error evidence and resets attempts so the worker can retry;
- writes `NOTIFICATION_OUTBOX_RETRY_REQUESTED` audit evidence with the admin actor.

### `POST /api/admin/ops/order-maintenance/run`

- Access: `admin`
- Runtime: `H2` local/backend-ops proof

Request:

```json
{
  "dryRun": true,
  "limit": 50,
  "confirmationOlderThanHours": 48,
  "deliveryOlderThanHours": 72
}
```

Rules:

- defaults to `dryRun: true`;
- dry-run returns checkout expiry, vendor confirmation timeout and delivery timeout backlog without mutating runtime state;
- execute mode runs the same shared order maintenance service as the CLI/worker path;
- execute mode writes `ADMIN_ORDER_MAINTENANCE_RUN` audit evidence with actor, backlog-before and job result;
- repeated execute calls are replay-safe for already processed rows.

### `GET /api/admin/ops/money/reconciliation`

- Access: `admin`
- Runtime: `H2` local/backend-ops proof

Query filters:

- `status`: `SUCCEEDED` or `FAILED`
- `itemStatus`: `MATCHED` or `MISMATCHED`
- `itemType`: `PAYMENT_EVENT`, `REFUND_EXECUTION` or `PAYOUT_EXECUTION`
- `limit`

Returns recent reconciliation runs with checked payment/refund/payout counts, mismatch counts, timestamps and filtered reconciliation items for operator review.

### `GET /api/admin/ops/money/failures`

- Access: `admin`
- Runtime: `H2` local/backend-ops proof

Query filters:

- `type`: `ALL`, `REFUND` or `PAYOUT`
- `reviewed`: `ALL`, `REVIEWED` or `UNREVIEWED`
- `limit`

Returns normalized failed refund and payout provider executions with linked dispute/order/fund/vendor context, provider error, review evidence and totals for admin operations.

### `GET /api/admin/ops/return-inspections`

- Access: `admin`
- Runtime: `H2` local/backend-ops proof

Returns shipped buyer-favor refund disputes whose resolution metadata requires return inspection before inventory can be restocked.

Rows include:

- dispute/order/vendor/buyer identifiers;
- refund amount and resolution metadata;
- order items with product IDs, quantities and current product stock;
- any existing `RETURN_INSPECTION_COMPLETED` audit evidence.

### `POST /api/admin/ops/return-inspections/{disputeId}/complete`

- Access: `admin`
- Runtime: `H2` local/backend-ops proof

Request:

```json
{
  "outcome": "RESTOCK",
  "note": "Returned items inspected and accepted"
}
```

Rules:

- allowed outcomes are `RESTOCK` and `DO_NOT_RESTOCK`;
- dispute must have return-inspection-required resolution metadata;
- completion is one-time only; duplicate completion is rejected;
- `RESTOCK` increments product stock by the original order item quantities;
- `DO_NOT_RESTOCK` records the inspection decision without changing stock;
- writes `RETURN_INSPECTION_COMPLETED` audit evidence with the admin actor, outcome, note and per-item stock effects.

---

## 10. Target And R2/R3 Expansion

These contracts are intentionally deferred:

- guest-checkout account linking and cart merge
- `REQUEST_MORE_INFO` KYC loop
- social login and 2FA APIs
- team management APIs
- richer shipping metadata and auto-complete timers
- partial refund decision helpers
- payout execution and payout failure recovery APIs
- subscription self-serve billing APIs
- public reviews / ratings APIs
- vendor API keys and webhooks

Rule:

```text
if an endpoint is not required for the launch loop,
do not force it into R1 only because target design already describes it
```

---

## 11. Next Planning Dependency

These contracts should now feed:

- `schema_drafts.md`
- `runtime_checklists.md`
- `execution/runtime/phase_01_auth.md`
- later backend route/module boundaries inside `vendora_codebase/`
