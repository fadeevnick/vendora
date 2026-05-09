ALTER TABLE "DisputeEvidence"
ADD COLUMN "storageKey" TEXT,
ADD COLUMN "storageProvider" TEXT,
ADD COLUMN "storedSizeBytes" INTEGER,
ADD COLUMN "contentSha256" TEXT,
ADD COLUMN "storageConfirmedAt" TIMESTAMP(3);
