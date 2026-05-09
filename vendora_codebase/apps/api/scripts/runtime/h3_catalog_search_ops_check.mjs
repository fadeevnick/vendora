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
  request,
  routeInn,
  runtimeSuffix,
  upsertVerifiedUser,
} from './runtime_helpers.mjs'

const MEILI_URL = process.env.MEILI_URL ?? 'http://127.0.0.1:7700'
const MEILI_MASTER_KEY = process.env.MEILI_MASTER_KEY ?? 'masterkey'
const MEILI_INDEX = process.env.MEILI_CATALOG_INDEX ?? 'vendora_products'

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
  if (taskUid === undefined) return
  const start = Date.now()
  while (Date.now() - start < 10000) {
    const task = await meili(`/tasks/${taskUid}`)
    if (task.status === 'succeeded') return task
    if (task.status === 'failed') throw new Error(`Meili task failed: ${JSON.stringify(task)}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for Meili task ${taskUid}`)
}

async function ensureIndex() {
  try {
    await meili(`/indexes/${MEILI_INDEX}`)
  } catch (err) {
    if (!String(err).includes('index_not_found')) throw err
    const task = await meili('/indexes', {
      method: 'POST',
      body: JSON.stringify({ uid: MEILI_INDEX, primaryKey: 'id' }),
    })
    await waitForTask(task.taskUid ?? task.uid)
  }
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
  const category = `h3-search-ops-${suffix}`
  const buyer = await upsertVerifiedUser(`h3-search-ops-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h3-search-ops-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: routeInn('HSOX', suffix),
    name: `H3 Search Ops Vendor ${suffix}`,
  })
  const blockedUser = await upsertVerifiedUser(`h3-search-ops-blocked-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const blockedVendor = await ensureVendorFixture({
    user: blockedUser,
    inn: routeInn('HSOB', suffix),
    name: `H3 Search Ops Blocked Vendor ${suffix}`,
    status: 'BLOCKED',
  })

  const visible = await ensureProductFixture({
    id: `h3-search-ops-visible-${suffix}`,
    vendorId: vendor.id,
    name: `H3 Search Ops Visible Lens ${suffix}`,
    description: 'Dedicated admin search reindex visible catalog fixture',
    category,
    price: 123,
    stock: 3,
    published: true,
  })
  const draft = await ensureProductFixture({
    id: `h3-search-ops-draft-${suffix}`,
    vendorId: vendor.id,
    name: `H3 Search Ops Draft Lens ${suffix}`,
    description: 'Dedicated admin search reindex draft catalog fixture',
    category,
    price: 123,
    stock: 3,
    published: false,
  })
  const blocked = await ensureProductFixture({
    id: `h3-search-ops-blocked-${suffix}`,
    vendorId: blockedVendor.id,
    name: `H3 Search Ops Blocked Lens ${suffix}`,
    description: 'Dedicated admin search reindex blocked catalog fixture',
    category,
    price: 123,
    stock: 3,
    published: true,
  })
  const staleId = `h3-search-ops-stale-${suffix}`

  await ensureIndex()
  const staleTask = await meili(`/indexes/${MEILI_INDEX}/documents`, {
    method: 'POST',
    body: JSON.stringify([{
      id: staleId,
      name: `H3 Search Ops Stale Lens ${suffix}`,
      description: 'Stale search document not backed by buyer-visible DB state',
      category,
      vendorId: vendor.id,
      vendorName: vendor.name,
      stock: 1,
      inStock: true,
      publishedAt: new Date().toISOString(),
    }]),
  })
  await waitForTask(staleTask.taskUid ?? staleTask.uid)

  const buyerToken = await login(buyer.email)
  const adminToken = await login('admin@vendora.com', true)

  await expectHttpError('/admin/ops/catalog-search/reindex', buyerToken, 403, 'FORBIDDEN', {
    method: 'POST',
    body: JSON.stringify({ dryRun: true }),
  })
  record('H3-CATALOG-SEARCH-OPS-01', 'catalog search reindex endpoint is admin-only')

  const dryRun = await request('/admin/ops/catalog-search/reindex', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ dryRun: true }),
  })
  assert(dryRun.data.mode === 'DRY_RUN', `expected DRY_RUN mode, got ${dryRun.data.mode}`)
  assert(dryRun.data.executed === false, 'dry run should not execute catalog search reindex')
  assert(dryRun.data.backlog.documents >= 1, `expected source documents >= 1, got ${dryRun.data.backlog.documents}`)
  const dryRunIds = await searchIds('Stale Lens', category)
  assert(dryRunIds.includes(staleId), 'dry run should not remove existing search documents')
  record('H3-CATALOG-SEARCH-OPS-02', 'admin dry-run reports source document count without mutating Meilisearch')

  const executed = await request('/admin/ops/catalog-search/reindex', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ dryRun: false }),
  })
  assert(executed.data.mode === 'EXECUTE', `expected EXECUTE mode, got ${executed.data.mode}`)
  assert(executed.data.executed === true, 'execute mode should run catalog search reindex')
  assert(executed.data.result.index === MEILI_INDEX, `expected index ${MEILI_INDEX}, got ${executed.data.result.index}`)
  assert(executed.data.result.documents >= 1, `expected indexed documents >= 1, got ${executed.data.result.documents}`)
  record('H3-CATALOG-SEARCH-OPS-03', 'admin execute mode runs catalog search reindex')

  const visibleIds = await searchIds('Visible Lens', category)
  const allCategoryIds = await searchIds('Lens', category)
  assert(visibleIds.includes(visible.id), 'Meilisearch result should include approved published product after admin reindex')
  assert(!allCategoryIds.includes(draft.id), 'Meilisearch result should exclude draft product after admin reindex')
  assert(!allCategoryIds.includes(blocked.id), 'Meilisearch result should exclude blocked-vendor product after admin reindex')
  assert(!allCategoryIds.includes(staleId), 'Meilisearch result should remove stale non-source document after admin reindex')
  record('H3-CATALOG-SEARCH-OPS-04', 'admin reindex replaces stale index contents with buyer-visible source documents')

  const audit = await prisma.auditEvent.findFirst({
    where: {
      actorUserId: { not: null },
      resourceType: 'catalog_search',
      action: 'ADMIN_CATALOG_SEARCH_REINDEX',
    },
    orderBy: { createdAt: 'desc' },
  })
  assert(audit?.metadata?.result?.documents >= 1, 'admin catalog search reindex should write result audit evidence')
  record('H3-CATALOG-SEARCH-OPS-05', 'admin catalog search reindex writes durable audit evidence')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    visibleProductId: visible.id,
    staleId,
    dryRunBacklog: dryRun.data.backlog,
    executed: executed.data.result,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
