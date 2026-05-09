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

function autoCancelUnconfirmed(args = []) {
  return parseJson(execFileSync('npm', ['run', 'orders:auto-cancel-unconfirmed', '--', '--limit=20', '--older-than-hours=24', ...args], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  }), 'orders auto-cancel unconfirmed')
}

async function setupFixtures(suffix) {
  const buyer = await upsertVerifiedUser(`h2-confirmation-timeout-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h2-confirmation-timeout-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H2CONFIRM${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H2 Confirmation Timeout Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h2-confirmation-timeout-product-${suffix}`,
    vendorId: vendor.id,
    name: `H2 Confirmation Timeout Product ${suffix}`,
    price: 31,
    stock: 5,
  })
  await clearBuyerCart(buyer.id)
  return { buyer, vendorUser, product }
}

async function createPaymentHeldOrder({ buyerToken, productId, suffix }) {
  const cart = await request('/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ listingId: productId, quantity: 1 }),
  })

  const checkout = await request('/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${buyerToken}`,
      'Idempotency-Key': `h2-confirmation-timeout-${suffix}`,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: shippingAddress('H2 Confirmation Timeout Buyer'),
    }),
  })

  const webhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `h2-confirmation-timeout-payment-${checkout.data.checkoutSessionId}`,
      checkoutSessionId: checkout.data.checkoutSessionId,
      eventType: 'PAYMENT_SUCCEEDED',
    }),
  })
  assert(webhook.data.orderIds.length === 1, `expected one order, got ${webhook.data.orderIds.length}`)
  return webhook.data.orderIds[0]
}

async function main() {
  const suffix = runtimeSuffix()
  const { buyer, vendorUser, product } = await setupFixtures(suffix)
  const buyerToken = await login(buyer.email)
  const vendorToken = await login(vendorUser.email)

  const orderId = await createPaymentHeldOrder({ buyerToken, productId: product.id, suffix })
  const paymentHeldOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: { funds: true },
  })
  assert(paymentHeldOrder?.status === 'PAYMENT_HELD', `expected PAYMENT_HELD, got ${paymentHeldOrder?.status}`)
  assert(paymentHeldOrder.funds?.status === 'HELD', `expected HELD funds, got ${paymentHeldOrder.funds?.status}`)
  await prisma.order.update({
    where: { id: orderId },
    data: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
  })
  record('H2-CONFIRMATION-TIMEOUT-01', 'payment-held order can age while funds remain held before vendor confirmation timeout')

  const autoCancelled = autoCancelUnconfirmed()
  assert(autoCancelled.ok === true, 'auto-cancel command should return ok')
  assert(autoCancelled.cancelled === 1, `expected one auto-cancelled order, got ${autoCancelled.cancelled}`)
  assert(autoCancelled.returnedFunds === 1, `expected one returned fund, got ${autoCancelled.returnedFunds}`)
  const cancelledOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: { funds: true },
  })
  assert(cancelledOrder?.status === 'CANCELLED', `expected CANCELLED order, got ${cancelledOrder?.status}`)
  assert(cancelledOrder.funds?.status === 'RETURNED_TO_BUYER', `expected RETURNED_TO_BUYER funds, got ${cancelledOrder.funds?.status}`)
  record('H2-CONFIRMATION-TIMEOUT-02', 'auto-cancel command moves old PAYMENT_HELD order to CANCELLED and returns held funds')

  const replayed = autoCancelUnconfirmed()
  assert(replayed.cancelled === 0, `expected zero replay cancellations, got ${replayed.cancelled}`)
  assert(replayed.returnedFunds === 0, `expected zero replay returned funds, got ${replayed.returnedFunds}`)
  const replayOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: { funds: true },
  })
  assert(replayOrder?.status === 'CANCELLED', `expected replay to leave order CANCELLED, got ${replayOrder?.status}`)
  assert(replayOrder.funds?.status === 'RETURNED_TO_BUYER', `expected replay to leave funds RETURNED_TO_BUYER, got ${replayOrder.funds?.status}`)
  record('H2-CONFIRMATION-TIMEOUT-03', 'auto-cancel command replay does not cancel or return funds twice')

  const confirmAfterTimeout = await fetch(`${process.env.RUNTIME_API_URL ?? 'http://127.0.0.1:3001'}/vendor/orders/${orderId}/confirm`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${vendorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })
  assert(confirmAfterTimeout.status === 409, `expected vendor confirm after auto-cancel to fail with 409, got ${confirmAfterTimeout.status}`)

  const audit = await prisma.auditEvent.findFirst({
    where: { resourceId: orderId, action: 'ORDER_AUTO_CANCELLED_CONFIRMATION_TIMEOUT' },
  })
  assert(Boolean(audit), 'auto-cancel should write audit evidence')
  const notifications = await prisma.notificationOutbox.findMany({
    where: {
      referenceId: orderId,
      eventType: { in: ['ORDER_AUTO_CANCELLED_BUYER', 'ORDER_AUTO_CANCELLED_VENDOR'] },
    },
  })
  assert(notifications.length >= 2, `expected buyer and vendor auto-cancel notifications, got ${notifications.length}`)
  record('H2-CONFIRMATION-TIMEOUT-04', 'auto-cancel blocks late vendor confirm and writes audit/notification evidence')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    orderId,
    autoCancelled,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
