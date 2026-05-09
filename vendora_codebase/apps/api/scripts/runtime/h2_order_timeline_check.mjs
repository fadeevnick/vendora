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
      'Idempotency-Key': `h2-order-timeline-${suffix}`,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: shippingAddress('H2 Order Timeline Buyer'),
    }),
  })

  const webhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `h2-order-timeline-payment-${checkout.data.checkoutSessionId}`,
      checkoutSessionId: checkout.data.checkoutSessionId,
      eventType: 'PAYMENT_SUCCEEDED',
    }),
  })

  assert(webhook.data.orderIds.length === 1, `expected one order, got ${webhook.data.orderIds.length}`)
  return webhook.data.orderIds[0]
}

function codes(timeline) {
  return timeline.map((event) => event.code)
}

function assertOrderedSubset(actual, expected) {
  let cursor = -1
  for (const code of expected) {
    const index = actual.indexOf(code)
    assert(index > cursor, `expected ${code} after index ${cursor}; got ${actual.join(', ')}`)
    cursor = index
  }
}

async function main() {
  const suffix = runtimeSuffix()
  const buyer = await upsertVerifiedUser(`h2-order-timeline-buyer-${suffix}@vendora.local`, 'BUYER')
  const otherBuyer = await upsertVerifiedUser(`h2-order-timeline-other-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h2-order-timeline-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const otherVendorUser = await upsertVerifiedUser(`h2-order-timeline-other-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H2TIME${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H2 Order Timeline Vendor ${suffix}`,
  })
  await ensureVendorFixture({
    user: otherVendorUser,
    inn: `H2TMO${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H2 Other Timeline Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h2-order-timeline-product-${suffix}`,
    vendorId: vendor.id,
    name: `H2 Order Timeline Product ${suffix}`,
    price: 31,
    stock: 5,
  })

  await clearBuyerCart(buyer.id)
  const buyerToken = await login(buyer.email)
  const otherBuyerToken = await login(otherBuyer.email)
  const vendorToken = await login(vendorUser.email)
  const otherVendorToken = await login(otherVendorUser.email)
  const orderId = await createPaidOrder({ buyerToken, productId: product.id, suffix })

  let buyerDetail = await request(`/buyer/orders/${orderId}`, { headers: { Authorization: `Bearer ${buyerToken}` } })
  assert(Array.isArray(buyerDetail.data.timeline), 'buyer order detail should include timeline')
  assert(buyerDetail.data.timeline[0].code === 'ORDER_PAYMENT_HELD', `expected first timeline event ORDER_PAYMENT_HELD, got ${buyerDetail.data.timeline[0]?.code}`)
  assert(buyerDetail.data.timeline[0].actor === 'system', 'payment-held timeline event should be system-authored')
  record('H2-ORDER-TIMELINE-01', 'buyer order detail exposes a chronological timeline with order-created/payment-held event')

  await request(`/vendor/orders/${orderId}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({}),
  })
  await request(`/vendor/orders/${orderId}/ship`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({ carrier: 'Runtime Carrier', trackingNumber: `TIMELINE-${suffix}`.slice(0, 48) }),
  })
  await request(`/buyer/orders/${orderId}/mark-delivered`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({}),
  })
  await request(`/buyer/orders/${orderId}/confirm-receipt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({}),
  })

  buyerDetail = await request(`/buyer/orders/${orderId}`, { headers: { Authorization: `Bearer ${buyerToken}` } })
  const buyerCodes = codes(buyerDetail.data.timeline)
  assertOrderedSubset(buyerCodes, [
    'ORDER_PAYMENT_HELD',
    'ORDER_VENDOR_CONFIRMED',
    'ORDER_VENDOR_SHIPPED',
    'ORDER_BUYER_MARKED_DELIVERED',
    'ORDER_BUYER_RECEIPT_CONFIRMED',
  ])
  const shipped = buyerDetail.data.timeline.find((event) => event.code === 'ORDER_VENDOR_SHIPPED')
  assert(shipped?.actor === 'vendor', `expected shipped actor vendor, got ${shipped?.actor}`)
  assert(shipped?.metadata?.shipmentTrackingNumber, 'shipped timeline event should preserve tracking metadata')
  const completed = buyerDetail.data.timeline.find((event) => event.code === 'ORDER_BUYER_RECEIPT_CONFIRMED')
  assert(completed?.actor === 'buyer', `expected completed actor buyer, got ${completed?.actor}`)
  assert(completed?.status === 'COMPLETED', `expected completed timeline status COMPLETED, got ${completed?.status}`)
  record('H2-ORDER-TIMELINE-02', 'buyer order timeline records confirm, ship, delivered and completed lifecycle events with actor metadata')

  const vendorDetail = await request(`/vendor/orders/${orderId}`, { headers: { Authorization: `Bearer ${vendorToken}` } })
  assertOrderedSubset(codes(vendorDetail.data.timeline), buyerCodes)
  assert(vendorDetail.data.timeline.length === buyerDetail.data.timeline.length, 'vendor and buyer detail should expose same scoped order timeline')
  record('H2-ORDER-TIMELINE-03', 'vendor order detail exposes the same tenant-scoped lifecycle timeline')

  await request(`/buyer/orders/${orderId}`, { headers: { Authorization: `Bearer ${buyerToken}` } })
  try {
    await request(`/buyer/orders/${orderId}`, { headers: { Authorization: `Bearer ${otherBuyerToken}` } })
    throw new Error('other buyer unexpectedly read order timeline')
  } catch (err) {
    assert(err.status === 404 && err.code === 'RESOURCE_NOT_FOUND', `expected other buyer 404, got ${err.status}/${err.code}`)
  }
  try {
    await request(`/vendor/orders/${orderId}`, { headers: { Authorization: `Bearer ${otherVendorToken}` } })
    throw new Error('other vendor unexpectedly read order timeline')
  } catch (err) {
    assert(err.status === 404 && err.code === 'RESOURCE_NOT_FOUND', `expected other vendor 404, got ${err.status}/${err.code}`)
  }
  record('H2-ORDER-TIMELINE-04', 'order timeline remains protected by buyer self-scope and vendor tenant-scope')

  const auditCount = await prisma.auditEvent.count({
    where: {
      resourceType: 'order',
      resourceId: orderId,
      action: {
        in: [
          'ORDER_VENDOR_CONFIRMED',
          'ORDER_VENDOR_SHIPPED',
          'ORDER_BUYER_MARKED_DELIVERED',
          'ORDER_BUYER_RECEIPT_CONFIRMED',
        ],
      },
    },
  })
  assert(auditCount >= 4, `expected durable audit source events for timeline, got ${auditCount}`)
  record('H2-ORDER-TIMELINE-05', 'timeline is backed by durable order audit events')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    orderId,
    timeline: buyerDetail.data.timeline.map((event) => ({
      code: event.code,
      status: event.status,
      actor: event.actor,
    })),
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
