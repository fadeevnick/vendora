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
  const buyerA = await upsertVerifiedUser(`h1-stock-buyer-a-${suffix}@vendora.local`, 'BUYER')
  const buyerB = await upsertVerifiedUser(`h1-stock-buyer-b-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h1-stock-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H1STOCK${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H1 Stock Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h1-stock-product-${suffix}`,
    vendorId: vendor.id,
    name: `H1 Stock Product ${suffix}`,
    price: 31,
    stock: 2,
  })
  await clearBuyerCart(buyerA.id)
  await clearBuyerCart(buyerB.id)
  return { buyerA, buyerB, product }
}

async function addProductToCart({ token, productId, quantity }) {
  return request('/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ listingId: productId, quantity }),
  })
}

async function createCheckout({ token, key, cartVersion, label }) {
  return request('/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': key,
    },
    body: JSON.stringify({
      cartVersion,
      shippingAddress: shippingAddress(label),
    }),
  })
}

async function sendPaymentWebhook({ checkoutSessionId, eventType, eventId }) {
  return request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: eventId,
      checkoutSessionId,
      eventType,
    }),
  })
}

async function main() {
  const suffix = runtimeSuffix()
  const { buyerA, buyerB, product } = await setupFixtures(suffix)
  const buyerAToken = await login(buyerA.email)
  const buyerBToken = await login(buyerB.email)

  const cartA = await addProductToCart({ token: buyerAToken, productId: product.id, quantity: 2 })
  const cartB = await addProductToCart({ token: buyerBToken, productId: product.id, quantity: 1 })

  const firstCheckout = await createCheckout({
    token: buyerAToken,
    key: `h1-stock-reserve-${suffix}`,
    cartVersion: cartA.data.version,
    label: 'H1 Stock Buyer A',
  })
  const afterReserveProduct = await prisma.product.findUnique({ where: { id: product.id } })
  const firstReservations = await prisma.stockReservation.findMany({
    where: { checkoutSessionId: firstCheckout.data.checkoutSessionId },
  })
  assert(afterReserveProduct?.stock === 0, `expected available stock 0 after reservation, got ${afterReserveProduct?.stock}`)
  assert(firstReservations.length === 1, `expected one reservation, got ${firstReservations.length}`)
  assert(firstReservations[0].status === 'RESERVED', `expected RESERVED reservation, got ${firstReservations[0].status}`)
  assert(firstReservations[0].quantity === 2, `expected reserved quantity 2, got ${firstReservations[0].quantity}`)
  record('H1-STOCK-RESERVATION-01', 'checkout session creates a RESERVED stock row and decrements available product stock')

  await expectHttpError('/checkout/sessions', buyerBToken, 400, 'VALIDATION_ERROR', {
    method: 'POST',
    headers: { 'Idempotency-Key': `h1-stock-compete-${suffix}` },
    body: JSON.stringify({
      cartVersion: cartB.data.version,
      shippingAddress: shippingAddress('H1 Stock Buyer B'),
    }),
  })
  const afterCompetingProduct = await prisma.product.findUnique({ where: { id: product.id } })
  assert(afterCompetingProduct?.stock === 0, 'competing checkout should not change reserved stock')
  record('H1-STOCK-RESERVATION-02', 'competing checkout cannot oversell stock already reserved by an awaiting-payment session')

  const failedWebhook = await sendPaymentWebhook({
    checkoutSessionId: firstCheckout.data.checkoutSessionId,
    eventType: 'PAYMENT_FAILED',
    eventId: `h1-stock-failed-${firstCheckout.data.checkoutSessionId}`,
  })
  assert(failedWebhook.data.processed === true, 'payment failure should process first event')
  const afterFailureProduct = await prisma.product.findUnique({ where: { id: product.id } })
  const releasedReservation = await prisma.stockReservation.findFirst({
    where: { checkoutSessionId: firstCheckout.data.checkoutSessionId },
  })
  assert(afterFailureProduct?.stock === 2, `expected stock restored to 2 after failure, got ${afterFailureProduct?.stock}`)
  assert(releasedReservation?.status === 'RELEASED', `expected RELEASED reservation, got ${releasedReservation?.status}`)
  record('H1-STOCK-RESERVATION-03', 'payment failure releases reserved stock exactly once')

  const secondCheckout = await createCheckout({
    token: buyerAToken,
    key: `h1-stock-success-${suffix}`,
    cartVersion: cartA.data.version,
    label: 'H1 Stock Buyer A Success',
  })
  const afterSecondReserveProduct = await prisma.product.findUnique({ where: { id: product.id } })
  assert(afterSecondReserveProduct?.stock === 0, `expected stock 0 after second reservation, got ${afterSecondReserveProduct?.stock}`)

  const successWebhook = await sendPaymentWebhook({
    checkoutSessionId: secondCheckout.data.checkoutSessionId,
    eventType: 'PAYMENT_SUCCEEDED',
    eventId: `h1-stock-succeeded-${secondCheckout.data.checkoutSessionId}`,
  })
  assert(successWebhook.data.processed === true, 'payment success should process first event')
  assert(successWebhook.data.orderIds.length === 1, `expected one order, got ${successWebhook.data.orderIds.length}`)
  const committedReservation = await prisma.stockReservation.findFirst({
    where: { checkoutSessionId: secondCheckout.data.checkoutSessionId },
  })
  const afterSuccessProduct = await prisma.product.findUnique({ where: { id: product.id } })
  assert(committedReservation?.status === 'COMMITTED', `expected COMMITTED reservation, got ${committedReservation?.status}`)
  assert(afterSuccessProduct?.stock === 0, `expected committed checkout to keep stock at 0, got ${afterSuccessProduct?.stock}`)
  record('H1-STOCK-RESERVATION-04', 'payment success commits the reservation and creates the order without double decrementing stock')

  const orderCountBeforeReplay = await prisma.order.count({ where: { checkoutSessionId: secondCheckout.data.checkoutSessionId } })
  const replayedWebhook = await sendPaymentWebhook({
    checkoutSessionId: secondCheckout.data.checkoutSessionId,
    eventType: 'PAYMENT_SUCCEEDED',
    eventId: `h1-stock-succeeded-${secondCheckout.data.checkoutSessionId}`,
  })
  const orderCountAfterReplay = await prisma.order.count({ where: { checkoutSessionId: secondCheckout.data.checkoutSessionId } })
  const afterReplayProduct = await prisma.product.findUnique({ where: { id: product.id } })
  assert(replayedWebhook.data.duplicate === true, 'payment success replay should be duplicate')
  assert(orderCountAfterReplay === orderCountBeforeReplay, 'payment success replay should not duplicate orders')
  assert(afterReplayProduct?.stock === 0, `expected replay to leave stock at 0, got ${afterReplayProduct?.stock}`)
  record('H1-STOCK-RESERVATION-05', 'payment webhook replay is idempotent for reservations, orders and available stock')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    productId: product.id,
    failedCheckoutSessionId: firstCheckout.data.checkoutSessionId,
    succeededCheckoutSessionId: secondCheckout.data.checkoutSessionId,
    orderIds: successWebhook.data.orderIds,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
