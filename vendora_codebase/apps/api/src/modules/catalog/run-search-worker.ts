import 'dotenv/config'
import { prisma } from '../../shared/db.js'
import { recordWorkerHeartbeat, recordWorkerStarted, recordWorkerStopped, workerInstanceId } from '../workers/heartbeat.service.js'
import { reindexCatalogSearch } from './catalog.search.js'

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
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const intervalMs = numberArg('interval-ms', 3_600_000)
const stopAfterRuns = optionalNumberArg('stop-after-runs')
const once = hasFlag('once')
const workerName = 'catalog_search'
const instanceId = workerInstanceId(workerName)

let stopping = false
let run = 0
let totalProcessed = 0

function requestStop(signal: string) {
  stopping = true
  console.log(JSON.stringify({ ok: true, event: 'catalog_search_worker_stop_requested', signal }))
}

process.once('SIGINT', () => requestStop('SIGINT'))
process.once('SIGTERM', () => requestStop('SIGTERM'))

async function main() {
  await recordWorkerStarted({
    workerName,
    instanceId,
    metadata: {
      intervalMs,
      once,
      stopAfterRuns: stopAfterRuns ?? null,
    },
  })
  console.log(JSON.stringify({
    ok: true,
    event: 'catalog_search_worker_started',
    intervalMs,
    once,
    stopAfterRuns,
  }))

  while (!stopping) {
    run += 1
    const summary = await reindexCatalogSearch()
    totalProcessed += summary.documents
    await prisma.auditEvent.create({
      data: {
        actorUserId: null,
        action: 'CATALOG_SEARCH_REINDEX_WORKER_RUN',
        resourceType: 'catalog_search',
        resourceId: `catalog-search-worker:${new Date().toISOString()}`,
        metadata: {
          run,
          result: summary,
        },
      },
    })
    await recordWorkerHeartbeat({
      workerName,
      instanceId,
      runs: run,
      processed: totalProcessed,
      idleRuns: 0,
      metadata: {
        lastSummary: summary,
      },
    })
    console.log(JSON.stringify({ ok: true, event: 'catalog_search_worker_run', run, processed: summary.documents, ...summary }))

    if (once) break
    if (stopAfterRuns !== undefined && run >= stopAfterRuns) break

    await sleep(intervalMs)
  }

  await recordWorkerStopped({
    workerName,
    instanceId,
    runs: run,
    processed: totalProcessed,
    idleRuns: 0,
  })
  console.log(JSON.stringify({ ok: true, event: 'catalog_search_worker_stopped', runs: run }))
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
      idleRuns: 0,
      error: err,
    }).catch((heartbeatErr) => console.error(heartbeatErr))
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
