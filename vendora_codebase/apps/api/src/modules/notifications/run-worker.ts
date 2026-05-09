import 'dotenv/config'
import { prisma } from '../../shared/db.js'
import { recordWorkerHeartbeat, recordWorkerStarted, recordWorkerStopped, workerInstanceId } from '../workers/heartbeat.service.js'
import { drainNotificationOutbox } from './notifications.service.js'

function numberArg(name: string, fallback: number) {
  const prefix = `--${name}=`
  const arg = process.argv.find((item) => item.startsWith(prefix))
  if (!arg) return fallback
  const parsed = Number(arg.slice(prefix.length))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function optionalNumberArg(name: string) {
  const prefix = `--${name}=`
  const arg = process.argv.find((item) => item.startsWith(prefix))
  if (!arg) return undefined
  const parsed = Number(arg.slice(prefix.length))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function stringArg(name: string) {
  const prefix = `--${name}=`
  const arg = process.argv.find((item) => item.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : undefined
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const limit = numberArg('limit', 25)
const maxAttempts = numberArg('max-attempts', 3)
const intervalMs = numberArg('interval-ms', 30_000)
const stopAfterIdleRuns = optionalNumberArg('stop-after-idle-runs')
const once = hasFlag('once')
const eventType = stringArg('event-type')
const referenceId = stringArg('reference-id')
const workerName = 'notification_outbox'
const instanceId = workerInstanceId(workerName)

let stopping = false
let run = 0
let idleRuns = 0
let totalProcessed = 0

function requestStop(signal: string) {
  stopping = true
  console.log(JSON.stringify({ ok: true, event: 'notification_worker_stop_requested', signal }))
}

process.once('SIGINT', () => requestStop('SIGINT'))
process.once('SIGTERM', () => requestStop('SIGTERM'))

async function main() {
  await recordWorkerStarted({
    workerName,
    instanceId,
    metadata: {
      provider: process.env['EMAIL_PROVIDER'] ?? 'dev_log',
      limit,
      maxAttempts,
      intervalMs,
      eventType,
      referenceId,
      once,
      stopAfterIdleRuns: stopAfterIdleRuns ?? null,
    },
  })
  console.log(JSON.stringify({
    ok: true,
    event: 'notification_worker_started',
    provider: process.env['EMAIL_PROVIDER'] ?? 'dev_log',
    limit,
    maxAttempts,
    intervalMs,
    eventType,
    referenceId,
  }))

  while (!stopping) {
    run += 1
    const summary = await drainNotificationOutbox({ limit, maxAttempts, eventType, referenceId })
    totalProcessed += summary.sent + summary.failed
    if (summary.selected === 0) idleRuns += 1
    else idleRuns = 0
    await recordWorkerHeartbeat({
      workerName,
      instanceId,
      runs: run,
      processed: totalProcessed,
      idleRuns,
      metadata: {
        lastSummary: summary,
      },
    })
    console.log(JSON.stringify({ ok: true, event: 'notification_worker_drain', run, ...summary }))

    if (once) break
    if (stopAfterIdleRuns !== undefined && idleRuns >= stopAfterIdleRuns) break

    await sleep(intervalMs)
  }

  await recordWorkerStopped({
    workerName,
    instanceId,
    runs: run,
    processed: totalProcessed,
    idleRuns,
  })
  console.log(JSON.stringify({ ok: true, event: 'notification_worker_stopped', runs: run, idleRuns }))
}

main()
  .catch(async (err) => {
    console.error(err)
    await recordWorkerStopped({
      workerName,
      instanceId,
      status: 'ERROR',
      runs: run,
      processed: totalProcessed,
      idleRuns,
      error: err,
    }).catch((heartbeatErr) => console.error(heartbeatErr))
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
