import 'dotenv/config'
import { prisma } from '../../shared/db.js'
import { recordWorkerHeartbeat, recordWorkerStarted, recordWorkerStopped, workerInstanceId } from '../workers/heartbeat.service.js'
import { autoEscalateVendorResponseDisputes } from './disputes.service.js'

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

function dateArg(name: string) {
  const prefix = `--${name}=`
  const arg = process.argv.find((item) => item.startsWith(prefix))
  if (!arg) return undefined
  const parsed = new Date(arg.slice(prefix.length))
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const limit = numberArg('limit', 50)
const olderThanHours = numberArg('older-than-hours', 48)
const intervalMs = numberArg('interval-ms', 60_000)
const stopAfterIdleRuns = optionalNumberArg('stop-after-idle-runs')
const once = hasFlag('once')
const now = dateArg('now')
const workerName = 'dispute_sla'
const instanceId = workerInstanceId(workerName)

let stopping = false
let run = 0
let idleRuns = 0
let totalProcessed = 0

function requestStop(signal: string) {
  stopping = true
  console.log(JSON.stringify({ ok: true, event: 'dispute_sla_worker_stop_requested', signal }))
}

process.once('SIGINT', () => requestStop('SIGINT'))
process.once('SIGTERM', () => requestStop('SIGTERM'))

async function main() {
  await recordWorkerStarted({
    workerName,
    instanceId,
    metadata: {
      limit,
      olderThanHours,
      intervalMs,
      now: now?.toISOString() ?? null,
      once,
      stopAfterIdleRuns: stopAfterIdleRuns ?? null,
    },
  })
  console.log(JSON.stringify({
    ok: true,
    event: 'dispute_sla_worker_started',
    limit,
    olderThanHours,
    intervalMs,
    now: now?.toISOString(),
  }))

  while (!stopping) {
    run += 1
    const summary = await autoEscalateVendorResponseDisputes({
      limit,
      olderThanHours,
      now,
    })
    const processed = summary.escalated
    totalProcessed += processed
    if (processed === 0) idleRuns += 1
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
    console.log(JSON.stringify({ ok: true, event: 'dispute_sla_worker_run', run, processed, ...summary }))

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
  console.log(JSON.stringify({ ok: true, event: 'dispute_sla_worker_stopped', runs: run, idleRuns }))
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
