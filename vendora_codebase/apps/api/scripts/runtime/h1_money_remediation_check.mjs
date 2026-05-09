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
  const buyer = await upsertVerifiedUser(`h1-remediation-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h1-remediation-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H1REMED${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H1 Remediation Vendor ${suffix}`,
  })
  const refundProduct = await ensureProductFixture({
    id: `h1-remediation-refund-product-${suffix}`,
    vendorId: vendor.id,
    name: `H1 Remediation Refund Product ${suffix}`,
    price: 19,
    stock: 8,
  })
  const payoutProduct = await ensureProductFixture({
    id: `h1-remediation-payout-product-${suffix}`,
    vendorId: vendor.id,
    name: `H1 Remediation Payout Product ${suffix}`,
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
      'Idempotency-Key': `h1-remediation-${label}-${suffix}`,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: shippingAddress(`H1 Remediation ${label}`),
    }),
  })

  const webhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `h1-remediation-payment-${label}-${checkout.data.checkoutSessionId}`,
      checkoutSessionId: checkout.data.checkoutSessionId,
      eventType: 'PAYMENT_SUCCEEDED',
    }),
  })
  assert(webhook.data.orderIds.length === 1, 'remediation fixture should create one order')
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
    body: JSON.stringify({ reason: 'force-refund-failure runtime remediation proof' }),
  })
  await request(`/vendor/disputes/${dispute.data.id}/respond`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({ message: 'Runtime remediation vendor response' }),
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
  await expectHttpError(`/admin/disputes/${refundDispute.id}/resolve`, adminToken, 502, 'REFUND_PROVIDER_FAILED', {
    method: 'POST',
    body: JSON.stringify({ resolutionType: 'BUYER_FAVOR_FULL_REFUND' }),
  })
  const failedRefund = await prisma.refundProviderExecution.findUnique({
    where: { disputeId: refundDispute.id },
  })
  assert(failedRefund?.status === 'FAILED', `expected failed refund, got ${failedRefund?.status}`)

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
  assert(payoutFund?.status === 'RELEASABLE', `expected payout fund RELEASABLE, got ${payoutFund?.status}`)
  const drain = drainPayouts(vendor.id)
  assert(drain.failed === 1, `expected one failed payout, got ${drain.failed}`)
  const failedPayout = await prisma.payoutProviderExecution.findUnique({
    where: { orderFundId: payoutFund.id },
  })
  assert(failedPayout?.status === 'FAILED', `expected failed payout, got ${failedPayout?.status}`)

  await expectHttpError(`/admin/money/refund-failures/${failedRefund.id}/retry`, buyerToken, 403, 'FORBIDDEN', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  await expectHttpError(`/admin/money/payout-failures/${failedPayout.id}/retry`, buyerToken, 403, 'FORBIDDEN', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  record('H1-MONEY-REMEDIATION-01', 'provider failure remediation actions are admin-only')

  const reviewedRefund = await request(`/admin/money/refund-failures/${failedRefund.id}/mark-reviewed`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ note: 'refund retry planned' }),
  })
  const reviewedPayout = await request(`/admin/money/payout-failures/${failedPayout.id}/mark-reviewed`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ note: 'payout retry planned' }),
  })
  assert(reviewedRefund.data.reviewedAt, 'reviewed refund should persist reviewedAt')
  assert(reviewedRefund.data.reviewNote === 'refund retry planned', 'reviewed refund should persist note')
  assert(reviewedPayout.data.reviewedAt, 'reviewed payout should persist reviewedAt')
  assert(reviewedPayout.data.reviewNote === 'payout retry planned', 'reviewed payout should persist note')
  record('H1-MONEY-REMEDIATION-02', 'admin can mark failed refund and payout executions reviewed with notes')

  const retriedRefund = await request(`/admin/money/refund-failures/${failedRefund.id}/retry`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({}),
  })
  assert(retriedRefund.data.status === 'SUCCEEDED', `expected retried refund SUCCEEDED, got ${retriedRefund.data.status}`)
  assert(retriedRefund.data.providerRefundId.startsWith('dev_mock_refund_'), 'retried refund should store a fresh provider refund id')
  const retryRefundDomain = await prisma.dispute.findUnique({
    where: { id: refundDispute.id },
    include: { order: { include: { funds: true } } },
  })
  assert(retryRefundDomain?.status === 'RESOLVED', `expected retried refund dispute RESOLVED, got ${retryRefundDomain?.status}`)
  assert(retryRefundDomain?.resolutionType === 'BUYER_FAVOR_FULL_REFUND', `expected full refund resolution, got ${retryRefundDomain?.resolutionType}`)
  assert(retryRefundDomain.order.status === 'CANCELLED', `expected retried refund order CANCELLED, got ${retryRefundDomain.order.status}`)
  assert(retryRefundDomain.order.funds?.status === 'RETURNED_TO_BUYER', `expected retried refund fund RETURNED_TO_BUYER, got ${retryRefundDomain.order.funds?.status}`)
  const retryRefundLedger = await prisma.vendorBalanceLedger.findFirst({
    where: { referenceId: refundDispute.id, entryType: 'REFUNDED' },
  })
  assert(Boolean(retryRefundLedger), 'retried refund should create REFUNDED ledger entry')
  record('H1-MONEY-REMEDIATION-03', 'admin retry of failed refund completes refund domain state and ledger evidence')

  const retriedPayout = await request(`/admin/money/payout-failures/${failedPayout.id}/retry`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({}),
  })
  assert(retriedPayout.data.status === 'SUCCEEDED', `expected retried payout SUCCEEDED, got ${retriedPayout.data.status}`)
  assert(retriedPayout.data.providerPayoutId.startsWith('dev_mock_payout_'), 'retried payout should store a fresh provider payout id')
  const retryPayoutFund = await prisma.orderFund.findUnique({ where: { id: payoutFund.id } })
  assert(retryPayoutFund?.status === 'PAID_OUT', `expected retried payout fund PAID_OUT, got ${retryPayoutFund?.status}`)
  const retryPayoutLedger = await prisma.vendorBalanceLedger.findFirst({
    where: { referenceType: 'payout_provider_execution', referenceId: failedPayout.id, entryType: 'PAID_OUT' },
  })
  assert(Boolean(retryPayoutLedger), 'retried payout should create PAID_OUT ledger entry')
  record('H1-MONEY-REMEDIATION-04', 'admin retry of failed payout completes payout domain state and ledger evidence')

  const auditCount = await prisma.auditEvent.count({
    where: {
      action: { in: [
        'REFUND_PROVIDER_FAILURE_REVIEWED',
        'PAYOUT_PROVIDER_FAILURE_REVIEWED',
        'REFUND_PROVIDER_RETRY_SUCCEEDED',
        'PAYOUT_PROVIDER_RETRY_SUCCEEDED',
      ] },
      actorUserId: { not: null },
    },
  })
  assert(auditCount >= 4, `expected remediation audit evidence, got ${auditCount}`)

  const reconciliation = runNpm('money:reconcile', ['--', '--limit=250'])
  assert(reconciliation.ok === true, 'money reconciliation should return ok after remediation retries')
  assert(reconciliation.mismatches === 0, `expected zero reconciliation mismatches, got ${reconciliation.mismatches}`)
  const run = await prisma.moneyReconciliationRun.findUnique({
    where: { id: reconciliation.runId },
    include: { items: true },
  })
  assert(run.items.some((item) => item.resourceId === failedRefund.id && item.status === 'MATCHED'), 'reconciliation should match retried refund')
  assert(run.items.some((item) => item.resourceId === failedPayout.id && item.status === 'MATCHED'), 'reconciliation should match retried payout')
  record('H1-MONEY-REMEDIATION-05', 'remediated refund and payout executions reconcile as matched evidence')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    refundProviderExecutionId: failedRefund.id,
    payoutProviderExecutionId: failedPayout.id,
    reconciliationRunId: run.id,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
