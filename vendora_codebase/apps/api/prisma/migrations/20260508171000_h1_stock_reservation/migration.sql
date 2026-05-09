-- H1 stock reservation hardening.
-- Product.stock is treated as immediately available stock; RESERVED rows explain
-- decrement ownership until provider success commits or provider failure releases.
CREATE TYPE "StockReservationStatus" AS ENUM ('RESERVED', 'COMMITTED', 'RELEASED');

CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL,
    "checkoutSessionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "StockReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockReservation_checkoutSessionId_productId_key" ON "StockReservation"("checkoutSessionId", "productId");
CREATE INDEX "StockReservation_productId_idx" ON "StockReservation"("productId");
CREATE INDEX "StockReservation_status_idx" ON "StockReservation"("status");

ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_checkoutSessionId_fkey"
FOREIGN KEY ("checkoutSessionId") REFERENCES "CheckoutSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
