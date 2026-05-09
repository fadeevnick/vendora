import { execFileSync } from 'node:child_process'
import {
  assert,
  clearBuyerCart,
  disconnect,
  ensureProductFixture,
  ensureVendorFixture,
  evidence,
  login,
  prisma,
  record,
  request,
  runtimeSuffix,
  shippingAddress,
  upsertVerifiedUser,
} from './runtime_helpers.mjs'

function parseJson(output, label) {
  const jsonStart = output.indexOf('{')
  assert(jsonStart >= 0, `${label} output did not include JSON: ${output}`)
  return JSON.parse(output.slice(jsonStart))
}

function expireCheckouts(args = []) {
  return parseJson(execFileSync('npm', ['run', 'checkout:expire', '--', '--limit=20', ...args], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  }), 'checkout expiry')
}

async function setupFixtures(suffix) {
  const buyer = await upsertVerifiedUser(`h1-stock-expiry-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h1-stock-expiry-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H1EXP${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H1 Stock Expiry Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h1-stock-expiry-product-${suffix}`,
    vendorId: vendor.id,
    name: `H1 Stock Expiry Product ${suffix}`,
    price: 29,
    stock: 3,
  })
  await clearBuyerCart(buyer.id)
  return { buyer, product }
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
  const { buyer, product } = await setupFixtures(suffix)
  const buyerToken = await login(buyer.email)

  const cart = await addProductToCart({ token: buyerToken, productId: product.id, quantity: 3 })
  const checkout = await createCheckout({
    token: buyerToken,
    key: `h1-stock-expiry-${suffix}`,
    cartVersion: cart.data.version,
    label: 'H1 Stock Expiry Buyer',
  })
  assert(checkout.data.status === 'AWAITING_PAYMENT', `expected AWAITING_PAYMENT, got ${checkout.data.status}`)
  assert(checkout.data.expiresAt, 'checkout response should expose expiresAt')

  const afterReserveProduct = await prisma.product.findUnique({ where: { id: product.id } })
  assert(afterReserveProduct?.stock === 0, `expected stock 0 after reservation, got ${afterReserveProduct?.stock}`)
  await prisma.checkoutSession.update({
    where: { id: checkout.data.checkoutSessionId },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  })
  record('H1-STOCK-EXPIRY-01', 'checkout sessions carry an expiry timestamp while reserved stock is unavailable')

  const expiry = expireCheckouts()
  assert(expiry.ok === true, 'checkout expiry command should return ok')
  assert(expiry.expired === 1, `expected one expired checkout, got ${expiry.expired}`)
  assert(expiry.releasedReservations === 1, `expected one released reservation, got ${expiry.releasedReservations}`)
  assert(expiry.releasedQuantity === 3, `expected released quantity 3, got ${expiry.releasedQuantity}`)
  const expiredSession = await prisma.checkoutSession.findUnique({
    where: { id: checkout.data.checkoutSessionId },
    include: { stockReservations: true },
  })
  const afterExpiryProduct = await prisma.product.findUnique({ where: { id: product.id } })
  assert(expiredSession?.status === 'EXPIRED', `expected session EXPIRED, got ${expiredSession?.status}`)
  assert(expiredSession.stockReservations.every((reservation) => reservation.status === 'RELEASED'), 'expired checkout should release all reservations')
  assert(afterExpiryProduct?.stock === 3, `expected stock restored to 3, got ${afterExpiryProduct?.stock}`)
  record('H1-STOCK-EXPIRY-02', 'checkout expiry command releases reserved stock and marks the session expired')

  const replayedExpiry = expireCheckouts()
  const afterReplayProduct = await prisma.product.findUnique({ where: { id: product.id } })
  assert(replayedExpiry.expired === 0, `expected zero replay expirations, got ${replayedExpiry.expired}`)
  assert(replayedExpiry.releasedQuantity === 0, `expected zero replay released quantity, got ${replayedExpiry.releasedQuantity}`)
  assert(afterReplayProduct?.stock === 3, `expected replay to leave stock 3, got ${afterReplayProduct?.stock}`)
  record('H1-STOCK-EXPIRY-03', 'checkout expiry command replay does not release stock twice')

  const lateSuccess = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `h1-stock-expiry-success-${checkout.data.checkoutSessionId}`,
      checkoutSessionId: checkout.data.checkoutSessionId,
      eventType: 'PAYMENT_SUCCEEDED',
    }),
  })
  assert(lateSuccess.data.duplicate === true, 'late payment success after expiry should be a safe no-op')
  const orderCount = await prisma.order.count({ where: { checkoutSessionId: checkout.data.checkoutSessionId } })
  const afterLateSuccessProduct = await prisma.product.findUnique({ where: { id: product.id } })
  assert(orderCount === 0, `expected zero orders after late success, got ${orderCount}`)
  assert(afterLateSuccessProduct?.stock === 3, `expected late success to leave stock 3, got ${afterLateSuccessProduct?.stock}`)
  record('H1-STOCK-EXPIRY-04', 'late payment success after expiry cannot create orders or re-consume stock')

  const lateFailure = await sendPaymentWebhook({
    checkoutSessionId: checkout.data.checkoutSessionId,
    eventType: 'PAYMENT_FAILED',
    eventId: `h1-stock-expiry-failure-${checkout.data.checkoutSessionId}`,
  })
  assert(lateFailure.data.duplicate === true, 'late payment failure after expiry should be a safe no-op')
  const afterLateFailureProduct = await prisma.product.findUnique({ where: { id: product.id } })
  assert(afterLateFailureProduct?.stock === 3, `expected late failure to leave stock 3, got ${afterLateFailureProduct?.stock}`)
  record('H1-STOCK-EXPIRY-05', 'late payment failure after expiry is processed as an idempotent no-op')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    productId: product.id,
    expiredCheckoutSessionId: checkout.data.checkoutSessionId,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
