import { execFileSync } from 'node:child_process'
import {
  assert,
  disconnect,
  evidence,
  prisma,
  record,
  runtimeSuffix,
} from './runtime_helpers.mjs'

function drain(referenceId, extraEnv = {}) {
  const output = execFileSync('npm', ['run', 'notifications:drain', '--', '--limit=10', '--max-attempts=2', '--event-type=H1_EMAIL_WORKER_TEST', `--reference-id=${referenceId}`], {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
  })
  const jsonStart = output.indexOf('{')
  assert(jsonStart >= 0, `drain output did not include JSON: ${output}`)
  return JSON.parse(output.slice(jsonStart))
}

async function createNotification(email, suffix) {
  return prisma.notificationOutbox.create({
    data: {
      eventType: 'H1_EMAIL_WORKER_TEST',
      recipientEmail: email,
      subject: 'H1 email worker runtime check',
      templateKey: 'runtime.h1_email_worker',
      payload: { suffix },
      referenceType: 'runtime_check',
      referenceId: suffix,
      status: 'PENDING',
    },
  })
}

async function main() {
  const suffix = runtimeSuffix()
  const successEmail = `h1-worker-success-${suffix}@vendora.local`
  const failEmail = `h1-worker-fail-${suffix}@vendora.local`

  const success = await createNotification(successEmail, suffix)
  const failure = await createNotification(failEmail, suffix)

  const successDrain = drain(suffix, { DEV_EMAIL_FAIL_RECIPIENTS: failEmail })
  assert(successDrain.ok === true, 'success drain should return ok')
  assert(successDrain.sent === 1, `expected one sent notification, got ${successDrain.sent}`)
  assert(successDrain.pending === 1, `expected one retry-pending notification, got ${successDrain.pending}`)

  const sent = await prisma.notificationOutbox.findUnique({ where: { id: success.id } })
  const pendingFailure = await prisma.notificationOutbox.findUnique({ where: { id: failure.id } })
  assert(sent?.status === 'SENT', `expected success SENT, got ${sent?.status}`)
  assert(sent?.attempts === 1, `expected success attempts=1, got ${sent?.attempts}`)
  assert(sent?.providerName === 'dev_log', `expected dev_log provider, got ${sent?.providerName}`)
  assert(Boolean(sent?.providerMessageId), 'sent notification should store providerMessageId')
  assert(sent?.sentAt, 'sent notification should store sentAt')
  assert(pendingFailure?.status === 'PENDING', `expected failure retry PENDING, got ${pendingFailure?.status}`)
  assert(pendingFailure?.attempts === 1, `expected failure attempts=1, got ${pendingFailure?.attempts}`)
  assert(pendingFailure?.lastError?.includes('forced failure'), 'failure should store provider error')
  record('H1-EMAIL-WORKER-01', 'dev email worker sends pending outbox rows and records provider evidence')
  record('H1-EMAIL-WORKER-02', 'transient provider failure remains pending with attempts and lastError')

  const failureDrain = drain(suffix, { DEV_EMAIL_FAIL_RECIPIENTS: failEmail })
  assert(failureDrain.failed === 1, `expected one exhausted failure, got ${failureDrain.failed}`)
  const failed = await prisma.notificationOutbox.findUnique({ where: { id: failure.id } })
  assert(failed?.status === 'FAILED', `expected exhausted failure FAILED, got ${failed?.status}`)
  assert(failed?.attempts === 2, `expected exhausted failure attempts=2, got ${failed?.attempts}`)
  assert(failed?.providerName === 'dev_log', `expected failure provider dev_log, got ${failed?.providerName}`)
  record('H1-EMAIL-WORKER-03', 'email worker marks exhausted provider failures as FAILED')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    sentNotificationId: success.id,
    failedNotificationId: failure.id,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
