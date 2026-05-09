import {
  assert,
  clearBuyerCart,
  disconnect,
  ensureProductFixture,
  ensureVendorFixture,
  evidence,
  expectHttpError,
  login,
  prisma,
  record,
  request,
  runtimeSuffix,
  shippingAddress,
  upsertVerifiedUser,
} from './runtime_helpers.mjs'

async function setupFixtures(suffix) {
  const buyer = await upsertVerifiedUser(`h1-payment-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h1-payment-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H1PAY${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H1 Payment Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h1-payment-product-${suffix}`,
    vendorId: vendor.id,
    name: `H1 Payment Product ${suffix}`,
    price: 19,
    stock: 10,
  })
  await clearBuyerCart(buyer.id)
  return { buyer, product }
}

async function createCheckout(buyerToken, productId, suffix, label) {
  await request('/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ listingId: productId, quantity: 1 }),
  })
  const cart = await request('/cart', { headers: { Authorization: `Bearer ${buyerToken}` } })
  return request('/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${buyerToken}`,
      'Idempotency-Key': `h1-payment-${label}-${suffix}`,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: shippingAddress(`H1 Payment ${label}`),
    }),
  })
}

async function main() {
  const suffix = runtimeSuffix()
  const { buyer, product } = await setupFixtures(suffix)
  const buyerToken = await login(buyer.email)

  const checkout = await createCheckout(buyerToken, product.id, suffix, 'success')
  assert(checkout.data.paymentProvider === 'dev_mock', `expected dev_mock provider, got ${checkout.data.paymentProvider}`)
  assert(String(checkout.data.providerSessionSecret).startsWith('dev_mock_checkout_'), 'checkout should expose dev_mock provider session reference')
  record('H1-PAYMENT-PROVIDER-01', 'checkout session is created through dev_mock payment provider adapter')

  await expectHttpError('/payments/provider/webhook', null, 403, 'FORBIDDEN', {
    method: 'POST',
    body: JSON.stringify({
      providerEventId: `h1-payment-invalid-${suffix}`,
      checkoutSessionId: checkout.data.checkoutSessionId,
      eventType: 'PAYMENT_SUCCEEDED',
    }),
  })
  record('H1-PAYMENT-PROVIDER-02', 'payment provider adapter rejects unsigned webhook payloads')

  const successEventId = `h1-payment-success-${checkout.data.checkoutSessionId}`
  const webhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: successEventId,
      checkoutSessionId: checkout.data.checkoutSessionId,
      eventType: 'PAYMENT_SUCCEEDED',
    }),
  })
  assert(webhook.data.processed === true, 'signed provider webhook should process')
  assert(webhook.data.orderIds.length === 1, 'provider webhook should create order')
  const successEvent = await prisma.paymentProviderEvent.findUnique({ where: { providerEventId: successEventId } })
  assert(successEvent?.providerName === 'dev_mock', `expected dev_mock payment event, got ${successEvent?.providerName}`)
  assert(Boolean(successEvent?.processedAt), 'successful payment provider event should be marked processed')
  record('H1-PAYMENT-PROVIDER-03', 'signed dev_mock webhook finalizes payment and stores provider event evidence')

  const failedCheckout = await createCheckout(buyerToken, product.id, suffix, 'failure')
  const failureEventId = `h1-payment-failure-${failedCheckout.data.checkoutSessionId}`
  const failedWebhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: failureEventId,
      checkoutSessionId: failedCheckout.data.checkoutSessionId,
      eventType: 'PAYMENT_FAILED',
    }),
  })
  assert(failedWebhook.data.processed === true, 'failed payment webhook should process')
  assert(failedWebhook.data.orderIds.length === 0, 'failed payment webhook should not create orders')
  const failedSession = await prisma.checkoutSession.findUnique({
    where: { id: failedCheckout.data.checkoutSessionId },
    include: { orders: true },
  })
  assert(failedSession?.status === 'FAILED', `expected failed checkout status, got ${failedSession?.status}`)
  assert(failedSession.orders.length === 0, 'failed checkout should not create orders')
  const failedEvent = await prisma.paymentProviderEvent.findUnique({ where: { providerEventId: failureEventId } })
  assert(failedEvent?.providerName === 'dev_mock', `expected dev_mock failed event, got ${failedEvent?.providerName}`)
  const failedNotification = await prisma.notificationOutbox.findFirst({
    where: {
      eventType: 'CHECKOUT_PAYMENT_FAILED',
      referenceId: failedCheckout.data.checkoutSessionId,
    },
  })
  assert(Boolean(failedNotification), 'failed payment should enqueue buyer notification artifact')
  record('H1-PAYMENT-PROVIDER-04', 'dev_mock payment failure marks checkout failed without orders and enqueues notification artifact')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    successCheckoutSessionId: checkout.data.checkoutSessionId,
    failedCheckoutSessionId: failedCheckout.data.checkoutSessionId,
    orderIds: webhook.data.orderIds,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
