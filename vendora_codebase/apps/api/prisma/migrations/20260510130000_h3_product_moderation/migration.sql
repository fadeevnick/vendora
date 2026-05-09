-- Add a local product/listing moderation state used by admin catalog operations.
CREATE TYPE "ProductModerationStatus" AS ENUM ('APPROVED', 'SUSPENDED');

ALTER TABLE "Product"
ADD COLUMN "moderationStatus" "ProductModerationStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "moderationReason" TEXT,
ADD COLUMN "moderatedAt" TIMESTAMP(3),
ADD COLUMN "moderatedByUserId" TEXT;

CREATE INDEX "Product_moderationStatus_idx" ON "Product"("moderationStatus");
