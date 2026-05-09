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

function autoCompleteDelivered(args = []) {
  return parseJson(execFileSync('npm', ['run', 'orders:auto-complete-delivered', '--', '--limit=20', '--older-than-hours=24', ...args], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  }), 'orders auto-complete delivered')
}

async function setupFixtures(suffix) {
  const buyer = await upsertVerifiedUser(`h2-delivery-timeout-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h2-delivery-timeout-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H2TIMEOUT${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H2 Delivery Timeout Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h2-delivery-timeout-product-${suffix}`,
    vendorId: vendor.id,
    name: `H2 Delivery Timeout Product ${suffix}`,
    price: 27,
    stock: 5,
  })
  await clearBuyerCart(buyer.id)
  return { buyer, vendorUser, product }
}

async function createPaidOrder({ buyerToken, productId, suffix }) {
  const cart = await request('/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ listingId: productId, quantity: 1 }),
  })

  const checkout = await request('/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${buyerToken}`,
      'Idempotency-Key': `h2-delivery-timeout-${suffix}`,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: shippingAddress('H2 Delivery Timeout Buyer'),
    }),
  })

  const webhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `h2-delivery-timeout-payment-${checkout.data.checkoutSessionId}`,
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

  const orderId = await createPaidOrder({ buyerToken, productId: product.id, suffix })
  await request(`/vendor/orders/${orderId}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({}),
  })
  await request(`/vendor/orders/${orderId}/ship`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({ carrier: 'Runtime Carrier', trackingNumber: `TIMEOUT-${suffix}`.slice(0, 48) }),
  })
  const delivered = await request(`/buyer/orders/${orderId}/mark-delivered`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({}),
  })
  assert(delivered.data.status === 'DELIVERED', `expected DELIVERED, got ${delivered.data.status}`)
  assert(delivered.data.funds.status === 'HELD', `expected HELD funds before timeout, got ${delivered.data.funds.status}`)
  await prisma.order.update({
    where: { id: orderId },
    data: { deliveredAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
  })
  record('H2-DELIVERY-TIMEOUT-01', 'delivered order can age while funds remain held before timeout completion')

  const autoCompleted = autoCompleteDelivered()
  assert(autoCompleted.ok === true, 'auto-complete command should return ok')
  assert(autoCompleted.completed === 1, `expected one auto-completed order, got ${autoCompleted.completed}`)
  assert(autoCompleted.releasedFunds === 1, `expected one released fund, got ${autoCompleted.releasedFunds}`)
  const completedOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: { funds: true },
  })
  assert(completedOrder?.status === 'COMPLETED', `expected COMPLETED order, got ${completedOrder?.status}`)
  assert(completedOrder.funds?.status === 'RELEASABLE', `expected RELEASABLE funds, got ${completedOrder.funds?.status}`)
  record('H2-DELIVERY-TIMEOUT-02', 'auto-complete command moves old DELIVERED order to COMPLETED and releases held funds')

  const replayed = autoCompleteDelivered()
  assert(replayed.completed === 0, `expected zero replay completions, got ${replayed.completed}`)
  assert(replayed.releasedFunds === 0, `expected zero replay released funds, got ${replayed.releasedFunds}`)
  const replayOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: { funds: true },
  })
  assert(replayOrder?.status === 'COMPLETED', `expected replay to leave order COMPLETED, got ${replayOrder?.status}`)
  assert(replayOrder.funds?.status === 'RELEASABLE', `expected replay to leave funds RELEASABLE, got ${replayOrder.funds?.status}`)
  record('H2-DELIVERY-TIMEOUT-03', 'auto-complete command replay does not complete or release funds twice')

  const audit = await prisma.auditEvent.findFirst({
    where: { resourceId: orderId, action: 'ORDER_AUTO_COMPLETED_DELIVERY_TIMEOUT' },
  })
  assert(Boolean(audit), 'auto-complete should write audit evidence')
  const notifications = await prisma.notificationOutbox.findMany({
    where: {
      referenceId: orderId,
      eventType: { in: ['ORDER_AUTO_COMPLETED_BUYER', 'ORDER_AUTO_COMPLETED_VENDOR'] },
    },
  })
  assert(notifications.length >= 2, `expected buyer and vendor auto-complete notifications, got ${notifications.length}`)
  record('H2-DELIVERY-TIMEOUT-04', 'auto-complete writes audit and notification outbox evidence')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    orderId,
    autoCompleted,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
