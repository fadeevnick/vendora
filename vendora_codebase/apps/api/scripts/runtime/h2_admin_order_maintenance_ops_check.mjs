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
      'Idempotency-Key': `h2-admin-maintenance-${suffix}`,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: shippingAddress('H2 Admin Maintenance Buyer'),
    }),
  })
  const webhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `h2-admin-maintenance-payment-${checkout.data.checkoutSessionId}`,
      checkoutSessionId: checkout.data.checkoutSessionId,
      eventType: 'PAYMENT_SUCCEEDED',
    }),
  })
  assert(webhook.data.orderIds.length === 1, `expected one order, got ${webhook.data.orderIds.length}`)
  return webhook.data.orderIds[0]
}

async function main() {
  const suffix = runtimeSuffix()
  const buyer = await upsertVerifiedUser(`h2-admin-maintenance-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h2-admin-maintenance-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H2ADMJ${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H2 Admin Maintenance Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h2-admin-maintenance-product-${suffix}`,
    vendorId: vendor.id,
    name: `H2 Admin Maintenance Product ${suffix}`,
    price: 37,
    stock: 6,
  })
  await clearBuyerCart(buyer.id)

  const buyerToken = await login(buyer.email)
  const adminToken = await login('admin@vendora.com', true)
  const orderId = await createPaymentHeldOrder({ buyerToken, productId: product.id, suffix })
  const past = new Date(Date.now() - 48 * 60 * 60 * 1000)
  await prisma.order.update({
    where: { id: orderId },
    data: { createdAt: past },
  })

  await expectHttpError('/admin/ops/order-maintenance/run', buyerToken, 403, 'FORBIDDEN', {
    method: 'POST',
    body: JSON.stringify({ dryRun: true }),
  })
  record('H2-ADMIN-MAINTENANCE-OPS-01', 'order maintenance run endpoint is admin-only')

  const dryRun = await request('/admin/ops/order-maintenance/run', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      dryRun: true,
      limit: 10,
      confirmationOlderThanHours: 24,
      deliveryOlderThanHours: 24,
    }),
  })
  assert(dryRun.data.mode === 'DRY_RUN', `expected DRY_RUN mode, got ${dryRun.data.mode}`)
  assert(dryRun.data.executed === false, 'dry run should not execute maintenance jobs')
  assert(dryRun.data.backlog.confirmationTimeoutDue >= 1, `expected confirmation backlog >= 1, got ${dryRun.data.backlog.confirmationTimeoutDue}`)
  const orderAfterDryRun = await prisma.order.findUnique({ where: { id: orderId }, include: { funds: true } })
  assert(orderAfterDryRun?.status === 'PAYMENT_HELD', `dry run should not mutate order, got ${orderAfterDryRun?.status}`)
  assert(orderAfterDryRun.funds?.status === 'HELD', `dry run should not mutate funds, got ${orderAfterDryRun.funds?.status}`)
  record('H2-ADMIN-MAINTENANCE-OPS-02', 'admin dry-run exposes due order maintenance backlog without mutating order state')

  const executed = await request('/admin/ops/order-maintenance/run', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      dryRun: false,
      limit: 10,
      confirmationOlderThanHours: 24,
      deliveryOlderThanHours: 24,
    }),
  })
  assert(executed.data.mode === 'EXECUTE', `expected EXECUTE mode, got ${executed.data.mode}`)
  assert(executed.data.executed === true, 'execute mode should run maintenance jobs')
  assert(executed.data.result.confirmationTimeout.cancelled >= 1, `expected at least one cancellation, got ${executed.data.result.confirmationTimeout.cancelled}`)
  const orderAfterExecute = await prisma.order.findUnique({ where: { id: orderId }, include: { funds: true } })
  assert(orderAfterExecute?.status === 'CANCELLED', `expected order CANCELLED, got ${orderAfterExecute?.status}`)
  assert(orderAfterExecute.funds?.status === 'RETURNED_TO_BUYER', `expected funds RETURNED_TO_BUYER, got ${orderAfterExecute.funds?.status}`)
  record('H2-ADMIN-MAINTENANCE-OPS-03', 'admin execute mode runs shared order maintenance and processes due confirmation timeout orders')

  const audit = await prisma.auditEvent.findFirst({
    where: {
      actorUserId: { not: null },
      resourceType: 'order_maintenance',
      action: 'ADMIN_ORDER_MAINTENANCE_RUN',
    },
    orderBy: { createdAt: 'desc' },
  })
  assert(audit?.metadata?.result?.confirmationTimeout?.cancelled >= 1, 'admin maintenance run should write result audit evidence')
  record('H2-ADMIN-MAINTENANCE-OPS-04', 'admin order maintenance execute writes durable audit evidence')

  const replay = await request('/admin/ops/order-maintenance/run', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      dryRun: false,
      limit: 10,
      confirmationOlderThanHours: 24,
      deliveryOlderThanHours: 24,
    }),
  })
  assert(replay.data.result.confirmationTimeout.cancelled === 0, `expected replay cancellation count 0, got ${replay.data.result.confirmationTimeout.cancelled}`)
  record('H2-ADMIN-MAINTENANCE-OPS-05', 'admin order maintenance execute is replay-safe for already processed rows')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    orderId,
    dryRunBacklog: dryRun.data.backlog,
    executed: executed.data.result,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
