import {
  assert,
  disconnect,
  evidence,
  expectHttpError,
  login,
  prisma,
  record,
  request,
  runtimeSuffix,
  upsertVerifiedUser,
} from './runtime_helpers.mjs'

async function main() {
  const suffix = runtimeSuffix()
  const referenceId = `h2-admin-ops-${suffix}`
  const buyer = await upsertVerifiedUser(`h2-admin-ops-buyer-${suffix}@vendora.local`, 'BUYER')
  const buyerToken = await login(buyer.email)
  const adminToken = await login('admin@vendora.com', true)

  const failedNotification = await prisma.notificationOutbox.create({
    data: {
      eventType: 'H2_ADMIN_OPS_TEST',
      recipientEmail: `h2-admin-ops-failed-${suffix}@vendora.local`,
      subject: 'H2 admin ops failed notification',
      templateKey: 'runtime.h2_admin_ops',
      payload: { suffix },
      status: 'FAILED',
      providerName: 'dev_log',
      attempts: 3,
      lastError: 'runtime exhausted failure',
      referenceType: 'runtime_check',
      referenceId,
    },
  })
  await prisma.notificationOutbox.create({
    data: {
      eventType: 'H2_ADMIN_OPS_TEST',
      recipientEmail: `h2-admin-ops-pending-${suffix}@vendora.local`,
      subject: 'H2 admin ops pending notification',
      templateKey: 'runtime.h2_admin_ops',
      payload: { suffix },
      status: 'PENDING',
      referenceType: 'runtime_check',
      referenceId,
    },
  })

  await expectHttpError('/admin/ops/summary', buyerToken, 403, 'FORBIDDEN')
  const summary = await request('/admin/ops/summary', {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert(summary.data.notifications.failed >= 1, `expected failed notification count >= 1, got ${summary.data.notifications.failed}`)
  assert(summary.data.notifications.pending >= 1, `expected pending notification count >= 1, got ${summary.data.notifications.pending}`)
  assert(typeof summary.data.orderMaintenanceBacklog.totalDue === 'number', 'ops summary should include order maintenance backlog total')
  assert(typeof summary.data.moneyProviderFailures.refunds.failed === 'number', 'ops summary should include refund failure count')
  assert(typeof summary.data.moneyProviderFailures.payouts.failed === 'number', 'ops summary should include payout failure count')
  record('H2-ADMIN-OPS-01', 'admin-only ops summary exposes notification, money failure and order maintenance backlog signals')

  const failedList = await request(`/admin/ops/notifications?status=FAILED&eventType=H2_ADMIN_OPS_TEST&referenceId=${referenceId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert(failedList.data.length === 1, `expected one filtered failed notification, got ${failedList.data.length}`)
  assert(failedList.data[0].id === failedNotification.id, 'filtered failed notification should match fixture')
  record('H2-ADMIN-OPS-02', 'admin notification outbox endpoint filters operational rows by status, event and reference')

  await expectHttpError(`/admin/ops/notifications/${failedNotification.id}/retry`, buyerToken, 403, 'FORBIDDEN', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  const retried = await request(`/admin/ops/notifications/${failedNotification.id}/retry`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({}),
  })
  assert(retried.data.status === 'PENDING', `expected retried notification PENDING, got ${retried.data.status}`)
  assert(retried.data.attempts === 0, `expected retry to reset attempts=0, got ${retried.data.attempts}`)
  assert(retried.data.lastError === null, 'expected retry to clear lastError')
  record('H2-ADMIN-OPS-03', 'admin can requeue failed notification outbox rows for worker retry')

  const audit = await prisma.auditEvent.findFirst({
    where: {
      resourceType: 'notification_outbox',
      resourceId: failedNotification.id,
      action: 'NOTIFICATION_OUTBOX_RETRY_REQUESTED',
      actorUserId: { not: null },
    },
  })
  assert(Boolean(audit), 'notification retry should write admin audit evidence')
  record('H2-ADMIN-OPS-04', 'notification retry writes audit evidence with admin actor')

  const retryAgain = await fetch(`${process.env.RUNTIME_API_URL ?? 'http://127.0.0.1:3001'}/admin/ops/notifications/${failedNotification.id}/retry`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })
  const retryAgainPayload = await retryAgain.json()
  assert(retryAgain.status === 409, `expected retry of non-failed notification 409, got ${retryAgain.status}`)
  assert(retryAgainPayload.error?.code === 'OPS_INVALID_STATE', `expected OPS_INVALID_STATE, got ${retryAgainPayload.error?.code}`)
  record('H2-ADMIN-OPS-05', 'notification retry rejects rows that are no longer FAILED')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    failedNotificationId: failedNotification.id,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
