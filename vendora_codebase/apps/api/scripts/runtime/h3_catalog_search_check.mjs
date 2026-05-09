import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  assert,
  disconnect,
  ensureProductFixture,
  ensureVendorFixture,
  evidence,
  prisma,
  record,
  runtimeSuffix,
  upsertVerifiedUser,
} from './runtime_helpers.mjs'

const MEILI_URL = process.env.MEILI_URL ?? 'http://127.0.0.1:7700'
const MEILI_MASTER_KEY = process.env.MEILI_MASTER_KEY ?? 'masterkey'
const MEILI_INDEX = process.env.MEILI_CATALOG_INDEX ?? 'vendora_products'
const API_ROOT = fileURLToPath(new URL('../..', import.meta.url))

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

async function waitForTask(taskUid) {
  const start = Date.now()
  while (Date.now() - start < 10000) {
    const task = await meili(`/tasks/${taskUid}`)
    if (task.status === 'succeeded') return task
    if (task.status === 'failed') throw new Error(`Meili task failed: ${JSON.stringify(task)}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for Meili task ${taskUid}`)
}

async function main() {
  const suffix = runtimeSuffix()
  const vendorUser = await upsertVerifiedUser(`h3-search-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H3SEARCHAPPROVED${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H3 Search Approved Vendor ${suffix}`,
  })
  const blockedUser = await upsertVerifiedUser(`h3-search-blocked-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const blockedVendor = await ensureVendorFixture({
    user: blockedUser,
    inn: `H3SEARCHBLOCKED${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H3 Search Blocked Vendor ${suffix}`,
    status: 'BLOCKED',
  })

  const visible = await ensureProductFixture({
    id: `h3-search-visible-${suffix}`,
    vendorId: vendor.id,
    name: `H3 Search Visible Lens ${suffix}`,
    description: 'Dedicated Meilisearch visible catalog fixture',
    category: 'h3-search',
    price: 123,
    stock: 3,
    published: true,
  })
  const draft = await ensureProductFixture({
    id: `h3-search-draft-${suffix}`,
    vendorId: vendor.id,
    name: `H3 Search Draft Lens ${suffix}`,
    description: 'Dedicated Meilisearch draft catalog fixture',
    category: 'h3-search',
    price: 123,
    stock: 3,
    published: false,
  })
  const blocked = await ensureProductFixture({
    id: `h3-search-blocked-${suffix}`,
    vendorId: blockedVendor.id,
    name: `H3 Search Blocked Lens ${suffix}`,
    description: 'Dedicated Meilisearch blocked catalog fixture',
    category: 'h3-search',
    price: 123,
    stock: 3,
    published: true,
  })

  try {
    const clearTask = await meili(`/indexes/${MEILI_INDEX}/documents`, { method: 'DELETE' })
    if (clearTask.taskUid !== undefined) await waitForTask(clearTask.taskUid)
  } catch (err) {
    if (!String(err).includes('index_not_found')) throw err
  }

  const result = spawnSync('npm', ['run', 'catalog:reindex-search', '--silent'], {
    cwd: API_ROOT,
    env: process.env,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`catalog:reindex-search failed\n${result.stdout}\n${result.stderr}`)
  }
  const summary = JSON.parse(result.stdout)
  assert(summary.ok === true, 'reindex summary should be ok')
  assert(summary.documents > 0, 'reindex should write at least one document')
  record('H3-CATALOG-SEARCH-01', 'catalog reindex command writes buyer-visible documents to Meilisearch')

  let search
  const start = Date.now()
  while (Date.now() - start < 10000) {
    search = await meili(`/indexes/${MEILI_INDEX}/search`, {
      method: 'POST',
      body: JSON.stringify({
        q: 'Visible Lens',
        filter: ['category = "h3-search"', 'inStock = true'],
        attributesToRetrieve: ['id', 'name', 'vendorId'],
        limit: 20,
      }),
    })
    if (search.hits.some((hit) => hit.id === visible.id)) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  const ids = search.hits.map((hit) => hit.id)
  assert(ids.includes(visible.id), 'Meilisearch result should include approved published product')
  assert(!ids.includes(draft.id), 'Meilisearch result should exclude draft product')
  assert(!ids.includes(blocked.id), 'Meilisearch result should exclude blocked-vendor product')
  record('H3-CATALOG-SEARCH-02', 'Meilisearch index excludes draft and blocked-vendor products')

  console.log(JSON.stringify({ ok: true, evidence, visibleProductId: visible.id }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
