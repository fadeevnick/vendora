-- H1 refund provider execution evidence.
-- This records provider-refund artifacts for buyer-favor dispute outcomes without claiming live provider refunds.

CREATE TYPE "RefundProviderStatus" AS ENUM ('SUCCEEDED', 'FAILED');

CREATE TABLE "RefundProviderExecution" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerRefundId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "RefundProviderStatus" NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundProviderExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefundProviderExecution_disputeId_key" ON "RefundProviderExecution"("disputeId");
CREATE UNIQUE INDEX "RefundProviderExecution_providerName_providerRefundId_key" ON "RefundProviderExecution"("providerName", "providerRefundId");
CREATE INDEX "RefundProviderExecution_orderId_idx" ON "RefundProviderExecution"("orderId");
CREATE INDEX "RefundProviderExecution_status_idx" ON "RefundProviderExecution"("status");

ALTER TABLE "RefundProviderExecution" ADD CONSTRAINT "RefundProviderExecution_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
