import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  assert,
  disconnect,
  ensureProductFixture,
  ensureVendorFixture,
  evidence,
  prisma,
  record,
  routeInn,
  runtimeSuffix,
  upsertVerifiedUser,
} from './runtime_helpers.mjs'

const API_ROOT = fileURLToPath(new URL('../..', import.meta.url))

async function createDisputedOrderFixture({ suffix, buyerId, vendorId, productId, oldCreatedAt, reason }) {
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
          listingTitleSnapshot: `H3 SLA Product ${suffix}`,
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
      createdAt: oldCreatedAt,
    },
  })

  await prisma.disputeMessage.create({
    data: {
      disputeId: dispute.id,
      actorUserId: buyerId,
      actorType: 'BUYER',
      message: reason,
      createdAt: oldCreatedAt,
    },
  })
  await prisma.vendorBalanceLedger.create({
    data: {
      vendorId,
      orderId: order.id,
      entryType: 'FROZEN',
      amountMinor: 100000,
      currency: 'RUB',
      referenceType: 'dispute',
      referenceId: dispute.id,
      createdAt: oldCreatedAt,
    },
  })

  return { order, dispute }
}

async function main() {
  const suffix = runtimeSuffix()
  const buyer = await upsertVerifiedUser(`h3-sla-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h3-sla-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const admin = await upsertVerifiedUser(`h3-sla-admin-${suffix}@vendora.local`, 'BUYER', { isPlatformAdmin: true })
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: routeInn('HSLA', suffix),
    name: `H3 SLA Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h3-sla-product-${suffix}`,
    vendorId: vendor.id,
    name: `H3 SLA Product ${suffix}`,
    category: 'h3-sla',
    price: 1000,
    stock: 5,
    published: true,
  })

  const now = new Date()
  const oldCreatedAt = new Date(now.getTime() - 72 * 60 * 60 * 1000)
  const freshCreatedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000)
  const oldFixture = await createDisputedOrderFixture({
    suffix,
    buyerId: buyer.id,
    vendorId: vendor.id,
    productId: product.id,
    oldCreatedAt,
    reason: 'H3 SLA old dispute should escalate',
  })
  const freshFixture = await createDisputedOrderFixture({
    suffix,
    buyerId: buyer.id,
    vendorId: vendor.id,
    productId: product.id,
    oldCreatedAt: freshCreatedAt,
    reason: 'H3 SLA fresh dispute should stay with vendor',
  })

  const result = spawnSync('npm', [
    'run',
    'disputes:auto-escalate-vendor-response',
    '--silent',
    '--',
    `--now=${now.toISOString()}`,
    '--older-than-hours=48',
    '--limit=10',
  ], {
    cwd: API_ROOT,
    env: process.env,
    encoding: 'utf8',
  })
  if (result.status !== 0) throw new Error(`auto escalate failed\n${result.stdout}\n${result.stderr}`)
  const summary = JSON.parse(result.stdout)
  assert(summary.ok === true, 'summary should be ok')
  assert(summary.disputeIds.includes(oldFixture.dispute.id), 'old dispute should be escalated')
  assert(!summary.disputeIds.includes(freshFixture.dispute.id), 'fresh dispute should not be escalated')
  record('H3-DISPUTE-SLA-01', 'vendor-response SLA command escalates only overdue disputes')

  const [oldDispute, freshDispute] = await Promise.all([
    prisma.dispute.findUnique({ where: { id: oldFixture.dispute.id }, include: { messages: true } }),
    prisma.dispute.findUnique({ where: { id: freshFixture.dispute.id }, include: { messages: true } }),
  ])
  assert(oldDispute?.status === 'PLATFORM_REVIEW', `old dispute expected PLATFORM_REVIEW, got ${oldDispute?.status}`)
  assert(freshDispute?.status === 'VENDOR_RESPONSE', `fresh dispute expected VENDOR_RESPONSE, got ${freshDispute?.status}`)
  assert(oldDispute.messages.some((message) => message.actorType === 'SYSTEM'), 'old dispute should have system SLA message')
  record('H3-DISPUTE-SLA-02', 'SLA escalation writes system message and leaves fresh disputes unchanged')

  const audit = await prisma.auditEvent.findFirst({
    where: {
      action: 'DISPUTE_VENDOR_RESPONSE_SLA_ESCALATED',
      resourceId: oldFixture.dispute.id,
    },
  })
  assert(audit, 'SLA escalation audit event missing')
  const notifications = await prisma.notificationOutbox.findMany({
    where: {
      referenceType: 'dispute',
      referenceId: oldFixture.dispute.id,
      eventType: { startsWith: 'DISPUTE_VENDOR_RESPONSE_SLA_ESCALATED' },
    },
  })
  assert(notifications.some((item) => item.recipientUserId === buyer.id), 'buyer SLA notification missing')
  assert(notifications.some((item) => item.recipientUserId === vendorUser.id), 'vendor SLA notification missing')
  assert(notifications.some((item) => item.recipientUserId === admin.id), 'admin SLA notification missing')
  record('H3-DISPUTE-SLA-03', 'SLA escalation writes audit and buyer/vendor/admin notification outbox evidence')

  const replay = spawnSync('npm', [
    'run',
    'disputes:auto-escalate-vendor-response',
    '--silent',
    '--',
    `--now=${now.toISOString()}`,
    '--older-than-hours=48',
    '--limit=10',
  ], {
    cwd: API_ROOT,
    env: process.env,
    encoding: 'utf8',
  })
  if (replay.status !== 0) throw new Error(`auto escalate replay failed\n${replay.stdout}\n${replay.stderr}`)
  const replaySummary = JSON.parse(replay.stdout)
  assert(!replaySummary.disputeIds.includes(oldFixture.dispute.id), 'already escalated dispute should not replay')
  record('H3-DISPUTE-SLA-04', 'SLA escalation command is replay-safe for already escalated disputes')

  console.log(JSON.stringify({ ok: true, evidence, escalatedDisputeId: oldFixture.dispute.id }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)

