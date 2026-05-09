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

function runMaintenance(args = []) {
  return parseJson(execFileSync('npm', [
    'run',
    'orders:run-maintenance',
    '--',
    '--limit=20',
    '--confirmation-older-than-hours=24',
    '--delivery-older-than-hours=24',
    ...args,
  ], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  }), 'orders maintenance')
}

async function setupFixtures(suffix) {
  const buyer = await upsertVerifiedUser(`h2-order-maintenance-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h2-order-maintenance-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H2JOBS${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H2 Order Maintenance Vendor ${suffix}`,
  })
  const products = {
    abandoned: await ensureProductFixture({
      id: `h2-order-maintenance-abandoned-${suffix}`,
      vendorId: vendor.id,
      name: `H2 Maintenance Abandoned Checkout ${suffix}`,
      price: 19,
      stock: 5,
    }),
    unconfirmed: await ensureProductFixture({
      id: `h2-order-maintenance-unconfirmed-${suffix}`,
      vendorId: vendor.id,
      name: `H2 Maintenance Unconfirmed Order ${suffix}`,
      price: 23,
      stock: 5,
    }),
    delivered: await ensureProductFixture({
      id: `h2-order-maintenance-delivered-${suffix}`,
      vendorId: vendor.id,
      name: `H2 Maintenance Delivered Order ${suffix}`,
      price: 29,
      stock: 5,
    }),
  }
  await clearBuyerCart(buyer.id)
  return { buyer, vendorUser, products }
}

async function createCheckoutSession({ buyerToken, productId, keyPrefix, suffix }) {
  const cart = await request('/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ listingId: productId, quantity: 1 }),
  })

  return request('/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${buyerToken}`,
      'Idempotency-Key': `${keyPrefix}-${suffix}`,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: shippingAddress('H2 Order Maintenance Buyer'),
    }),
  })
}

async function createPaymentHeldOrder({ buyerToken, productId, keyPrefix, suffix }) {
  const checkout = await createCheckoutSession({ buyerToken, productId, keyPrefix, suffix })
  const webhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `${keyPrefix}-payment-${checkout.data.checkoutSessionId}`,
      checkoutSessionId: checkout.data.checkoutSessionId,
      eventType: 'PAYMENT_SUCCEEDED',
    }),
  })
  assert(webhook.data.orderIds.length === 1, `expected one order, got ${webhook.data.orderIds.length}`)
  return webhook.data.orderIds[0]
}

async function main() {
  const suffix = runtimeSuffix()
  const { buyer, vendorUser, products } = await setupFixtures(suffix)
  const buyerToken = await login(buyer.email)
  const vendorToken = await login(vendorUser.email)
  const past = new Date(Date.now() - 48 * 60 * 60 * 1000)

  const abandonedCheckout = await createCheckoutSession({
    buyerToken,
    productId: products.abandoned.id,
    keyPrefix: 'h2-order-maintenance-abandoned',
    suffix,
  })
  await prisma.checkoutSession.update({
    where: { id: abandonedCheckout.data.checkoutSessionId },
    data: { expiresAt: past },
  })

  await clearBuyerCart(buyer.id)
  const unconfirmedOrderId = await createPaymentHeldOrder({
    buyerToken,
    productId: products.unconfirmed.id,
    keyPrefix: 'h2-order-maintenance-unconfirmed',
    suffix,
  })
  await prisma.order.update({
    where: { id: unconfirmedOrderId },
    data: { createdAt: past },
  })

  await clearBuyerCart(buyer.id)
  const deliveredOrderId = await createPaymentHeldOrder({
    buyerToken,
    productId: products.delivered.id,
    keyPrefix: 'h2-order-maintenance-delivered',
    suffix,
  })
  await request(`/vendor/orders/${deliveredOrderId}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({}),
  })
  await request(`/vendor/orders/${deliveredOrderId}/ship`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({ carrier: 'Runtime Carrier', trackingNumber: `JOBS-${suffix}`.slice(0, 48) }),
  })
  await request(`/buyer/orders/${deliveredOrderId}/mark-delivered`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({}),
  })
  await prisma.order.update({
    where: { id: deliveredOrderId },
    data: { deliveredAt: past },
  })

  record('H2-ORDER-MAINTENANCE-01', 'one due checkout expiry, confirmation timeout and delivery timeout fixture can coexist')

  const firstRun = runMaintenance()
  assert(firstRun.ok === true, 'maintenance command should return ok')
  assert(firstRun.checkoutExpiry.expired === 1, `expected one expired checkout, got ${firstRun.checkoutExpiry.expired}`)
  assert(firstRun.confirmationTimeout.cancelled === 1, `expected one confirmation timeout cancellation, got ${firstRun.confirmationTimeout.cancelled}`)
  assert(firstRun.deliveryTimeout.completed === 1, `expected one delivery timeout completion, got ${firstRun.deliveryTimeout.completed}`)

  const expiredCheckout = await prisma.checkoutSession.findUnique({
    where: { id: abandonedCheckout.data.checkoutSessionId },
    include: { stockReservations: true },
  })
  const unconfirmedOrder = await prisma.order.findUnique({
    where: { id: unconfirmedOrderId },
    include: { funds: true },
  })
  const deliveredOrder = await prisma.order.findUnique({
    where: { id: deliveredOrderId },
    include: { funds: true },
  })
  assert(expiredCheckout?.status === 'EXPIRED', `expected EXPIRED checkout, got ${expiredCheckout?.status}`)
  assert(expiredCheckout.stockReservations.every((reservation) => reservation.status === 'RELEASED'), 'expected abandoned checkout reservations released')
  assert(unconfirmedOrder?.status === 'CANCELLED', `expected CANCELLED unconfirmed order, got ${unconfirmedOrder?.status}`)
  assert(unconfirmedOrder.funds?.status === 'RETURNED_TO_BUYER', `expected RETURNED_TO_BUYER funds, got ${unconfirmedOrder.funds?.status}`)
  assert(deliveredOrder?.status === 'COMPLETED', `expected COMPLETED delivered order, got ${deliveredOrder?.status}`)
  assert(deliveredOrder.funds?.status === 'RELEASABLE', `expected RELEASABLE funds, got ${deliveredOrder.funds?.status}`)
  record('H2-ORDER-MAINTENANCE-02', 'maintenance command processes checkout expiry, confirmation timeout and delivery timeout in one run')

  const replay = runMaintenance()
  assert(replay.checkoutExpiry.expired === 0, `expected zero replay checkout expiries, got ${replay.checkoutExpiry.expired}`)
  assert(replay.confirmationTimeout.cancelled === 0, `expected zero replay confirmation cancellations, got ${replay.confirmationTimeout.cancelled}`)
  assert(replay.deliveryTimeout.completed === 0, `expected zero replay delivery completions, got ${replay.deliveryTimeout.completed}`)
  record('H2-ORDER-MAINTENANCE-03', 'maintenance command replay is a no-op across all order jobs')

  const audits = await prisma.auditEvent.findMany({
    where: {
      OR: [
        { resourceId: unconfirmedOrderId, action: 'ORDER_AUTO_CANCELLED_CONFIRMATION_TIMEOUT' },
        { resourceId: deliveredOrderId, action: 'ORDER_AUTO_COMPLETED_DELIVERY_TIMEOUT' },
      ],
    },
  })
  assert(audits.length >= 2, `expected auto-cancel and auto-complete audit evidence, got ${audits.length}`)
  const notifications = await prisma.notificationOutbox.findMany({
    where: {
      OR: [
        { referenceId: unconfirmedOrderId, eventType: { in: ['ORDER_AUTO_CANCELLED_BUYER', 'ORDER_AUTO_CANCELLED_VENDOR'] } },
        { referenceId: deliveredOrderId, eventType: { in: ['ORDER_AUTO_COMPLETED_BUYER', 'ORDER_AUTO_COMPLETED_VENDOR'] } },
      ],
    },
  })
  assert(notifications.length >= 4, `expected buyer/vendor notifications for order jobs, got ${notifications.length}`)
  record('H2-ORDER-MAINTENANCE-04', 'maintenance command preserves audit and notification evidence for order timeout jobs')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    checkoutSessionId: abandonedCheckout.data.checkoutSessionId,
    unconfirmedOrderId,
    deliveredOrderId,
    firstRun,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
