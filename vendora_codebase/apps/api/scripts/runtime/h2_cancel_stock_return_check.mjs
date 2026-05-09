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
  const buyer = await upsertVerifiedUser(`h2-cancel-stock-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h2-cancel-stock-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H2CANCEL${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H2 Cancel Stock Vendor ${suffix}`,
  })
  const products = {
    manual: await ensureProductFixture({
      id: `h2-cancel-stock-manual-${suffix}`,
      vendorId: vendor.id,
      name: `H2 Cancel Stock Manual ${suffix}`,
      price: 37,
      stock: 2,
    }),
    timeout: await ensureProductFixture({
      id: `h2-cancel-stock-timeout-${suffix}`,
      vendorId: vendor.id,
      name: `H2 Cancel Stock Timeout ${suffix}`,
      price: 41,
      stock: 2,
    }),
  }
  await clearBuyerCart(buyer.id)
  return { buyer, vendorUser, products }
}

async function createPaymentHeldOrder({ buyerToken, productId, keyPrefix, suffix }) {
  const cart = await request('/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ listingId: productId, quantity: 1 }),
  })

  const checkout = await request('/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${buyerToken}`,
      'Idempotency-Key': `${keyPrefix}-${suffix}`,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: shippingAddress('H2 Cancel Stock Buyer'),
    }),
  })

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

  const manualOrderId = await createPaymentHeldOrder({
    buyerToken,
    productId: products.manual.id,
    keyPrefix: 'h2-cancel-stock-manual',
    suffix,
  })
  const manualAfterPayment = await prisma.product.findUnique({ where: { id: products.manual.id } })
  assert(manualAfterPayment?.stock === 1, `expected manual product stock 1 after paid order, got ${manualAfterPayment?.stock}`)
  record('H2-CANCEL-STOCK-01', 'payment-held order keeps committed checkout stock unavailable before cancellation')

  await request(`/vendor/orders/${manualOrderId}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({}),
  })
  const manualCancelled = await prisma.order.findUnique({
    where: { id: manualOrderId },
    include: { funds: true },
  })
  const manualAfterCancel = await prisma.product.findUnique({ where: { id: products.manual.id } })
  assert(manualCancelled?.status === 'CANCELLED', `expected manual order CANCELLED, got ${manualCancelled?.status}`)
  assert(manualCancelled.funds?.status === 'RETURNED_TO_BUYER', `expected manual fund RETURNED_TO_BUYER, got ${manualCancelled.funds?.status}`)
  assert(manualAfterCancel?.stock === 2, `expected manual product stock restored to 2, got ${manualAfterCancel?.stock}`)
  record('H2-CANCEL-STOCK-02', 'vendor cancellation from PAYMENT_HELD returns held funds and restores product stock')

  await clearBuyerCart(buyer.id)
  const timeoutOrderId = await createPaymentHeldOrder({
    buyerToken,
    productId: products.timeout.id,
    keyPrefix: 'h2-cancel-stock-timeout',
    suffix,
  })
  await prisma.order.update({
    where: { id: timeoutOrderId },
    data: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
  })
  const timeoutAfterPayment = await prisma.product.findUnique({ where: { id: products.timeout.id } })
  assert(timeoutAfterPayment?.stock === 1, `expected timeout product stock 1 after paid order, got ${timeoutAfterPayment?.stock}`)

  const autoCancelled = autoCancelUnconfirmed()
  assert(autoCancelled.cancelled === 1, `expected one auto-cancelled order, got ${autoCancelled.cancelled}`)
  const timeoutCancelled = await prisma.order.findUnique({
    where: { id: timeoutOrderId },
    include: { funds: true },
  })
  const timeoutAfterCancel = await prisma.product.findUnique({ where: { id: products.timeout.id } })
  assert(timeoutCancelled?.status === 'CANCELLED', `expected timeout order CANCELLED, got ${timeoutCancelled?.status}`)
  assert(timeoutCancelled.funds?.status === 'RETURNED_TO_BUYER', `expected timeout fund RETURNED_TO_BUYER, got ${timeoutCancelled.funds?.status}`)
  assert(timeoutAfterCancel?.stock === 2, `expected timeout product stock restored to 2, got ${timeoutAfterCancel?.stock}`)
  record('H2-CANCEL-STOCK-03', 'confirmation timeout auto-cancel returns held funds and restores product stock')

  const replayed = autoCancelUnconfirmed()
  assert(replayed.cancelled === 0, `expected zero replay cancellations, got ${replayed.cancelled}`)
  const timeoutAfterReplay = await prisma.product.findUnique({ where: { id: products.timeout.id } })
  assert(timeoutAfterReplay?.stock === 2, `expected replay to leave timeout product stock 2, got ${timeoutAfterReplay?.stock}`)
  const audit = await prisma.auditEvent.findFirst({
    where: { resourceId: timeoutOrderId, action: 'ORDER_AUTO_CANCELLED_CONFIRMATION_TIMEOUT' },
  })
  assert(audit?.metadata?.returnedStockQuantity === 1, `expected returnedStockQuantity audit metadata 1, got ${audit?.metadata?.returnedStockQuantity}`)
  record('H2-CANCEL-STOCK-04', 'auto-cancel replay does not restore stock twice and writes returned stock audit evidence')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    manualOrderId,
    timeoutOrderId,
    autoCancelled,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
