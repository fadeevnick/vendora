-- H1 Stripe checkout hosted-session return value.
ALTER TABLE "CheckoutSession"
ADD COLUMN "providerSessionSecret" TEXT;

