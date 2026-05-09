-- H1 checkout expiry/reaper hardening.
-- Existing checkout sessions receive a conservative 24h expiry from creation.
ALTER TABLE "CheckoutSession" ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "CheckoutSession"
SET "expiresAt" = "createdAt" + INTERVAL '24 hours'
WHERE "expiresAt" IS NULL;

ALTER TABLE "CheckoutSession" ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE INDEX "CheckoutSession_expiresAt_idx" ON "CheckoutSession"("expiresAt");
