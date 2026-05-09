import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  assert,
  disconnect,
  evidence,
  record,
} from './runtime_helpers.mjs'

const execFileAsync = promisify(execFile)

function parseWorkerEvents(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{') && line.endsWith('}'))
    .map((line) => JSON.parse(line))
}

async function runWorker() {
  const { stdout } = await execFileAsync('npm', [
    'run',
    'orders:maintenance-worker',
    '--',
    '--limit=1',
    '--interval-ms=50',
    '--stop-after-idle-runs=1',
    '--confirmation-older-than-hours=1',
    '--delivery-older-than-hours=1',
    '--now=1970-01-01T00:00:00.000Z',
  ], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    timeout: 10_000,
  })

  return parseWorkerEvents(stdout)
}

async function main() {
  const events = await runWorker()
  const started = events.find((event) => event.event === 'order_maintenance_worker_started')
  const runs = events.filter((event) => event.event === 'order_maintenance_worker_run')
  const stopped = events.find((event) => event.event === 'order_maintenance_worker_stopped')

  assert(started?.limit === 1, `expected worker limit=1, got ${started?.limit}`)
  assert(started?.now === '1970-01-01T00:00:00.000Z', `expected isolated now override, got ${started?.now}`)
  assert(runs.length === 1, `expected one maintenance worker run, got ${runs.length}`)
  assert(runs[0].processed === 0, `expected isolated worker run to process zero jobs, got ${runs[0].processed}`)
  assert(typeof runs[0].checkoutExpiry?.expired === 'number', 'worker run should include checkout expiry summary')
  assert(typeof runs[0].confirmationTimeout?.cancelled === 'number', 'worker run should include confirmation timeout summary')
  assert(typeof runs[0].deliveryTimeout?.completed === 'number', 'worker run should include delivery timeout summary')
  assert(stopped?.idleRuns === 1, `expected worker to stop after one idle run, got ${stopped?.idleRuns}`)

  record('H2-ORDER-MAINTENANCE-WORKER-01', 'order maintenance worker starts with scheduler-safe interval and threshold configuration')
  record('H2-ORDER-MAINTENANCE-WORKER-02', 'worker run executes checkout expiry, confirmation timeout and delivery timeout jobs through one loop tick')
  record('H2-ORDER-MAINTENANCE-WORKER-03', 'worker exits cleanly after configured idle threshold for operator-managed scheduling')

  console.log(JSON.stringify({ ok: true, evidence }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
