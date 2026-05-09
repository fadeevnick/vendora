-- H1 protected KYC raw-document storage evidence.

ALTER TABLE "VendorApplicationDocument"
ADD COLUMN "storageProvider" TEXT NOT NULL DEFAULT 'local_private',
ADD COLUMN "storedSizeBytes" INTEGER,
ADD COLUMN "contentSha256" TEXT,
ADD COLUMN "storageConfirmedAt" TIMESTAMP(3);

CREATE INDEX "VendorApplicationDocument_storageProvider_idx" ON "VendorApplicationDocument"("storageProvider");
