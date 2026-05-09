import { execFileSync } from 'node:child_process'
import {
  assert,
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

function runWorkspaceScript(script, args, env = {}) {
  return execFileSync('npm', ['run', script, '--', ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  })
}

async function createDueOrderFixture({ buyer, vendor, productId, suffix }) {
  const past = new Date(Date.now() - 48 * 60 * 60 * 1000)
  return prisma.order.create({
    data: {
      buyerId: buyer.id,
      vendorId: vendor.id,
      status: 'PAYMENT_HELD',
      total: 52,
      shippingAddressJson: shippingAddress('H2 Worker Heartbeat Buyer'),
      buyerEmailSnapshot: buyer.email,
      orderNumber: `H2-WORKER-HB-${suffix}`.replace(/[^A-Z0-9-]/gi, '').slice(0, 64),
      createdAt: past,
      items: {
        create: [{
          productId,
          qty: 1,
          price: 52,
          listingTitleSnapshot: 'H2 Worker Heartbeat Product',
          unitPriceMinor: 5200,
          lineTotalMinor: 5200,
        }],
      },
      funds: {
        create: {
          vendorId: vendor.id,
          status: 'HELD',
          amountMinor: 5200,
          currency: 'RUB',
        },
      },
    },
    include: { funds: true },
  })
}

async function main() {
  const suffix = runtimeSuffix()
  const referenceId = `h2-worker-heartbeat-${suffix}`
  const notificationInstanceId = `runtime-notification-${suffix}`
  const orderInstanceId = `runtime-order-maintenance-${suffix}`
  const buyer = await upsertVerifiedUser(`h2-worker-heartbeat-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h2-worker-heartbeat-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H2WH${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H2 Worker Heartbeat Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h2-worker-heartbeat-product-${suffix}`,
    vendorId: vendor.id,
    name: `H2 Worker Heartbeat Product ${suffix}`,
    price: 52,
    stock: 4,
  })

  const notification = await prisma.notificationOutbox.create({
    data: {
      eventType: 'H2_WORKER_HEARTBEAT_TEST',
      recipientEmail: `h2-worker-heartbeat-${suffix}@vendora.local`,
      subject: 'H2 worker heartbeat notification',
      templateKey: 'runtime.h2_worker_heartbeat',
      payload: { suffix },
      status: 'PENDING',
      referenceType: 'runtime_check',
      referenceId,
    },
  })
  const order = await createDueOrderFixture({ buyer, vendor, productId: product.id, suffix })

  runWorkspaceScript('notifications:worker', [
    '--once',
    '--limit=5',
    '--max-attempts=2',
    '--event-type=H2_WORKER_HEARTBEAT_TEST',
    `--reference-id=${referenceId}`,
  ], { WORKER_INSTANCE_ID: notificationInstanceId })
  const notificationHeartbeat = await prisma.workerHeartbeat.findUnique({
    where: {
      workerName_instanceId: {
        workerName: 'notification_outbox',
        instanceId: notificationInstanceId,
      },
    },
  })
  const sentNotification = await prisma.notificationOutbox.findUnique({ where: { id: notification.id } })
  assert(notificationHeartbeat?.status === 'STOPPED', `expected notification worker STOPPED heartbeat, got ${notificationHeartbeat?.status}`)
  assert(notificationHeartbeat.runs >= 1, `expected notification worker runs >= 1, got ${notificationHeartbeat.runs}`)
  assert(notificationHeartbeat.processed >= 1, `expected notification worker processed >= 1, got ${notificationHeartbeat.processed}`)
  assert(Boolean(notificationHeartbeat.lastStartedAt), 'notification heartbeat should include lastStartedAt')
  assert(Boolean(notificationHeartbeat.lastHeartbeatAt), 'notification heartbeat should include lastHeartbeatAt')
  assert(Boolean(notificationHeartbeat.lastStoppedAt), 'notification heartbeat should include lastStoppedAt')
  assert(sentNotification?.status === 'SENT', `expected notification SENT, got ${sentNotification?.status}`)
  record('H2-WORKER-HEARTBEAT-01', 'notification worker writes durable started, heartbeat and stopped liveness state')

  runWorkspaceScript('orders:maintenance-worker', [
    '--once',
    '--limit=5',
    '--confirmation-older-than-hours=24',
    '--delivery-older-than-hours=24',
  ], { WORKER_INSTANCE_ID: orderInstanceId })
  const orderHeartbeat = await prisma.workerHeartbeat.findUnique({
    where: {
      workerName_instanceId: {
        workerName: 'order_maintenance',
        instanceId: orderInstanceId,
      },
    },
  })
  const cancelledOrder = await prisma.order.findUnique({ where: { id: order.id }, include: { funds: true } })
  assert(orderHeartbeat?.status === 'STOPPED', `expected order maintenance worker STOPPED heartbeat, got ${orderHeartbeat?.status}`)
  assert(orderHeartbeat.runs >= 1, `expected order maintenance worker runs >= 1, got ${orderHeartbeat.runs}`)
  assert(orderHeartbeat.processed >= 1, `expected order maintenance worker processed >= 1, got ${orderHeartbeat.processed}`)
  assert(Boolean(orderHeartbeat.lastStartedAt), 'order maintenance heartbeat should include lastStartedAt')
  assert(Boolean(orderHeartbeat.lastHeartbeatAt), 'order maintenance heartbeat should include lastHeartbeatAt')
  assert(Boolean(orderHeartbeat.lastStoppedAt), 'order maintenance heartbeat should include lastStoppedAt')
  assert(cancelledOrder?.status === 'CANCELLED', `expected due order CANCELLED, got ${cancelledOrder?.status}`)
  assert(cancelledOrder.funds?.status === 'RETURNED_TO_BUYER', `expected due order funds RETURNED_TO_BUYER, got ${cancelledOrder.funds?.status}`)
  record('H2-WORKER-HEARTBEAT-02', 'order maintenance worker writes durable liveness state while processing due jobs')

  const adminToken = await login('admin@vendora.com', true)
  const workers = await request('/admin/ops/workers', {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert(workers.data.notificationWorker.heartbeat.instances.some((item) => item.instanceId === notificationInstanceId), 'admin workers endpoint should expose notification worker heartbeat instance')
  assert(workers.data.orderMaintenanceWorker.heartbeat.instances.some((item) => item.instanceId === orderInstanceId), 'admin workers endpoint should expose order maintenance worker heartbeat instance')
  assert(workers.data.notificationWorker.status === 'STOPPED', `expected admin notification worker status STOPPED, got ${workers.data.notificationWorker.status}`)
  assert(workers.data.orderMaintenanceWorker.status === 'STOPPED', `expected admin order maintenance worker status STOPPED, got ${workers.data.orderMaintenanceWorker.status}`)
  record('H2-WORKER-HEARTBEAT-03', 'admin workers endpoint exposes latest durable heartbeat instances and statuses')

  const staleInstanceId = `runtime-stale-${suffix}`
  await prisma.workerHeartbeat.updateMany({
    where: { workerName: 'notification_outbox' },
    data: {
      lastHeartbeatAt: new Date(Date.now() - 20 * 60 * 1000),
      lastStoppedAt: new Date(Date.now() - 20 * 60 * 1000),
    },
  })
  await prisma.workerHeartbeat.create({
    data: {
      workerName: 'notification_outbox',
      instanceId: staleInstanceId,
      status: 'RUNNING',
      runs: 1,
      processed: 0,
      idleRuns: 1,
      lastStartedAt: new Date(Date.now() - 10 * 60 * 1000),
      lastHeartbeatAt: new Date(Date.now() - 10 * 60 * 1000),
      metadata: { runtime: 'h2_worker_heartbeat_stale' },
    },
  })
  const staleWorkers = await request('/admin/ops/workers', {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert(staleWorkers.data.notificationWorker.status === 'STALE', `expected stale notification heartbeat status STALE, got ${staleWorkers.data.notificationWorker.status}`)
  assert(staleWorkers.data.notificationWorker.heartbeat.latest.instanceId === staleInstanceId, 'stale heartbeat should be the latest notification heartbeat candidate')
  record('H2-WORKER-HEARTBEAT-04', 'admin workers endpoint marks old running heartbeats as STALE')

  const heartbeatCount = await prisma.workerHeartbeat.count({
    where: {
      instanceId: { in: [notificationInstanceId, orderInstanceId, staleInstanceId] },
    },
  })
  assert(heartbeatCount === 3, `expected three heartbeat rows, got ${heartbeatCount}`)
  record('H2-WORKER-HEARTBEAT-05', 'worker heartbeat state is durable in the runtime database')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    notificationInstanceId,
    orderInstanceId,
    staleInstanceId,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
