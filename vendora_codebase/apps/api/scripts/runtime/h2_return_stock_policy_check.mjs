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

async function createDeliveredOrder({ buyerToken, vendorToken, productId, suffix, quantity }) {
  const cart = await request('/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ listingId: productId, quantity }),
  })

  const checkout = await request('/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${buyerToken}`,
      'Idempotency-Key': `h2-return-stock-policy-${suffix}`,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: shippingAddress('H2 Return Stock Policy Buyer'),
    }),
  })

  const webhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `h2-return-stock-policy-payment-${checkout.data.checkoutSessionId}`,
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
    body: JSON.stringify({ carrier: 'Runtime RMA Carrier', trackingNumber: `RMA-${suffix}`.slice(0, 48) }),
  })
  await request(`/buyer/orders/${orderId}/mark-delivered`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({}),
  })

  return orderId
}

async function main() {
  const suffix = runtimeSuffix()
  const quantity = 2
  const startingStock = 9
  const buyer = await upsertVerifiedUser(`h2-return-stock-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h2-return-stock-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H2RMA${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H2 Return Stock Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h2-return-stock-product-${suffix}`,
    vendorId: vendor.id,
    name: `H2 Return Stock Product ${suffix}`,
    price: 37,
    stock: startingStock,
  })
  await clearBuyerCart(buyer.id)

  const buyerToken = await login(buyer.email)
  const vendorToken = await login(vendorUser.email)
  const adminToken = await login('admin@vendora.com', true)

  const orderId = await createDeliveredOrder({
    buyerToken,
    vendorToken,
    productId: product.id,
    suffix,
    quantity,
  })

  const stockAfterShipment = await prisma.product.findUnique({ where: { id: product.id } })
  assert(stockAfterShipment?.stock === startingStock - quantity, `expected stock ${startingStock - quantity} after shipment, got ${stockAfterShipment?.stock}`)
  record('H2-RETURN-STOCK-01', 'delivered order keeps checkout-reserved quantity out of available stock')

  const dispute = await request(`/buyer/orders/${orderId}/disputes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ reason: 'Runtime returned item requires inspection before restock' }),
  })
  await request(`/vendor/disputes/${dispute.data.id}/respond`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({ message: 'Runtime vendor response for RMA stock policy' }),
  })
  await request(`/admin/disputes/${dispute.data.id}/resolve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ resolutionType: 'BUYER_FAVOR_FULL_REFUND' }),
  })

  const stockAfterRefund = await prisma.product.findUnique({ where: { id: product.id } })
  assert(stockAfterRefund?.stock === stockAfterShipment.stock, `expected refund not to restock shipped item; before=${stockAfterShipment.stock} after=${stockAfterRefund?.stock}`)
  record('H2-RETURN-STOCK-02', 'buyer-favor refund after shipment does not automatically restock product inventory')

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { funds: true },
  })
  assert(order?.status === 'CANCELLED', `expected refunded order CANCELLED, got ${order?.status}`)
  assert(order?.funds?.status === 'RETURNED_TO_BUYER', `expected returned funds, got ${order?.funds?.status}`)

  const audit = await prisma.auditEvent.findFirst({
    where: {
      resourceType: 'dispute',
      resourceId: dispute.data.id,
      action: 'DISPUTE_RESOLVED',
    },
    orderBy: { createdAt: 'desc' },
  })
  assert(audit?.metadata?.stockPolicy === 'NO_AUTO_RESTOCK_AFTER_SHIPMENT', `expected NO_AUTO_RESTOCK_AFTER_SHIPMENT, got ${audit?.metadata?.stockPolicy}`)
  assert(audit?.metadata?.restockedQuantity === 0, `expected restockedQuantity=0, got ${audit?.metadata?.restockedQuantity}`)
  assert(audit?.metadata?.returnInspectionRequired === true, 'expected returnInspectionRequired=true')
  record('H2-RETURN-STOCK-03', 'dispute resolution audit records no-auto-restock policy and inspection requirement')

  const notifications = await prisma.notificationOutbox.findMany({
    where: {
      referenceId: dispute.data.id,
      eventType: { in: ['DISPUTE_RESOLVED_BUYER', 'DISPUTE_RESOLVED_VENDOR'] },
    },
  })
  assert(notifications.length >= 2, `expected buyer/vendor dispute resolution notifications, got ${notifications.length}`)
  assert(notifications.every((notification) => notification.payload?.stockPolicy === 'NO_AUTO_RESTOCK_AFTER_SHIPMENT'), 'resolution notifications should carry stock policy')
  record('H2-RETURN-STOCK-04', 'buyer/vendor dispute resolution notifications carry return stock policy metadata')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    orderId,
    disputeId: dispute.data.id,
    stockAfterShipment: stockAfterShipment.stock,
    stockAfterRefund: stockAfterRefund.stock,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
