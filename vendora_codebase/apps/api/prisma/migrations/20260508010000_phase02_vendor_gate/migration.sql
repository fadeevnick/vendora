-- Phase 02 R1 vendor gate / KYC foundation.

ALTER TYPE "VendorStatus" ADD VALUE IF NOT EXISTS 'ONBOARDING';
ALTER TYPE "VendorStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';

CREATE TYPE "KycApplicationStatus" AS ENUM (
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'REQUEST_MORE_INFO',
  'BLOCKED'
);

CREATE TYPE "KycDocumentStatus" AS ENUM (
  'UPLOAD_PENDING',
  'UPLOADED'
);

ALTER TABLE "Vendor"
ADD COLUMN "legalEntityName" TEXT,
ADD COLUMN "country" TEXT,
ADD COLUMN "addressJson" JSONB,
ADD COLUMN "salesCategory" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "reviewedAt" TIMESTAMP(3);

CREATE TABLE "VendorApplication" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "submittedByUserId" TEXT,
  "status" "KycApplicationStatus" NOT NULL DEFAULT 'DRAFT',
  "businessName" TEXT,
  "legalEntityName" TEXT,
  "taxId" TEXT,
  "country" TEXT,
  "addressJson" JSONB,
  "salesCategory" TEXT,
  "reviewNote" TEXT,
  "rejectionReasonCode" TEXT,
  "reviewedByUserId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VendorApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VendorApplicationDocument" (
  "id" TEXT NOT NULL,
  "vendorApplicationId" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "status" "KycDocumentStatus" NOT NULL DEFAULT 'UPLOAD_PENDING',
  "uploadedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "VendorApplicationDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorApplication_vendorId_key" ON "VendorApplication"("vendorId");
CREATE INDEX "VendorApplication_status_idx" ON "VendorApplication"("status");
CREATE INDEX "VendorApplicationDocument_vendorApplicationId_idx" ON "VendorApplicationDocument"("vendorApplicationId");
CREATE INDEX "AuditEvent_resourceType_resourceId_idx" ON "AuditEvent"("resourceType", "resourceId");
CREATE INDEX "AuditEvent_actorUserId_idx" ON "AuditEvent"("actorUserId");

ALTER TABLE "VendorApplication"
ADD CONSTRAINT "VendorApplication_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorApplication"
ADD CONSTRAINT "VendorApplication_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VendorApplication"
ADD CONSTRAINT "VendorApplication_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VendorApplicationDocument"
ADD CONSTRAINT "VendorApplicationDocument_vendorApplicationId_fkey" FOREIGN KEY ("vendorApplicationId") REFERENCES "VendorApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorApplicationDocument"
ADD CONSTRAINT "VendorApplicationDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditEvent"
ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "VendorApplication" (
  "id",
  "vendorId",
  "status",
  "businessName",
  "taxId",
  "submittedAt",
  "reviewedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "id",
  CASE
    WHEN "status" = 'APPROVED' THEN 'APPROVED'::"KycApplicationStatus"
    WHEN "status" = 'REJECTED' THEN 'REJECTED'::"KycApplicationStatus"
    ELSE 'PENDING_REVIEW'::"KycApplicationStatus"
  END,
  "name",
  "inn",
  "createdAt",
  CASE WHEN "status" IN ('APPROVED', 'REJECTED') THEN "updatedAt" ELSE NULL END,
  "createdAt",
  "updatedAt"
FROM "Vendor"
ON CONFLICT ("vendorId") DO NOTHING;

UPDATE "Vendor"
SET
  "approvedAt" = CASE WHEN "status" = 'APPROVED' THEN COALESCE("approvedAt", "updatedAt") ELSE "approvedAt" END,
  "reviewedAt" = CASE WHEN "status" IN ('APPROVED', 'REJECTED') THEN COALESCE("reviewedAt", "updatedAt") ELSE "reviewedAt" END;
