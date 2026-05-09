import { execFileSync } from 'node:child_process'
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

function parseJson(output, label) {
  const jsonStart = output.indexOf('{')
  assert(jsonStart >= 0, `${label} output did not include JSON: ${output}`)
  return JSON.parse(output.slice(jsonStart))
}

function runNpm(script, args = []) {
  return parseJson(execFileSync('npm', ['run', script, '--workspace', 'apps/api', ...args], {
    cwd: new URL('../../../..', import.meta.url).pathname,
    env: process.env,
    encoding: 'utf8',
  }), script)
}

function drainPayouts(vendorId) {
  return parseJson(execFileSync('npm', ['run', 'payouts:drain', '--', '--limit=10', `--vendor-id=${vendorId}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PAYOUT_PROVIDER: 'dev_mock',
    },
    encoding: 'utf8',
  }), 'payout drain')
}

async function setupFixtures(suffix) {
  const buyer = await upsertVerifiedUser(`h1-partial-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h1-partial-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H1PARTIAL${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H1 Partial Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h1-partial-product-${suffix}`,
    vendorId: vendor.id,
    name: `H1 Partial Product ${suffix}`,
    price: 37,
    stock: 8,
  })
  await clearBuyerCart(buyer.id)
  return { buyer, vendorUser, vendor, product }
}

async function createShippedOrder({ buyerToken, vendorToken, productId, suffix }) {
  const cart = await request('/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ listingId: productId, quantity: 1 }),
  })

  const checkout = await request('/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${buyerToken}`,
      'Idempotency-Key': `h1-partial-${suffix}`,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: shippingAddress('H1 Partial Buyer'),
    }),
  })

  const webhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `h1-partial-payment-${checkout.data.checkoutSessionId}`,
      checkoutSessionId: checkout.data.checkoutSessionId,
      eventType: 'PAYMENT_SUCCEEDED',
    }),
  })
  assert(webhook.data.orderIds.length === 1, 'partial refund fixture should create one order')
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

async function openAndRespond({ buyerToken, vendorToken, orderId }) {
  const dispute = await request(`/buyer/orders/${orderId}/disputes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ reason: 'Runtime partial refund proof' }),
  })
  await request(`/vendor/disputes/${dispute.data.id}/respond`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({ message: 'Runtime partial refund vendor response' }),
  })
  return dispute.data
}

async function main() {
  const suffix = runtimeSuffix()
  const { buyer, vendorUser, vendor, product } = await setupFixtures(suffix)
  const buyerToken = await login(buyer.email)
  const vendorToken = await login(vendorUser.email)
  const adminToken = await login('admin@vendora.com', true)
  const partialRefundMinor = 900
  const orderTotalMinor = 3700
  const vendorRemainderMinor = orderTotalMinor - partialRefundMinor

  const orderId = await createShippedOrder({
    buyerToken,
    vendorToken,
    productId: product.id,
    suffix,
  })
  const dispute = await openAndRespond({ buyerToken, vendorToken, orderId })

  await expectHttpError(`/admin/disputes/${dispute.id}/resolve`, adminToken, 400, 'VALIDATION_ERROR', {
    method: 'POST',
    body: JSON.stringify({
      resolutionType: 'BUYER_FAVOR_PARTIAL_REFUND',
      refundAmountMinor: orderTotalMinor,
    }),
  })
  const stillReview = await prisma.dispute.findUnique({
    where: { id: dispute.id },
    include: { order: { include: { funds: true } } },
  })
  assert(stillReview?.status === 'PLATFORM_REVIEW', `invalid partial amount should keep dispute in PLATFORM_REVIEW, got ${stillReview?.status}`)
  assert(stillReview?.order.funds?.status === 'FROZEN_DISPUTE', `invalid partial amount should keep fund frozen, got ${stillReview?.order.funds?.status}`)
  record('H1-PARTIAL-REFUND-01', 'invalid partial refund amount is rejected without changing dispute or fund state')

  const resolved = await request(`/admin/disputes/${dispute.id}/resolve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      resolutionType: 'BUYER_FAVOR_PARTIAL_REFUND',
      refundAmountMinor: partialRefundMinor,
    }),
  })
  assert(resolved.data.status === 'RESOLVED', 'partial refund dispute should resolve')
  assert(resolved.data.resolutionType === 'BUYER_FAVOR_PARTIAL_REFUND', `expected partial refund resolution, got ${resolved.data.resolutionType}`)

  const refundExecution = await prisma.refundProviderExecution.findUnique({
    where: { disputeId: dispute.id },
  })
  assert(refundExecution?.status === 'SUCCEEDED', `expected partial refund provider SUCCEEDED, got ${refundExecution?.status}`)
  assert(refundExecution.amountMinor === partialRefundMinor, `expected partial refund ${partialRefundMinor}, got ${refundExecution.amountMinor}`)
  record('H1-PARTIAL-REFUND-02', 'partial refund creates provider refund execution for only the requested amount')

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { funds: true },
  })
  assert(order?.status === 'COMPLETED', `partial refund order should complete, got ${order?.status}`)
  assert(order?.funds?.status === 'RELEASABLE', `partial refund fund should be RELEASABLE for vendor remainder, got ${order?.funds?.status}`)
  assert(order.funds.refundedAmountMinor === partialRefundMinor, `expected fund refundedAmountMinor ${partialRefundMinor}, got ${order.funds.refundedAmountMinor}`)
  const refundedLedger = await prisma.vendorBalanceLedger.findFirst({
    where: { referenceId: dispute.id, entryType: 'REFUNDED' },
  })
  const releasedLedger = await prisma.vendorBalanceLedger.findFirst({
    where: { referenceId: dispute.id, entryType: 'RELEASED' },
  })
  assert(refundedLedger?.amountMinor === partialRefundMinor, `expected REFUNDED ledger ${partialRefundMinor}, got ${refundedLedger?.amountMinor}`)
  assert(releasedLedger?.amountMinor === vendorRemainderMinor, `expected RELEASED ledger ${vendorRemainderMinor}, got ${releasedLedger?.amountMinor}`)
  record('H1-PARTIAL-REFUND-03', 'partial refund splits fund evidence into refunded amount and vendor-releasable remainder')

  const drain = drainPayouts(vendor.id)
  assert(drain.paidOut === 1, `expected one paid-out partial remainder, got ${drain.paidOut}`)
  const payoutExecution = await prisma.payoutProviderExecution.findUnique({
    where: { orderFundId: order.funds.id },
  })
  assert(payoutExecution?.amountMinor === vendorRemainderMinor, `expected payout remainder ${vendorRemainderMinor}, got ${payoutExecution?.amountMinor}`)
  const paidFund = await prisma.orderFund.findUnique({ where: { id: order.funds.id } })
  assert(paidFund?.status === 'PAID_OUT', `expected partial remainder fund PAID_OUT, got ${paidFund?.status}`)

  const reconciliation = runNpm('money:reconcile', ['--', '--limit=250'])
  assert(reconciliation.ok === true, 'money reconciliation should return ok after partial refund')
  assert(reconciliation.mismatches === 0, `expected zero reconciliation mismatches, got ${reconciliation.mismatches}`)
  const run = await prisma.moneyReconciliationRun.findUnique({
    where: { id: reconciliation.runId },
    include: { items: true },
  })
  assert(run.items.some((item) => item.resourceId === refundExecution.id && item.status === 'MATCHED'), 'reconciliation should match partial refund execution')
  assert(run.items.some((item) => item.resourceId === payoutExecution.id && item.status === 'MATCHED'), 'reconciliation should match partial payout remainder')
  record('H1-PARTIAL-REFUND-04', 'partial refund remainder payout and reconciliation evidence both match')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    disputeId: dispute.id,
    refundProviderExecutionId: refundExecution.id,
    payoutProviderExecutionId: payoutExecution.id,
    reconciliationRunId: run.id,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
