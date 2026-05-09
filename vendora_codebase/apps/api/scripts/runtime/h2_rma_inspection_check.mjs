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

async function createRefundedShippedDispute({ buyerToken, vendorToken, adminToken, productId, suffix, quantity }) {
  const cart = await request('/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ listingId: productId, quantity }),
  })
  const checkout = await request('/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${buyerToken}`,
      'Idempotency-Key': `h2-rma-inspection-${suffix}`,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: shippingAddress('H2 RMA Inspection Buyer'),
    }),
  })
  const webhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `h2-rma-inspection-payment-${checkout.data.checkoutSessionId}`,
      checkoutSessionId: checkout.data.checkoutSessionId,
      eventType: 'PAYMENT_SUCCEEDED',
    }),
  })
  assert(webhook.data.orderIds.length === 1, `expected one order, got ${webhook.data.orderIds.length}`)
  const orderId = webhook.data.orderIds[0]
  await request(`/vendor/orders/${orderId}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({}),
  })
  await request(`/vendor/orders/${orderId}/ship`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({ carrier: 'Runtime RMA Carrier', trackingNumber: `RMA-INSPECT-${suffix}`.slice(0, 48) }),
  })
  await request(`/buyer/orders/${orderId}/mark-delivered`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({}),
  })
  const dispute = await request(`/buyer/orders/${orderId}/disputes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ reason: 'Runtime RMA inspection restock proof' }),
  })
  await request(`/vendor/disputes/${dispute.data.id}/respond`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({ message: 'Runtime RMA inspection vendor response' }),
  })
  await request(`/admin/disputes/${dispute.data.id}/resolve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ resolutionType: 'BUYER_FAVOR_FULL_REFUND' }),
  })

  return { orderId, disputeId: dispute.data.id }
}

async function main() {
  const suffix = runtimeSuffix()
  const quantity = 2
  const startingStock = 10
  const buyer = await upsertVerifiedUser(`h2-rma-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h2-rma-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H2RMAI${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H2 RMA Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h2-rma-product-${suffix}`,
    vendorId: vendor.id,
    name: `H2 RMA Product ${suffix}`,
    price: 41,
    stock: startingStock,
  })
  await clearBuyerCart(buyer.id)

  const buyerToken = await login(buyer.email)
  const vendorToken = await login(vendorUser.email)
  const adminToken = await login('admin@vendora.com', true)
  const { disputeId } = await createRefundedShippedDispute({
    buyerToken,
    vendorToken,
    adminToken,
    productId: product.id,
    suffix,
    quantity,
  })

  const stockAfterRefund = await prisma.product.findUnique({ where: { id: product.id } })
  assert(stockAfterRefund?.stock === startingStock - quantity, `expected stock ${startingStock - quantity} before inspection, got ${stockAfterRefund?.stock}`)

  await expectHttpError('/admin/ops/return-inspections', buyerToken, 403, 'FORBIDDEN')
  const pending = await request('/admin/ops/return-inspections?status=PENDING', {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert(pending.data.some((inspection) => inspection.disputeId === disputeId), 'pending return inspections should include refunded shipped dispute')
  record('H2-RMA-INSPECTION-01', 'admin-only return inspection queue surfaces refunded shipped disputes pending inspection')

  const completed = await request(`/admin/ops/return-inspections/${disputeId}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ outcome: 'RESTOCK', note: 'Runtime inspection accepted item for resale' }),
  })
  assert(completed.data.status === 'COMPLETED', `expected completed inspection, got ${completed.data.status}`)
  assert(completed.data.restockedQuantity === quantity, `expected restocked quantity ${quantity}, got ${completed.data.restockedQuantity}`)
  const stockAfterInspection = await prisma.product.findUnique({ where: { id: product.id } })
  assert(stockAfterInspection?.stock === startingStock, `expected stock restored to ${startingStock}, got ${stockAfterInspection?.stock}`)
  record('H2-RMA-INSPECTION-02', 'admin return inspection completion can restock shipped refunded items exactly once')

  const audit = await prisma.auditEvent.findFirst({
    where: {
      resourceType: 'dispute',
      resourceId: disputeId,
      action: 'RETURN_INSPECTION_COMPLETED',
    },
  })
  assert(audit?.metadata?.outcome === 'RESTOCK', `expected audit outcome RESTOCK, got ${audit?.metadata?.outcome}`)
  assert(audit?.metadata?.restockedQuantity === quantity, `expected audit restocked quantity ${quantity}, got ${audit?.metadata?.restockedQuantity}`)
  record('H2-RMA-INSPECTION-03', 'return inspection completion writes durable audit evidence')

  const duplicate = await fetch(`${process.env.RUNTIME_API_URL ?? 'http://127.0.0.1:3001'}/admin/ops/return-inspections/${disputeId}/complete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ outcome: 'RESTOCK' }),
  })
  const duplicatePayload = await duplicate.json()
  assert(duplicate.status === 409, `expected duplicate inspection 409, got ${duplicate.status}`)
  assert(duplicatePayload.error?.code === 'OPS_INVALID_STATE', `expected OPS_INVALID_STATE, got ${duplicatePayload.error?.code}`)
  const stockAfterDuplicate = await prisma.product.findUnique({ where: { id: product.id } })
  assert(stockAfterDuplicate?.stock === startingStock, 'duplicate inspection should not restock twice')
  record('H2-RMA-INSPECTION-04', 'return inspection rejects duplicate completion and prevents double restock')

  const completedList = await request('/admin/ops/return-inspections?status=COMPLETED', {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert(completedList.data.some((inspection) => inspection.disputeId === disputeId && inspection.inspection), 'completed queue should include inspection evidence')
  record('H2-RMA-INSPECTION-05', 'completed return inspection queue exposes audit-backed inspection evidence')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    disputeId,
    stockAfterRefund: stockAfterRefund.stock,
    stockAfterInspection: stockAfterInspection.stock,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
