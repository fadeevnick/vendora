import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  assert,
  disconnect,
  evidence,
  prisma,
  record,
  runtimeSuffix,
} from './runtime_helpers.mjs'

const execFileAsync = promisify(execFile)

async function createNotification(email, referenceId) {
  return prisma.notificationOutbox.create({
    data: {
      eventType: 'H1_EMAIL_WORKER_DAEMON_TEST',
      recipientEmail: email,
      subject: 'H1 email worker daemon runtime check',
      templateKey: 'runtime.h1_email_worker_daemon',
      payload: { referenceId },
      referenceType: 'runtime_check',
      referenceId,
      status: 'PENDING',
    },
  })
}

function parseWorkerEvents(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{') && line.endsWith('}'))
    .map((line) => JSON.parse(line))
}

async function runWorker(referenceId, failingEmail) {
  const { stdout } = await execFileAsync('npm', [
    'run',
    'notifications:worker',
    '--',
    '--limit=10',
    '--max-attempts=2',
    '--interval-ms=50',
    '--stop-after-idle-runs=1',
    '--event-type=H1_EMAIL_WORKER_DAEMON_TEST',
    `--reference-id=${referenceId}`,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, DEV_EMAIL_FAIL_RECIPIENTS: failingEmail },
    encoding: 'utf8',
    timeout: 10_000,
  })

  return parseWorkerEvents(stdout)
}

async function main() {
  const suffix = runtimeSuffix()
  const successEmail = `h1-worker-daemon-success-${suffix}@vendora.local`
  const failEmail = `h1-worker-daemon-fail-${suffix}@vendora.local`

  const success = await createNotification(successEmail, suffix)
  const failure = await createNotification(failEmail, suffix)

  const events = await runWorker(suffix, failEmail)
  const started = events.find((event) => event.event === 'notification_worker_started')
  const drains = events.filter((event) => event.event === 'notification_worker_drain')
  const stopped = events.find((event) => event.event === 'notification_worker_stopped')

  assert(started?.provider === 'dev_log', `expected dev_log worker provider, got ${started?.provider}`)
  assert(drains.length >= 3, `expected at least three worker drain ticks, got ${drains.length}`)
  assert(drains[0].sent === 1, `expected first worker tick to send one notification, got ${drains[0].sent}`)
  assert(drains[0].pending === 1, `expected first worker tick to keep one retry-pending notification, got ${drains[0].pending}`)
  assert(drains[1].failed === 1, `expected second worker tick to exhaust one failed notification, got ${drains[1].failed}`)
  assert(stopped?.idleRuns === 1, `expected worker to stop after one idle run, got ${stopped?.idleRuns}`)

  const sent = await prisma.notificationOutbox.findUnique({ where: { id: success.id } })
  const failed = await prisma.notificationOutbox.findUnique({ where: { id: failure.id } })

  assert(sent?.status === 'SENT', `expected success SENT, got ${sent?.status}`)
  assert(sent?.providerName === 'dev_log', `expected success provider dev_log, got ${sent?.providerName}`)
  assert(Boolean(sent?.providerMessageId), 'sent notification should store providerMessageId')
  assert(failed?.status === 'FAILED', `expected failure FAILED, got ${failed?.status}`)
  assert(failed?.attempts === 2, `expected failure attempts=2, got ${failed?.attempts}`)
  assert(failed?.lastError?.includes('forced failure'), 'failed notification should store provider error')

  record('H1-EMAIL-WORKER-DAEMON-01', 'long-running notification worker starts with provider configuration and drains outbox rows')
  record('H1-EMAIL-WORKER-DAEMON-02', 'worker loop retries pending provider failures and exhausts them at max attempts')
  record('H1-EMAIL-WORKER-DAEMON-03', 'worker exits cleanly after configured idle drain threshold for operator-managed execution')

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
