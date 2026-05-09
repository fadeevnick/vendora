-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('BUYER', 'VENDOR_OWNER');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "accountType" "AccountType" NOT NULL DEFAULT 'BUYER',
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lockedUntil" TIMESTAMP(3);

-- Backfill imported baseline users into a usable auth state for local runtime.
UPDATE "User"
SET
  "accountType" = CASE
    WHEN "email" = 'vendor@vendora.com' THEN 'VENDOR_OWNER'::"AccountType"
    ELSE 'BUYER'::"AccountType"
  END,
  "emailVerifiedAt" = COALESCE("emailVerifiedAt", CURRENT_TIMESTAMP),
  "isPlatformAdmin" = CASE
    WHEN "email" = 'admin@vendora.com' THEN true
    ELSE false
  END;
