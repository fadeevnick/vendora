-- Phase 06 R1 disputes and money-state evidence.

CREATE TYPE "DisputeResolutionType" AS ENUM ('BUYER_FAVOR_FULL_REFUND', 'VENDOR_FAVOR_RELEASE');
CREATE TYPE "VendorLedgerEntryType" AS ENUM ('FROZEN', 'RELEASED', 'REFUNDED');

ALTER TABLE "Dispute"
  ADD COLUMN "vendorResponse" TEXT,
  ADD COLUMN "vendorRespondedByUserId" TEXT,
  ADD COLUMN "vendorRespondedAt" TIMESTAMP(3),
  ADD COLUMN "resolutionType" "DisputeResolutionType",
  ADD COLUMN "resolvedByUserId" TEXT,
  ADD COLUMN "resolvedAt" TIMESTAMP(3);

CREATE TABLE "VendorBalanceLedger" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "orderId" TEXT,
  "entryType" "VendorLedgerEntryType" NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "referenceType" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VendorBalanceLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VendorBalanceLedger_vendorId_idx" ON "VendorBalanceLedger"("vendorId");
CREATE INDEX "VendorBalanceLedger_orderId_idx" ON "VendorBalanceLedger"("orderId");
CREATE INDEX "VendorBalanceLedger_referenceType_referenceId_idx" ON "VendorBalanceLedger"("referenceType", "referenceId");

ALTER TABLE "VendorBalanceLedger"
  ADD CONSTRAINT "VendorBalanceLedger_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorBalanceLedger"
  ADD CONSTRAINT "VendorBalanceLedger_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
