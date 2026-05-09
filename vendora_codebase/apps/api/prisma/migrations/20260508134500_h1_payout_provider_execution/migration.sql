-- H1 payout provider execution evidence.
-- This records local payout artifacts for RELEASABLE vendor funds without claiming live provider payout.

ALTER TYPE "OrderFundStatus" ADD VALUE 'PAID_OUT';
ALTER TYPE "VendorLedgerEntryType" ADD VALUE 'PAID_OUT';

CREATE TYPE "PayoutProviderStatus" AS ENUM ('SUCCEEDED', 'FAILED');

CREATE TABLE "PayoutProviderExecution" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "orderFundId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerPayoutId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PayoutProviderStatus" NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutProviderExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayoutProviderExecution_orderFundId_key" ON "PayoutProviderExecution"("orderFundId");
CREATE UNIQUE INDEX "PayoutProviderExecution_providerName_providerPayoutId_key" ON "PayoutProviderExecution"("providerName", "providerPayoutId");
CREATE INDEX "PayoutProviderExecution_vendorId_idx" ON "PayoutProviderExecution"("vendorId");
CREATE INDEX "PayoutProviderExecution_orderId_idx" ON "PayoutProviderExecution"("orderId");
CREATE INDEX "PayoutProviderExecution_status_idx" ON "PayoutProviderExecution"("status");

ALTER TABLE "PayoutProviderExecution" ADD CONSTRAINT "PayoutProviderExecution_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutProviderExecution" ADD CONSTRAINT "PayoutProviderExecution_orderFundId_fkey" FOREIGN KEY ("orderFundId") REFERENCES "OrderFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
