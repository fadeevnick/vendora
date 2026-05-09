-- Phase 03 R1 catalog/listing foundation on top of the imported Product table.

ALTER TABLE "Product"
ADD COLUMN "category" TEXT NOT NULL DEFAULT 'general',
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'RUB',
ADD COLUMN "publishedAt" TIMESTAMP(3),
ADD COLUMN "unpublishedReason" TEXT;

UPDATE "Product"
SET "publishedAt" = COALESCE("publishedAt", "updatedAt")
WHERE "published" = true;

CREATE INDEX "Product_published_idx" ON "Product"("published");
CREATE INDEX "Product_category_idx" ON "Product"("category");
CREATE INDEX "Product_vendorId_idx" ON "Product"("vendorId");
