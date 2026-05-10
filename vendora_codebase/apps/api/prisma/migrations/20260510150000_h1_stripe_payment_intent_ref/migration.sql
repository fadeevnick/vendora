-- H1 Stripe refund linkage: retain provider payment intent reference from payment webhooks.
ALTER TABLE "PaymentProviderEvent"
ADD COLUMN "providerPaymentIntentId" TEXT;

CREATE INDEX "PaymentProviderEvent_providerPaymentIntentId_idx" ON "PaymentProviderEvent"("providerPaymentIntentId");

