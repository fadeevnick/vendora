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

async function setupFixtures(suffix) {
  const buyer = await upsertVerifiedUser(`h1-refund-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h1-refund-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H1REFUND${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H1 Refund Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h1-refund-product-${suffix}`,
    vendorId: vendor.id,
    name: `H1 Refund Product ${suffix}`,
    price: 31,
    stock: 12,
  })
  await clearBuyerCart(buyer.id)
  return { buyer, vendorUser, product }
}

async function createShippedOrder({ buyerToken, vendorToken, productId, suffix, label }) {
  const cart = await request('/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ listingId: productId, quantity: 1 }),
  })

  const checkout = await request('/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${buyerToken}`,
      'Idempotency-Key': `h1-refund-${label}-${suffix}`,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: shippingAddress(`H1 Refund ${label}`),
    }),
  })

  const webhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `h1-refund-payment-${label}-${checkout.data.checkoutSessionId}`,
      checkoutSessionId: checkout.data.checkoutSessionId,
      eventType: 'PAYMENT_SUCCEEDED',
    }),
  })
  assert(webhook.data.orderIds.length === 1, 'refund fixture should create one order')
  const orderId = webhook.data.orderIds[0]

  await request(`/vendor/orders/${orderId}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({}),
  })
  await request(`/vendor/orders/${orderId}/ship`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({}),
  })

  return orderId
}

async function openAndRespond({ buyerToken, vendorToken, orderId, reason }) {
  const dispute = await request(`/buyer/orders/${orderId}/disputes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ reason }),
  })
  await request(`/vendor/disputes/${dispute.data.id}/respond`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({ message: 'Runtime refund provider response' }),
  })
  return dispute.data
}

async function main() {
  const suffix = runtimeSuffix()
  const { buyer, vendorUser, product } = await setupFixtures(suffix)
  const buyerToken = await login(buyer.email)
  const vendorToken = await login(vendorUser.email)
  const adminToken = await login('admin@vendora.com', true)

  const buyerFavorOrderId = await createShippedOrder({
    buyerToken,
    vendorToken,
    productId: product.id,
    suffix,
    label: 'buyer-favor',
  })
  const buyerFavorDispute = await openAndRespond({
    buyerToken,
    vendorToken,
    orderId: buyerFavorOrderId,
    reason: 'Runtime buyer-favor refund provider check',
  })

  const buyerResolved = await request(`/admin/disputes/${buyerFavorDispute.id}/resolve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ resolutionType: 'BUYER_FAVOR_FULL_REFUND' }),
  })
  assert(buyerResolved.data.status === 'RESOLVED', 'buyer-favor dispute should resolve')

  const refundExecution = await prisma.refundProviderExecution.findUnique({
    where: { disputeId: buyerFavorDispute.id },
  })
  assert(refundExecution?.providerName === 'dev_mock', `expected dev_mock refund provider, got ${refundExecution?.providerName}`)
  assert(refundExecution?.status === 'SUCCEEDED', `expected refund SUCCEEDED, got ${refundExecution?.status}`)
  assert(refundExecution?.providerRefundId?.startsWith('dev_mock_refund_'), 'refund should store provider refund id')
  const buyerFavorOrder = await prisma.order.findUnique({
    where: { id: buyerFavorOrderId },
    include: { funds: true },
  })
  assert(buyerFavorOrder?.status === 'CANCELLED', `buyer-favor order expected CANCELLED, got ${buyerFavorOrder?.status}`)
  assert(buyerFavorOrder?.funds?.status === 'RETURNED_TO_BUYER', `buyer-favor fund expected RETURNED_TO_BUYER, got ${buyerFavorOrder?.funds?.status}`)
  const refundedLedger = await prisma.vendorBalanceLedger.findFirst({
    where: { referenceId: buyerFavorDispute.id, entryType: 'REFUNDED' },
  })
  assert(Boolean(refundedLedger), 'buyer-favor resolution should create REFUNDED ledger entry')
  record('H1-REFUND-PROVIDER-01', 'buyer-favor dispute resolution creates dev_mock provider refund evidence')
  record('H1-REFUND-PROVIDER-02', 'provider refund evidence aligns with returned fund and refunded ledger state')

  const vendorFavorOrderId = await createShippedOrder({
    buyerToken,
    vendorToken,
    productId: product.id,
    suffix,
    label: 'vendor-favor',
  })
  const vendorFavorDispute = await openAndRespond({
    buyerToken,
    vendorToken,
    orderId: vendorFavorOrderId,
    reason: 'Runtime vendor-favor no-refund check',
  })
  await request(`/admin/disputes/${vendorFavorDispute.id}/resolve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ resolutionType: 'VENDOR_FAVOR_RELEASE' }),
  })
  const noRefundExecution = await prisma.refundProviderExecution.findUnique({
    where: { disputeId: vendorFavorDispute.id },
  })
  assert(!noRefundExecution, 'vendor-favor resolution should not create refund provider execution')
  const vendorFavorOrder = await prisma.order.findUnique({
    where: { id: vendorFavorOrderId },
    include: { funds: true },
  })
  assert(vendorFavorOrder?.status === 'COMPLETED', `vendor-favor order expected COMPLETED, got ${vendorFavorOrder?.status}`)
  assert(vendorFavorOrder?.funds?.status === 'RELEASABLE', `vendor-favor fund expected RELEASABLE, got ${vendorFavorOrder?.funds?.status}`)
  record('H1-REFUND-PROVIDER-03', 'vendor-favor dispute resolution releases funds without refund provider execution')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    buyerFavorDisputeId: buyerFavorDispute.id,
    refundProviderExecutionId: refundExecution.id,
    vendorFavorDisputeId: vendorFavorDispute.id,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
