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
  const buyer = await upsertVerifiedUser(`h2-fulfillment-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h2-fulfillment-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H2FULFILL${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H2 Fulfillment Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h2-fulfillment-product-${suffix}`,
    vendorId: vendor.id,
    name: `H2 Fulfillment Product ${suffix}`,
    price: 23,
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
      'Idempotency-Key': `h2-fulfillment-${suffix}`,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: shippingAddress('H2 Fulfillment Buyer'),
    }),
  })

  const webhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `h2-fulfillment-payment-${checkout.data.checkoutSessionId}`,
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

  const confirmed = await request(`/vendor/orders/${orderId}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({}),
  })
  assert(confirmed.data.status === 'CONFIRMED', `expected CONFIRMED, got ${confirmed.data.status}`)

  const trackingNumber = `TRACK-${suffix}`.replace(/[^A-Z0-9-]/g, '').slice(0, 48)
  const shipped = await request(`/vendor/orders/${orderId}/ship`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({
      carrier: 'Runtime Carrier',
      trackingNumber,
      metadata: { serviceLevel: 'standard', runtime: 'h2-fulfillment' },
    }),
  })
  assert(shipped.data.status === 'SHIPPED', `expected SHIPPED, got ${shipped.data.status}`)
  assert(shipped.data.shipmentCarrier === 'Runtime Carrier', 'shipped order should persist carrier')
  assert(shipped.data.shipmentTrackingNumber === trackingNumber, 'shipped order should persist tracking number')
  assert(shipped.data.shippedAt, 'shipped order should persist shippedAt')
  record('H2-FULFILLMENT-01', 'vendor ship transition captures shipment carrier, tracking number and shipped timestamp')

  await expectHttpError(`/buyer/orders/${orderId}/confirm-receipt`, vendorToken, 403, 'FORBIDDEN', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  record('H2-FULFILLMENT-02', 'vendor cannot use buyer delivery/receipt endpoint')

  const delivered = await request(`/buyer/orders/${orderId}/mark-delivered`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({}),
  })
  assert(delivered.data.status === 'DELIVERED', `expected DELIVERED, got ${delivered.data.status}`)
  assert(delivered.data.deliveredAt, 'delivered order should persist deliveredAt')
  assert(delivered.data.funds.status === 'HELD', `delivered order should keep funds HELD, got ${delivered.data.funds.status}`)
  record('H2-FULFILLMENT-03', 'buyer delivery confirmation moves SHIPPED to DELIVERED while funds remain held')

  await expectHttpError(`/buyer/orders/${orderId}/mark-delivered`, buyerToken, 409, 'ORDER_INVALID_STATE', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  record('H2-FULFILLMENT-04', 'duplicate delivery confirmation is rejected by order state')

  const completed = await request(`/buyer/orders/${orderId}/confirm-receipt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({}),
  })
  assert(completed.data.status === 'COMPLETED', `expected COMPLETED, got ${completed.data.status}`)
  assert(completed.data.funds.status === 'RELEASABLE', `expected RELEASABLE funds, got ${completed.data.funds.status}`)
  record('H2-FULFILLMENT-05', 'buyer receipt completes DELIVERED order and moves funds to releasable')

  const auditCount = await prisma.auditEvent.count({
    where: {
      resourceId: orderId,
      action: { in: ['ORDER_VENDOR_SHIPPED', 'ORDER_BUYER_MARKED_DELIVERED', 'ORDER_BUYER_RECEIPT_CONFIRMED'] },
    },
  })
  assert(auditCount >= 3, `expected fulfillment audit evidence, got ${auditCount}`)
  record('H2-FULFILLMENT-06', 'shipment, delivery and receipt transitions write audit evidence')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    orderId,
    trackingNumber,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
