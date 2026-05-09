-- Phase 04 R1 cart / checkout / dev payment finalization foundation.

CREATE TYPE "CheckoutSessionStatus" AS ENUM ('AWAITING_PAYMENT', 'SUCCEEDED', 'FAILED', 'EXPIRED');
CREATE TYPE "OrderFundStatus" AS ENUM ('HELD', 'RELEASABLE', 'FROZEN_DISPUTE', 'RETURNED_TO_BUYER');

CREATE TABLE "Cart" (
  "id" TEXT NOT NULL,
  "buyerUserId" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CartItem" (
  "id" TEXT NOT NULL,
  "cartId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPriceMinorSnapshot" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CheckoutSession" (
  "id" TEXT NOT NULL,
  "buyerUserId" TEXT NOT NULL,
  "cartId" TEXT NOT NULL,
  "cartVersion" INTEGER NOT NULL,
  "shippingAddressJson" JSONB NOT NULL,
  "totalMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "providerName" TEXT NOT NULL DEFAULT 'dev',
  "providerSessionId" TEXT NOT NULL,
  "status" "CheckoutSessionStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CheckoutSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IdempotencyRecord" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "routeKey" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "responseRefType" TEXT NOT NULL,
  "responseRefId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentProviderEvent" (
  "id" TEXT NOT NULL,
  "providerName" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "checkoutSessionId" TEXT,
  "eventType" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentProviderEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderFund" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "status" "OrderFundStatus" NOT NULL DEFAULT 'HELD',
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrderFund_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order"
ADD COLUMN "checkoutSessionId" TEXT,
ADD COLUMN "orderNumber" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
ADD COLUMN "shippingAddressJson" JSONB,
ADD COLUMN "buyerEmailSnapshot" TEXT;

ALTER TABLE "OrderItem"
ADD COLUMN "listingTitleSnapshot" TEXT,
ADD COLUMN "unitPriceMinor" INTEGER,
ADD COLUMN "lineTotalMinor" INTEGER;

UPDATE "OrderItem" oi
SET
  "listingTitleSnapshot" = p."name",
  "unitPriceMinor" = ROUND((oi."price"::numeric * 100))::INTEGER,
  "lineTotalMinor" = ROUND((oi."price"::numeric * oi."qty" * 100))::INTEGER
FROM "Product" p
WHERE oi."productId" = p."id";

CREATE UNIQUE INDEX "Cart_buyerUserId_key" ON "Cart"("buyerUserId");
CREATE INDEX "Cart_buyerUserId_idx" ON "Cart"("buyerUserId");
CREATE UNIQUE INDEX "CartItem_cartId_productId_key" ON "CartItem"("cartId", "productId");
CREATE INDEX "CartItem_vendorId_idx" ON "CartItem"("vendorId");
CREATE UNIQUE INDEX "CheckoutSession_providerSessionId_key" ON "CheckoutSession"("providerSessionId");
CREATE INDEX "CheckoutSession_buyerUserId_idx" ON "CheckoutSession"("buyerUserId");
CREATE INDEX "CheckoutSession_status_idx" ON "CheckoutSession"("status");
CREATE UNIQUE INDEX "IdempotencyRecord_actorUserId_routeKey_idempotencyKey_key" ON "IdempotencyRecord"("actorUserId", "routeKey", "idempotencyKey");
CREATE UNIQUE INDEX "PaymentProviderEvent_providerEventId_key" ON "PaymentProviderEvent"("providerEventId");
CREATE UNIQUE INDEX "OrderFund_orderId_key" ON "OrderFund"("orderId");
CREATE INDEX "OrderFund_vendorId_idx" ON "OrderFund"("vendorId");
CREATE INDEX "OrderFund_status_idx" ON "OrderFund"("status");
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE INDEX "Order_checkoutSessionId_idx" ON "Order"("checkoutSessionId");
CREATE INDEX "Order_buyerId_idx" ON "Order"("buyerId");
CREATE INDEX "Order_vendorId_idx" ON "Order"("vendorId");

ALTER TABLE "Cart" ADD CONSTRAINT "Cart_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_checkoutSessionId_fkey" FOREIGN KEY ("checkoutSessionId") REFERENCES "CheckoutSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_checkoutSessionId_fkey" FOREIGN KEY ("checkoutSessionId") REFERENCES "CheckoutSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderFund" ADD CONSTRAINT "OrderFund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderFund" ADD CONSTRAINT "OrderFund_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
