import {
  assert,
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

async function createOrderFixture({ buyer, vendor, productId, status, fundStatus, amountMinor, suffix, label }) {
  return prisma.order.create({
    data: {
      buyerId: buyer.id,
      vendorId: vendor.id,
      status,
      total: amountMinor / 100,
      shippingAddressJson: shippingAddress(`H2 Money Ops ${label}`),
      buyerEmailSnapshot: buyer.email,
      orderNumber: `H2-MONEY-${label}-${suffix}`.replace(/[^A-Z0-9-]/gi, '').slice(0, 64),
      items: {
        create: [{
          productId,
          qty: 1,
          price: amountMinor / 100,
          listingTitleSnapshot: `H2 Money Ops ${label}`,
          unitPriceMinor: amountMinor,
          lineTotalMinor: amountMinor,
        }],
      },
      funds: {
        create: {
          vendorId: vendor.id,
          status: fundStatus,
          amountMinor,
          currency: 'RUB',
        },
      },
    },
    include: { funds: true },
  })
}

async function main() {
  const suffix = runtimeSuffix()
  const buyer = await upsertVerifiedUser(`h2-money-ops-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h2-money-ops-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H2MOPS${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H2 Money Ops Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h2-money-ops-product-${suffix}`,
    vendorId: vendor.id,
    name: `H2 Money Ops Product ${suffix}`,
    price: 83,
    stock: 5,
  })

  const refundOrder = await createOrderFixture({
    buyer,
    vendor,
    productId: product.id,
    status: 'DISPUTED',
    fundStatus: 'FROZEN_DISPUTE',
    amountMinor: 8300,
    suffix,
    label: 'REFUND',
  })
  const dispute = await prisma.dispute.create({
    data: {
      orderId: refundOrder.id,
      reason: 'H2 admin money ops refund failure fixture',
      status: 'PLATFORM_REVIEW',
    },
  })
  const refundFailure = await prisma.refundProviderExecution.create({
    data: {
      disputeId: dispute.id,
      orderId: refundOrder.id,
      providerName: 'dev_mock',
      providerRefundId: `h2-money-refund-${suffix}`,
      amountMinor: 8300,
      currency: 'RUB',
      status: 'FAILED',
      errorMessage: 'runtime refund provider failure',
    },
  })

  const payoutOrder = await createOrderFixture({
    buyer,
    vendor,
    productId: product.id,
    status: 'COMPLETED',
    fundStatus: 'PAYOUT_FAILED_REVIEW',
    amountMinor: 6100,
    suffix,
    label: 'PAYOUT',
  })
  const payoutFailure = await prisma.payoutProviderExecution.create({
    data: {
      vendorId: vendor.id,
      orderFundId: payoutOrder.funds.id,
      orderId: payoutOrder.id,
      providerName: 'dev_mock',
      providerPayoutId: `h2-money-payout-${suffix}`,
      amountMinor: 6100,
      currency: 'RUB',
      status: 'FAILED',
      errorMessage: 'runtime payout provider failure',
      reviewedAt: new Date(),
      reviewedByUserId: buyer.id,
      reviewNote: 'Runtime reviewed payout fixture',
    },
  })

  const reconciliation = await prisma.moneyReconciliationRun.create({
    data: {
      status: 'FAILED',
      checkedPayments: 0,
      checkedRefunds: 1,
      checkedPayouts: 1,
      mismatches: 1,
      completedAt: new Date(),
      items: {
        create: [
          {
            itemType: 'REFUND_EXECUTION',
            resourceId: refundFailure.id,
            status: 'MISMATCHED',
            detail: {
              providerName: refundFailure.providerName,
              disputeId: dispute.id,
              orderId: refundOrder.id,
              reason: 'runtime-visible refund mismatch',
            },
          },
          {
            itemType: 'PAYOUT_EXECUTION',
            resourceId: payoutFailure.id,
            status: 'MATCHED',
            detail: {
              providerName: payoutFailure.providerName,
              orderFundId: payoutOrder.funds.id,
              orderId: payoutOrder.id,
            },
          },
        ],
      },
    },
  })

  const buyerToken = await login(buyer.email)
  const adminToken = await login('admin@vendora.com', true)

  await expectHttpError('/admin/ops/money/reconciliation', buyerToken, 403, 'FORBIDDEN')
  await expectHttpError('/admin/ops/money/failures', buyerToken, 403, 'FORBIDDEN')
  record('H2-ADMIN-MONEY-OPS-01', 'money reconciliation and failure ops endpoints are admin-only')

  const reconciliationRuns = await request('/admin/ops/money/reconciliation?status=FAILED&itemStatus=MISMATCHED&itemType=REFUND_EXECUTION&limit=10', {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const run = reconciliationRuns.data.find((item) => item.id === reconciliation.id)
  assert(run, 'filtered reconciliation endpoint should include runtime failed run')
  assert(run.items.some((item) => item.resourceId === refundFailure.id && item.status === 'MISMATCHED'), 'reconciliation run should expose mismatched refund item')
  assert(run.items.every((item) => item.itemType === 'REFUND_EXECUTION' && item.status === 'MISMATCHED'), 'item filters should limit returned reconciliation items')
  record('H2-ADMIN-MONEY-OPS-02', 'money reconciliation ops endpoint filters failed runs and mismatched items')

  const refundFailures = await request('/admin/ops/money/failures?type=REFUND&reviewed=UNREVIEWED&limit=20', {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert(refundFailures.data.refunds.some((item) => item.id === refundFailure.id), 'refund failure endpoint should include unreviewed refund provider failure')
  assert(refundFailures.data.payouts.length === 0, 'refund-only failure filter should not include payouts')
  const refundRow = refundFailures.data.refunds.find((item) => item.id === refundFailure.id)
  assert(refundRow.fundStatus === 'FROZEN_DISPUTE', `expected refund fund status FROZEN_DISPUTE, got ${refundRow.fundStatus}`)
  assert(refundRow.disputeStatus === 'PLATFORM_REVIEW', `expected dispute PLATFORM_REVIEW, got ${refundRow.disputeStatus}`)
  record('H2-ADMIN-MONEY-OPS-03', 'money failure ops endpoint exposes unreviewed failed refunds with dispute and fund context')

  const payoutFailures = await request('/admin/ops/money/failures?type=PAYOUT&reviewed=REVIEWED&limit=20', {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert(payoutFailures.data.payouts.some((item) => item.id === payoutFailure.id), 'payout failure endpoint should include reviewed payout provider failure')
  assert(payoutFailures.data.refunds.length === 0, 'payout-only failure filter should not include refunds')
  const payoutRow = payoutFailures.data.payouts.find((item) => item.id === payoutFailure.id)
  assert(payoutRow.fundStatus === 'PAYOUT_FAILED_REVIEW', `expected payout fund status PAYOUT_FAILED_REVIEW, got ${payoutRow.fundStatus}`)
  assert(Boolean(payoutRow.reviewedAt), 'reviewed payout filter should return reviewedAt evidence')
  record('H2-ADMIN-MONEY-OPS-04', 'money failure ops endpoint exposes reviewed failed payouts with vendor and fund context')

  const invalid = await fetch(`${process.env.RUNTIME_API_URL ?? 'http://127.0.0.1:3001'}/admin/ops/money/failures?type=BAD`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const invalidPayload = await invalid.json()
  assert(invalid.status === 400, `expected invalid money failure filter 400, got ${invalid.status}`)
  assert(invalidPayload.error?.code === 'VALIDATION_ERROR', `expected VALIDATION_ERROR, got ${invalidPayload.error?.code}`)
  record('H2-ADMIN-MONEY-OPS-05', 'money ops endpoints reject invalid filters with validation errors')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    reconciliationRunId: reconciliation.id,
    refundFailureId: refundFailure.id,
    payoutFailureId: payoutFailure.id,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
