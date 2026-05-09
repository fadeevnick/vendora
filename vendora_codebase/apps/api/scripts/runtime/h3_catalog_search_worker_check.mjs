import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
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
  routeInn,
  runtimeSuffix,
  upsertVerifiedUser,
} from './runtime_helpers.mjs'

const execFileAsync = promisify(execFile)
const MEILI_URL = process.env.MEILI_URL ?? 'http://127.0.0.1:7700'
const MEILI_MASTER_KEY = process.env.MEILI_MASTER_KEY ?? 'masterkey'
const MEILI_INDEX = process.env.MEILI_CATALOG_INDEX ?? 'vendora_products'

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
    'catalog:search-worker',
    '--',
    ...args,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 20_000,
  })

  return parseWorkerEvents(stdout)
}

async function meili(path, options = {}) {
  const response = await fetch(`${MEILI_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MEILI_MASTER_KEY}`,
      ...(options.headers ?? {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Meili ${response.status}: ${JSON.stringify(payload)}`)
  return payload
}

async function searchIds(query, category) {
  const response = await meili(`/indexes/${MEILI_INDEX}/search`, {
    method: 'POST',
    body: JSON.stringify({
      q: query,
      filter: [`category = "${category}"`],
      attributesToRetrieve: ['id', 'name', 'category'],
      limit: 20,
    }),
  })
  return response.hits.map((hit) => hit.id)
}

async function main() {
  const suffix = runtimeSuffix()
  const category = `h3-search-worker-${suffix}`
  const vendorUser = await upsertVerifiedUser(`h3-search-worker-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: routeInn('HSWK', suffix),
    name: `H3 Search Worker Vendor ${suffix}`,
  })
  const visible = await ensureProductFixture({
    id: `h3-search-worker-visible-${suffix}`,
    vendorId: vendor.id,
    name: `H3 Search Worker Visible Lens ${suffix}`,
    description: 'Dedicated catalog search worker fixture',
    category,
    price: 123,
    stock: 3,
    published: true,
  })

  const instanceId = `runtime-catalog-search-${suffix}`
  const events = await runWorker([
    '--interval-ms=50',
    '--once',
  ], { WORKER_INSTANCE_ID: instanceId })
  const started = events.find((event) => event.event === 'catalog_search_worker_started')
  const runs = events.filter((event) => event.event === 'catalog_search_worker_run')
  const stopped = events.find((event) => event.event === 'catalog_search_worker_stopped')

  assert(started?.intervalMs === 50, `expected worker intervalMs=50, got ${started?.intervalMs}`)
  assert(started?.once === true, 'expected worker once=true')
  assert(runs.length === 1, `expected one catalog search worker run, got ${runs.length}`)
  assert(runs[0].index === MEILI_INDEX, `expected index ${MEILI_INDEX}, got ${runs[0].index}`)
  assert(runs[0].processed >= 1, `expected processed documents >= 1, got ${runs[0].processed}`)
  assert(stopped?.runs === 1, `expected worker to stop after one run, got ${stopped?.runs}`)
  record('H3-CATALOG-SEARCH-WORKER-01', 'catalog search worker starts with scheduler-safe interval configuration')
  record('H3-CATALOG-SEARCH-WORKER-02', 'worker run executes full catalog search reindex through one loop tick')

  const [heartbeat, audit, ids] = await Promise.all([
    prisma.workerHeartbeat.findUnique({
      where: {
        workerName_instanceId: {
          workerName: 'catalog_search',
          instanceId,
        },
      },
    }),
    prisma.auditEvent.findFirst({
      where: {
        action: 'CATALOG_SEARCH_REINDEX_WORKER_RUN',
        resourceType: 'catalog_search',
      },
      orderBy: { createdAt: 'desc' },
    }),
    searchIds('Visible Lens', category),
  ])
  assert(ids.includes(visible.id), 'Meilisearch result should include worker-indexed product')
  assert(heartbeat?.status === 'STOPPED', `expected STOPPED heartbeat, got ${heartbeat?.status}`)
  assert(heartbeat.processed >= 1, `expected heartbeat processed >= 1, got ${heartbeat.processed}`)
  assert(Boolean(heartbeat.lastStartedAt), 'worker heartbeat should include lastStartedAt')
  assert(Boolean(heartbeat.lastHeartbeatAt), 'worker heartbeat should include lastHeartbeatAt')
  assert(Boolean(heartbeat.lastStoppedAt), 'worker heartbeat should include lastStoppedAt')
  assert(audit?.metadata?.result?.documents >= 1, 'worker run should write catalog search audit evidence')
  record('H3-CATALOG-SEARCH-WORKER-03', 'worker writes durable heartbeat and audit evidence')

  const adminToken = await login('admin@vendora.com', true)
  const workers = await request('/admin/ops/workers', {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert(workers.data.catalogSearchWorker.status === 'STOPPED', `expected admin catalog search worker STOPPED, got ${workers.data.catalogSearchWorker.status}`)
  assert(workers.data.catalogSearchWorker.heartbeat.instances.some((item) => item.instanceId === instanceId), 'admin workers endpoint should expose catalog search heartbeat instance')
  assert(workers.data.latestActivity.some((item) => item.action === 'CATALOG_SEARCH_REINDEX_WORKER_RUN'), 'admin workers endpoint should expose catalog search worker activity')
  record('H3-CATALOG-SEARCH-WORKER-04', 'admin workers endpoint exposes catalog search worker heartbeat and activity')

  console.log(JSON.stringify({ ok: true, evidence, visibleProductId: visible.id }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
