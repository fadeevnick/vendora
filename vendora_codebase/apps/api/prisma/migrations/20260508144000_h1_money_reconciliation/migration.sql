-- H1 money reconciliation evidence.
-- This records local reconciliation runs over payment/refund/payout artifacts without claiming live provider dashboard reconciliation.

CREATE TYPE "MoneyReconciliationStatus" AS ENUM ('SUCCEEDED', 'FAILED');
CREATE TYPE "MoneyReconciliationType" AS ENUM ('PAYMENT_EVENT', 'REFUND_EXECUTION', 'PAYOUT_EXECUTION');
CREATE TYPE "MoneyReconciliationItemStatus" AS ENUM ('MATCHED', 'MISMATCHED');

CREATE TABLE "MoneyReconciliationRun" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'money_provider_artifacts',
    "status" "MoneyReconciliationStatus" NOT NULL,
    "checkedPayments" INTEGER NOT NULL DEFAULT 0,
    "checkedRefunds" INTEGER NOT NULL DEFAULT 0,
    "checkedPayouts" INTEGER NOT NULL DEFAULT 0,
    "mismatches" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MoneyReconciliationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MoneyReconciliationItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "itemType" "MoneyReconciliationType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "status" "MoneyReconciliationItemStatus" NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyReconciliationItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MoneyReconciliationRun_status_idx" ON "MoneyReconciliationRun"("status");
CREATE INDEX "MoneyReconciliationRun_createdAt_idx" ON "MoneyReconciliationRun"("createdAt");
CREATE INDEX "MoneyReconciliationItem_runId_idx" ON "MoneyReconciliationItem"("runId");
CREATE INDEX "MoneyReconciliationItem_itemType_idx" ON "MoneyReconciliationItem"("itemType");
CREATE INDEX "MoneyReconciliationItem_resourceId_idx" ON "MoneyReconciliationItem"("resourceId");
CREATE INDEX "MoneyReconciliationItem_status_idx" ON "MoneyReconciliationItem"("status");

ALTER TABLE "MoneyReconciliationItem" ADD CONSTRAINT "MoneyReconciliationItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MoneyReconciliationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
