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
  runtimeSuffix,
  shippingAddress,
  upsertVerifiedUser,
  request,
} from './runtime_helpers.mjs'

async function createDueOrderFixture({ buyer, vendor, productId, suffix }) {
  const past = new Date(Date.now() - 48 * 60 * 60 * 1000)
  return prisma.order.create({
    data: {
      buyerId: buyer.id,
      vendorId: vendor.id,
      status: 'PAYMENT_HELD',
      total: 44,
      shippingAddressJson: shippingAddress('H2 Worker Queue Ops Buyer'),
      buyerEmailSnapshot: buyer.email,
      orderNumber: `H2-WORKER-QUEUE-${suffix}`.replace(/[^A-Z0-9-]/gi, '').slice(0, 64),
      createdAt: past,
      items: {
        create: [{
          productId,
          qty: 1,
          price: 44,
          listingTitleSnapshot: 'H2 Worker Queue Ops Product',
          unitPriceMinor: 4400,
          lineTotalMinor: 4400,
        }],
      },
      funds: {
        create: {
          vendorId: vendor.id,
          status: 'HELD',
          amountMinor: 4400,
          currency: 'RUB',
        },
      },
    },
    include: { funds: true },
  })
}

async function main() {
  const suffix = runtimeSuffix()
  const referenceId = `h2-worker-queue-${suffix}`
  const buyer = await upsertVerifiedUser(`h2-worker-queue-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h2-worker-queue-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H2WQ${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H2 Worker Queue Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h2-worker-queue-product-${suffix}`,
    vendorId: vendor.id,
    name: `H2 Worker Queue Product ${suffix}`,
    price: 44,
    stock: 4,
  })
  const pendingNotification = await prisma.notificationOutbox.create({
    data: {
      eventType: 'H2_WORKER_QUEUE_TEST',
      recipientEmail: `h2-worker-queue-pending-${suffix}@vendora.local`,
      subject: 'H2 worker queue pending notification',
      templateKey: 'runtime.h2_worker_queue',
      payload: { suffix },
      status: 'PENDING',
      referenceType: 'runtime_check',
      referenceId,
    },
  })
  const failedNotification = await prisma.notificationOutbox.create({
    data: {
      eventType: 'H2_WORKER_QUEUE_TEST',
      recipientEmail: `h2-worker-queue-failed-${suffix}@vendora.local`,
      subject: 'H2 worker queue failed notification',
      templateKey: 'runtime.h2_worker_queue',
      payload: { suffix },
      status: 'FAILED',
      providerName: 'dev_log',
      attempts: 3,
      lastError: 'runtime worker queue failure',
      referenceType: 'runtime_check',
      referenceId,
    },
  })
  const dueOrder = await createDueOrderFixture({ buyer, vendor, productId: product.id, suffix })
  await prisma.auditEvent.create({
    data: {
      actorUserId: null,
      action: 'ADMIN_ORDER_MAINTENANCE_RUN',
      resourceType: 'order_maintenance',
      resourceId: referenceId,
      metadata: {
        runtime: 'h2_admin_worker_queue_ops',
        orderId: dueOrder.id,
      },
    },
  })

  const buyerToken = await login(buyer.email)
  const adminToken = await login('admin@vendora.com', true)

  await expectHttpError('/admin/ops/workers', buyerToken, 403, 'FORBIDDEN')
  await expectHttpError('/admin/ops/queues', buyerToken, 403, 'FORBIDDEN')
  record('H2-ADMIN-WORKER-QUEUE-OPS-01', 'worker and queue ops endpoints are admin-only')

  const workers = await request('/admin/ops/workers', {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert(['NO_HEARTBEAT', 'RUNNING', 'STOPPED', 'ERROR', 'STALE'].includes(workers.data.notificationWorker.status), `expected known notification worker status, got ${workers.data.notificationWorker.status}`)
  assert(workers.data.notificationWorker.config.provider, 'notification worker ops should expose configured provider')
  assert(workers.data.notificationWorker.queue.pending >= 1, `expected notification pending count >= 1, got ${workers.data.notificationWorker.queue.pending}`)
  assert(workers.data.notificationWorker.queue.failed >= 1, `expected notification failed count >= 1, got ${workers.data.notificationWorker.queue.failed}`)
  assert(workers.data.orderMaintenanceWorker.backlog.confirmationTimeoutDue >= 1, `expected confirmation backlog >= 1, got ${workers.data.orderMaintenanceWorker.backlog.confirmationTimeoutDue}`)
  assert(workers.data.latestActivity.some((item) => item.resourceId === referenceId), 'worker ops should expose latest audit-backed ops activity')
  record('H2-ADMIN-WORKER-QUEUE-OPS-02', 'worker ops endpoint exposes worker config snapshots, notification queue and maintenance backlog')

  const queues = await request('/admin/ops/queues', {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert(queues.data.notifications.pending >= 1, `expected queue pending notifications >= 1, got ${queues.data.notifications.pending}`)
  assert(queues.data.notifications.failed >= 1, `expected queue failed notifications >= 1, got ${queues.data.notifications.failed}`)
  assert(queues.data.orderMaintenance.confirmationTimeoutDue >= 1, `expected queue confirmation backlog >= 1, got ${queues.data.orderMaintenance.confirmationTimeoutDue}`)
  assert(typeof queues.data.returnInspections.pending === 'number', 'queue ops should expose return inspection pending count')
  assert(typeof queues.data.moneyFailures.totalUnreviewed === 'number', 'queue ops should expose money failure unreviewed count')
  assert(queues.data.totals.actionable >= 1, `expected actionable queues >= 1, got ${queues.data.totals.actionable}`)
  record('H2-ADMIN-WORKER-QUEUE-OPS-03', 'queue ops endpoint aggregates notification, maintenance, return inspection and money failure queues')

  const notificationAfterRead = await prisma.notificationOutbox.findMany({
    where: { id: { in: [pendingNotification.id, failedNotification.id] } },
    orderBy: { createdAt: 'asc' },
  })
  const orderAfterRead = await prisma.order.findUnique({ where: { id: dueOrder.id }, include: { funds: true } })
  assert(notificationAfterRead.some((item) => item.id === pendingNotification.id && item.status === 'PENDING'), 'worker/queue read should not mutate pending notification')
  assert(notificationAfterRead.some((item) => item.id === failedNotification.id && item.status === 'FAILED'), 'worker/queue read should not mutate failed notification')
  assert(orderAfterRead?.status === 'PAYMENT_HELD', `worker/queue read should not mutate due order, got ${orderAfterRead?.status}`)
  assert(orderAfterRead.funds?.status === 'HELD', `worker/queue read should not mutate due order funds, got ${orderAfterRead.funds?.status}`)
  record('H2-ADMIN-WORKER-QUEUE-OPS-04', 'worker and queue ops endpoints are read-only snapshots')

  const summary = await request('/admin/ops/summary', {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert(summary.data.orderMaintenanceBacklog.totalDue >= queues.data.orderMaintenance.totalDue, 'summary remains compatible with queue maintenance totals')
  record('H2-ADMIN-WORKER-QUEUE-OPS-05', 'existing ops summary remains compatible with worker and queue snapshot counts')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    referenceId,
    pendingNotificationId: pendingNotification.id,
    failedNotificationId: failedNotification.id,
    dueOrderId: dueOrder.id,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
