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
  const buyer = await upsertVerifiedUser(`h1-money-failure-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h1-money-failure-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H1FAIL${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H1 Failure Vendor ${suffix}`,
  })
  const refundProduct = await ensureProductFixture({
    id: `h1-money-failure-refund-product-${suffix}`,
    vendorId: vendor.id,
    name: `H1 Refund Failure Product ${suffix}`,
    price: 19,
    stock: 8,
  })
  const payoutProduct = await ensureProductFixture({
    id: `h1-money-failure-payout-product-${suffix}`,
    vendorId: vendor.id,
    name: `H1 Payout Failure Product ${suffix}`,
    price: 17,
    stock: 8,
  })
  await clearBuyerCart(buyer.id)
  return { buyer, vendorUser, vendor, refundProduct, payoutProduct }
}

async function createPaidOrder({ buyerToken, vendorToken, productId, suffix, label }) {
  const cart = await request('/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ listingId: productId, quantity: 1 }),
  })

  const checkout = await request('/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${buyerToken}`,
      'Idempotency-Key': `h1-money-failure-${label}-${suffix}`,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: shippingAddress(`H1 Failure ${label}`),
    }),
  })

  const webhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `h1-money-failure-payment-${label}-${checkout.data.checkoutSessionId}`,
      checkoutSessionId: checkout.data.checkoutSessionId,
      eventType: 'PAYMENT_SUCCEEDED',
    }),
  })
  assert(webhook.data.orderIds.length === 1, 'failure fixture should create one order')
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
    body: JSON.stringify({ reason: 'force-refund-failure runtime provider failure proof' }),
  })
  await request(`/vendor/disputes/${dispute.data.id}/respond`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({ message: 'Runtime failure recovery vendor response' }),
  })
  return dispute.data
}

async function main() {
  const suffix = runtimeSuffix()
  const { buyer, vendorUser, vendor, refundProduct, payoutProduct } = await setupFixtures(suffix)
  const buyerToken = await login(buyer.email)
  const vendorToken = await login(vendorUser.email)
  const adminToken = await login('admin@vendora.com', true)

  const refundOrderId = await createPaidOrder({
    buyerToken,
    vendorToken,
    productId: refundProduct.id,
    suffix,
    label: 'refund',
  })
  const refundDispute = await openAndRespond({ buyerToken, vendorToken, orderId: refundOrderId })
  const refundError = await expectHttpError(`/admin/disputes/${refundDispute.id}/resolve`, adminToken, 502, 'REFUND_PROVIDER_FAILED', {
    method: 'POST',
    body: JSON.stringify({ resolutionType: 'BUYER_FAVOR_FULL_REFUND' }),
  })
  assert(refundError.message.includes('dispute remains'), 'refund provider failure should tell operator dispute remains reviewable')

  const failedRefund = await prisma.refundProviderExecution.findUnique({
    where: { disputeId: refundDispute.id },
    include: { dispute: { include: { order: { include: { funds: true } } } } },
  })
  assert(failedRefund?.status === 'FAILED', `expected failed refund execution, got ${failedRefund?.status}`)
  assert(failedRefund.dispute.status === 'PLATFORM_REVIEW', `expected dispute to remain PLATFORM_REVIEW, got ${failedRefund.dispute.status}`)
  assert(failedRefund.dispute.order.funds?.status === 'FROZEN_DISPUTE', `expected fund to remain FROZEN_DISPUTE, got ${failedRefund.dispute.order.funds?.status}`)
  record('H1-MONEY-FAILURE-01', 'failed refund provider execution is persisted while dispute and funds remain review-safe')

  const payoutOrderId = await createPaidOrder({
    buyerToken,
    vendorToken,
    productId: payoutProduct.id,
    suffix,
    label: 'payout',
  })
  await request(`/buyer/orders/${payoutOrderId}/confirm-receipt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({}),
  })
  const payoutFund = await prisma.orderFund.findUnique({ where: { orderId: payoutOrderId } })
  assert(payoutFund?.status === 'RELEASABLE', `expected payout fixture fund RELEASABLE, got ${payoutFund?.status}`)
  assert(payoutFund.amountMinor === 1700, `expected failure fixture amount 1700, got ${payoutFund.amountMinor}`)

  const drain = drainPayouts(vendor.id)
  assert(drain.failed === 1, `expected one failed payout, got ${drain.failed}`)
  const failedPayout = await prisma.payoutProviderExecution.findUnique({
    where: { orderFundId: payoutFund.id },
    include: { orderFund: true },
  })
  assert(failedPayout?.status === 'FAILED', `expected failed payout execution, got ${failedPayout?.status}`)
  assert(failedPayout.orderFund.status === 'PAYOUT_FAILED_REVIEW', `expected fund PAYOUT_FAILED_REVIEW, got ${failedPayout.orderFund.status}`)
  const paidOutLedger = await prisma.vendorBalanceLedger.findFirst({
    where: { referenceType: 'payout_provider_execution', referenceId: failedPayout.id, entryType: 'PAID_OUT' },
  })
  assert(!paidOutLedger, 'failed payout should not create PAID_OUT ledger entry')
  record('H1-MONEY-FAILURE-02', 'failed payout provider execution moves releasable fund into payout review without paid-out ledger')

  await expectHttpError('/admin/money/provider-failures', buyerToken, 403, 'FORBIDDEN')
  const failures = await request('/admin/money/provider-failures', {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert(failures.data.refunds.some((item) => item.id === failedRefund.id), 'admin failure queue should include failed refund')
  assert(failures.data.payouts.some((item) => item.id === failedPayout.id), 'admin failure queue should include failed payout')
  record('H1-MONEY-FAILURE-03', 'admin-only provider failure queue surfaces failed refund and payout executions')

  const reconciliation = runNpm('money:reconcile', ['--', '--limit=250'])
  assert(reconciliation.ok === true, 'money reconciliation should return ok after controlled failures')
  assert(reconciliation.mismatches === 0, `expected zero reconciliation mismatches, got ${reconciliation.mismatches}`)
  const run = await prisma.moneyReconciliationRun.findUnique({
    where: { id: reconciliation.runId },
    include: { items: true },
  })
  assert(run.items.some((item) => item.resourceId === failedRefund.id && item.status === 'MATCHED'), 'reconciliation should mark controlled failed refund as matched')
  assert(run.items.some((item) => item.resourceId === failedPayout.id && item.status === 'MATCHED'), 'reconciliation should mark controlled failed payout as matched')
  record('H1-MONEY-FAILURE-04', 'money reconciliation treats controlled provider failures as matched operational evidence')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    failedRefundProviderExecutionId: failedRefund.id,
    failedPayoutProviderExecutionId: failedPayout.id,
    reconciliationRunId: run.id,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
