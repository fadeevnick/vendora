import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
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

const execFileAsync = promisify(execFile)

function parseWorkerEvents(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{') && line.endsWith('}'))
    .map((line) => JSON.parse(line))
}

async function runWorker(args, env = {}) {
  const { stdout } = await execFileAsync('npm', [
    'run',
    'disputes:sla-worker',
    '--',
    ...args,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 10_000,
  })

  return parseWorkerEvents(stdout)
}

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
          listingTitleSnapshot: `H3 SLA Worker Product ${suffix}`,
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
  const buyer = await upsertVerifiedUser(`h3-sla-worker-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h3-sla-worker-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: routeInn('HSLW', suffix),
    name: `H3 SLA Worker Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h3-sla-worker-product-${suffix}`,
    vendorId: vendor.id,
    name: `H3 SLA Worker Product ${suffix}`,
    category: 'h3-sla-worker',
    price: 1000,
    stock: 5,
    published: true,
  })

  const now = new Date()
  const oldFixture = await createDisputedOrderFixture({
    suffix,
    buyerId: buyer.id,
    vendorId: vendor.id,
    productId: product.id,
    createdAt: new Date(now.getTime() - 72 * 60 * 60 * 1000),
    reason: 'H3 SLA worker old dispute should escalate',
  })
  const freshFixture = await createDisputedOrderFixture({
    suffix,
    buyerId: buyer.id,
    vendorId: vendor.id,
    productId: product.id,
    createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    reason: 'H3 SLA worker fresh dispute should stay with vendor',
  })

  const instanceId = `runtime-dispute-sla-${suffix}`
  const events = await runWorker([
    '--limit=10',
    '--older-than-hours=48',
    '--interval-ms=50',
    '--once',
    `--now=${now.toISOString()}`,
  ], { WORKER_INSTANCE_ID: instanceId })
  const started = events.find((event) => event.event === 'dispute_sla_worker_started')
  const runs = events.filter((event) => event.event === 'dispute_sla_worker_run')
  const stopped = events.find((event) => event.event === 'dispute_sla_worker_stopped')

  assert(started?.limit === 10, `expected worker limit=10, got ${started?.limit}`)
  assert(started?.olderThanHours === 48, `expected worker olderThanHours=48, got ${started?.olderThanHours}`)
  assert(runs.length === 1, `expected one SLA worker run, got ${runs.length}`)
  assert(runs[0].processed === 1, `expected one escalated dispute, got ${runs[0].processed}`)
  assert(runs[0].disputeIds.includes(oldFixture.dispute.id), 'old dispute should be escalated by worker')
  assert(!runs[0].disputeIds.includes(freshFixture.dispute.id), 'fresh dispute should not be escalated by worker')
  assert(stopped?.runs === 1, `expected worker to stop after one run, got ${stopped?.runs}`)
  record('H3-DISPUTE-SLA-WORKER-01', 'dispute SLA worker starts with scheduler-safe interval and threshold configuration')
  record('H3-DISPUTE-SLA-WORKER-02', 'worker run escalates only overdue vendor-response disputes through one loop tick')

  const [oldDispute, freshDispute, heartbeat] = await Promise.all([
    prisma.dispute.findUnique({ where: { id: oldFixture.dispute.id }, include: { messages: true } }),
    prisma.dispute.findUnique({ where: { id: freshFixture.dispute.id } }),
    prisma.workerHeartbeat.findUnique({
      where: {
        workerName_instanceId: {
          workerName: 'dispute_sla',
          instanceId,
        },
      },
    }),
  ])
  assert(oldDispute?.status === 'PLATFORM_REVIEW', `old dispute expected PLATFORM_REVIEW, got ${oldDispute?.status}`)
  assert(freshDispute?.status === 'VENDOR_RESPONSE', `fresh dispute expected VENDOR_RESPONSE, got ${freshDispute?.status}`)
  assert(oldDispute.messages.some((message) => message.actorType === 'SYSTEM'), 'worker escalation should write system SLA message')
  assert(heartbeat?.status === 'STOPPED', `expected STOPPED heartbeat, got ${heartbeat?.status}`)
  assert(heartbeat.processed === 1, `expected heartbeat processed=1, got ${heartbeat.processed}`)
  assert(Boolean(heartbeat.lastStartedAt), 'worker heartbeat should include lastStartedAt')
  assert(Boolean(heartbeat.lastHeartbeatAt), 'worker heartbeat should include lastHeartbeatAt')
  assert(Boolean(heartbeat.lastStoppedAt), 'worker heartbeat should include lastStoppedAt')
  record('H3-DISPUTE-SLA-WORKER-03', 'worker writes durable heartbeat and system message evidence')

  const replayEvents = await runWorker([
    '--limit=10',
    '--older-than-hours=48',
    '--interval-ms=50',
    '--once',
    `--now=${now.toISOString()}`,
  ], { WORKER_INSTANCE_ID: `runtime-dispute-sla-replay-${suffix}` })
  const replayRun = replayEvents.find((event) => event.event === 'dispute_sla_worker_run')
  assert(replayRun?.processed === 0, `expected replay worker to process zero disputes, got ${replayRun?.processed}`)
  record('H3-DISPUTE-SLA-WORKER-04', 'worker replay is a no-op for already escalated disputes')

  console.log(JSON.stringify({ ok: true, evidence, escalatedDisputeId: oldFixture.dispute.id }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
