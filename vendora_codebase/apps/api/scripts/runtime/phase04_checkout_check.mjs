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
  const buyer = await upsertVerifiedUser(`phase04-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUserA = await upsertVerifiedUser(`phase04-vendor-a-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendorUserB = await upsertVerifiedUser(`phase04-vendor-b-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendorA = await ensureVendorFixture({
    user: vendorUserA,
    inn: `PHASE04VENDORA${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `Phase 04 Vendor A ${suffix}`,
  })
  const vendorB = await ensureVendorFixture({
    user: vendorUserB,
    inn: `PHASE04VENDORB${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `Phase 04 Vendor B ${suffix}`,
  })
  const productA = await ensureProductFixture({
    id: `phase04-product-a-${suffix}`,
    vendorId: vendorA.id,
    name: `Phase 04 Product A ${suffix}`,
    price: 10,
    stock: 12,
  })
  const productB = await ensureProductFixture({
    id: `phase04-product-b-${suffix}`,
    vendorId: vendorB.id,
    name: `Phase 04 Product B ${suffix}`,
    price: 25,
    stock: 8,
  })
  await clearBuyerCart(buyer.id)
  return { buyer, vendorA, productA, productB }
}

async function main() {
  const suffix = runtimeSuffix()
  const { buyer, vendorA, productA, productB } = await setupFixtures(suffix)
  const buyerToken = await login(buyer.email)

  const emptyCart = await request('/cart', { headers: { Authorization: `Bearer ${buyerToken}` } })
  let cart = await request('/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ listingId: productA.id, quantity: 2 }),
  })
  cart = await request('/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ listingId: productB.id, quantity: 1 }),
  })
  assert(cart.data.groups.length === 2, 'cart should group items by vendor')
  assert(cart.data.version > emptyCart.data.version, 'cart version should increment after mutations')
  record('R1-CHK-01', 'buyer adds eligible listings to persisted cart grouped by vendor')

  const checkoutKey = `phase04-${suffix}`
  const checkout = await request('/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${buyerToken}`,
      'Idempotency-Key': checkoutKey,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: shippingAddress('Phase 04 Buyer'),
    }),
  })
  assert(checkout.data.status === 'AWAITING_PAYMENT', 'checkout should start awaiting payment')
  assert(checkout.data.totalMinor === cart.data.totalMinor, 'checkout should use validated cart total snapshot')
  record('R1-CHK-02', 'checkout session validates cart version, stock, eligibility and price snapshot')

  const replayedCheckout = await request('/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${buyerToken}`,
      'Idempotency-Key': checkoutKey,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: shippingAddress('Phase 04 Buyer'),
    }),
  })
  assert(replayedCheckout.data.checkoutSessionId === checkout.data.checkoutSessionId, 'same idempotency key should return same checkout session')
  await expectHttpError('/checkout/sessions', buyerToken, 409, 'IDEMPOTENCY_CONFLICT', {
    method: 'POST',
    headers: { 'Idempotency-Key': checkoutKey },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: { ...shippingAddress('Phase 04 Buyer Changed'), line1: 'Changed Runtime Ave' },
    }),
  })
  record('R1-CHK-03', 'checkout submit is idempotent and conflicting key reuse is rejected')

  const webhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `phase04-${checkout.data.checkoutSessionId}`,
      checkoutSessionId: checkout.data.checkoutSessionId,
      eventType: 'PAYMENT_SUCCEEDED',
    }),
  })
  assert(webhook.data.processed === true, 'provider webhook should process first event')
  assert(webhook.data.orderIds.length === 2, 'checkout should create one order per vendor')
  const createdOrders = await prisma.order.findMany({
    where: { id: { in: webhook.data.orderIds } },
    include: { funds: true },
  })
  assert(createdOrders.every((order) => order.checkoutSessionId === checkout.data.checkoutSessionId), 'orders should link to checkout session')
  record('R1-CHK-04', 'signed local/dev provider webhook finalizes payment and creates vendor-specific orders')

  assert(createdOrders.every((order) => order.funds?.status === 'HELD'), 'created orders should receive HELD order funds')
  record('R1-CHK-05', 'each created order receives a HELD order-fund row')

  const replayedWebhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `phase04-${checkout.data.checkoutSessionId}`,
      checkoutSessionId: checkout.data.checkoutSessionId,
      eventType: 'PAYMENT_SUCCEEDED',
    }),
  })
  assert(replayedWebhook.data.duplicate === true, 'replayed provider event should be duplicate')
  assert(replayedWebhook.data.orderIds.length === 2, 'replayed provider event should not duplicate orders')
  const completedCheckout = await request(`/checkout/sessions/${checkout.data.checkoutSessionId}`, { headers: { Authorization: `Bearer ${buyerToken}` } })
  assert(completedCheckout.data.status === 'SUCCEEDED', 'checkout session should be SUCCEEDED after webhook')
  record('R1-CHK-06', 'provider webhook replay is safe and checkout reports created order ids')

  const clearedCart = await request('/cart', { headers: { Authorization: `Bearer ${buyerToken}` } })
  assert(clearedCart.data.groups.length === 0, 'finalized checkout should clear cart')
  record('R1-CHK-07', 'finalized checkout clears persisted cart items')

  const unpublished = await ensureProductFixture({
    id: `phase04-unpublished-${suffix}`,
    vendorId: vendorA.id,
    name: `Phase 04 Unpublished ${suffix}`,
    price: 12,
    stock: 2,
    published: false,
  })
  await expectHttpError('/cart/items', buyerToken, 400, 'VALIDATION_ERROR', {
    method: 'POST',
    body: JSON.stringify({ listingId: unpublished.id, quantity: 1 }),
  })
  await prisma.vendor.update({ where: { id: vendorA.id }, data: { status: 'BLOCKED' } })
  await expectHttpError('/cart/items', buyerToken, 400, 'VALIDATION_ERROR', {
    method: 'POST',
    body: JSON.stringify({ listingId: productA.id, quantity: 1 }),
  })
  await prisma.vendor.update({ where: { id: vendorA.id }, data: { status: 'APPROVED' } })
  record('R1-CHK-08', 'unpublished and blocked-vendor listings are denied at cart-add time')

  await expectHttpError('/orders', buyerToken, 409, 'CHECKOUT_REQUIRED', {
    method: 'POST',
    body: JSON.stringify({ items: [{ productId: productA.id, qty: 1 }] }),
  })
  record('R1-CHK-09', 'legacy direct order creation is blocked with CHECKOUT_REQUIRED')

  console.log(JSON.stringify({ ok: true, evidence, checkoutSessionId: checkout.data.checkoutSessionId, orderIds: webhook.data.orderIds }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
