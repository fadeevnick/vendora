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
  routeInn,
  runtimeSuffix,
  upsertVerifiedUser,
} from './runtime_helpers.mjs'

async function createDisputedOrderFixture({ suffix, buyerId, vendorId, productId, createdAt, reason }) {
  const order = await prisma.order.create({
    data: {
      buyerId,
      vendorId,
      status: 'DISPUTED',
      total: 1000,
      items: {
        create: {
          productId,
          qty: 1,
          price: 1000,
          listingTitleSnapshot: `H3 SLA Ops Product ${suffix}`,
          unitPriceMinor: 100000,
          lineTotalMinor: 100000,
        },
      },
      funds: {
        create: {
          vendorId,
          status: 'FROZEN_DISPUTE',
          amountMinor: 100000,
          currency: 'RUB',
        },
      },
    },
  })

  const dispute = await prisma.dispute.create({
    data: {
      orderId: order.id,
      reason,
      status: 'VENDOR_RESPONSE',
      createdAt,
    },
  })

  await prisma.disputeMessage.create({
    data: {
      disputeId: dispute.id,
      actorUserId: buyerId,
      actorType: 'BUYER',
      message: reason,
      createdAt,
    },
  })

  return { order, dispute }
}

async function main() {
  const suffix = runtimeSuffix()
  const buyer = await upsertVerifiedUser(`h3-sla-ops-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h3-sla-ops-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: routeInn('HSOP', suffix),
    name: `H3 SLA Ops Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h3-sla-ops-product-${suffix}`,
    vendorId: vendor.id,
    name: `H3 SLA Ops Product ${suffix}`,
    category: 'h3-sla-ops',
    price: 1000,
    stock: 5,
    published: true,
  })

  const buyerToken = await login(buyer.email)
  const adminToken = await login('admin@vendora.com', true)
  const now = new Date()
  const oldFixture = await createDisputedOrderFixture({
    suffix,
    buyerId: buyer.id,
    vendorId: vendor.id,
    productId: product.id,
    createdAt: new Date(now.getTime() - 72 * 60 * 60 * 1000),
    reason: 'H3 SLA ops old dispute should escalate',
  })
  const freshFixture = await createDisputedOrderFixture({
    suffix,
    buyerId: buyer.id,
    vendorId: vendor.id,
    productId: product.id,
    createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    reason: 'H3 SLA ops fresh dispute should stay with vendor',
  })

  await expectHttpError('/admin/ops/dispute-sla/run', buyerToken, 403, 'FORBIDDEN', {
    method: 'POST',
    body: JSON.stringify({ dryRun: true }),
  })
  record('H3-DISPUTE-SLA-OPS-01', 'dispute SLA run endpoint is admin-only')

  const dryRun = await request('/admin/ops/dispute-sla/run', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      dryRun: true,
      limit: 10,
      olderThanHours: 48,
      now: now.toISOString(),
    }),
  })
  assert(dryRun.data.mode === 'DRY_RUN', `expected DRY_RUN mode, got ${dryRun.data.mode}`)
  assert(dryRun.data.executed === false, 'dry run should not execute dispute SLA')
  assert(dryRun.data.backlog.vendorResponseDue >= 1, `expected SLA backlog >= 1, got ${dryRun.data.backlog.vendorResponseDue}`)
  const oldAfterDryRun = await prisma.dispute.findUnique({ where: { id: oldFixture.dispute.id } })
  assert(oldAfterDryRun?.status === 'VENDOR_RESPONSE', `dry run should not mutate dispute, got ${oldAfterDryRun?.status}`)
  record('H3-DISPUTE-SLA-OPS-02', 'admin dry-run exposes due dispute SLA backlog without mutating disputes')

  const executed = await request('/admin/ops/dispute-sla/run', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      dryRun: false,
      limit: 10,
      olderThanHours: 48,
      now: now.toISOString(),
    }),
  })
  assert(executed.data.mode === 'EXECUTE', `expected EXECUTE mode, got ${executed.data.mode}`)
  assert(executed.data.executed === true, 'execute mode should run dispute SLA')
  assert(executed.data.result.escalated >= 1, `expected at least one escalated dispute, got ${executed.data.result.escalated}`)
  assert(executed.data.result.disputeIds.includes(oldFixture.dispute.id), 'execute should escalate old dispute')
  assert(!executed.data.result.disputeIds.includes(freshFixture.dispute.id), 'execute should not escalate fresh dispute')
  const [oldAfterExecute, freshAfterExecute] = await Promise.all([
    prisma.dispute.findUnique({ where: { id: oldFixture.dispute.id }, include: { messages: true } }),
    prisma.dispute.findUnique({ where: { id: freshFixture.dispute.id } }),
  ])
  assert(oldAfterExecute?.status === 'PLATFORM_REVIEW', `expected old dispute PLATFORM_REVIEW, got ${oldAfterExecute?.status}`)
  assert(freshAfterExecute?.status === 'VENDOR_RESPONSE', `expected fresh dispute VENDOR_RESPONSE, got ${freshAfterExecute?.status}`)
  assert(oldAfterExecute.messages.some((message) => message.actorType === 'SYSTEM'), 'execute should write system SLA message')
  record('H3-DISPUTE-SLA-OPS-03', 'admin execute mode escalates only overdue vendor-response disputes')

  const audit = await prisma.auditEvent.findFirst({
    where: {
      actorUserId: { not: null },
      resourceType: 'dispute_sla',
      action: 'ADMIN_DISPUTE_SLA_RUN',
    },
    orderBy: { createdAt: 'desc' },
  })
  assert(audit?.metadata?.result?.escalated >= 1, 'admin dispute SLA run should write result audit evidence')
  record('H3-DISPUTE-SLA-OPS-04', 'admin dispute SLA execute writes durable audit evidence')

  const replay = await request('/admin/ops/dispute-sla/run', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      dryRun: false,
      limit: 10,
      olderThanHours: 48,
      now: now.toISOString(),
    }),
  })
  assert(!replay.data.result.disputeIds.includes(oldFixture.dispute.id), 'already escalated dispute should not replay')
  record('H3-DISPUTE-SLA-OPS-05', 'admin dispute SLA execute is replay-safe for already escalated disputes')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    dryRunBacklog: dryRun.data.backlog,
    executed: executed.data.result,
    escalatedDisputeId: oldFixture.dispute.id,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
