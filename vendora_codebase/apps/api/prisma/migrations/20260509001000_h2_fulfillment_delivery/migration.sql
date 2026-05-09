-- H2 fulfillment delivery hardening.
ALTER TYPE "OrderStatus" ADD VALUE 'DELIVERED';

ALTER TABLE "Order"
ADD COLUMN "shipmentCarrier" TEXT,
ADD COLUMN "shipmentTrackingNumber" TEXT,
ADD COLUMN "shipmentMetadataJson" JSONB,
ADD COLUMN "shippedAt" TIMESTAMP(3),
ADD COLUMN "deliveredAt" TIMESTAMP(3);
