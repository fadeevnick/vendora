import { prisma } from '../../shared/db.js'

const MEILI_URL = process.env['MEILI_URL'] ?? 'http://127.0.0.1:7700'
const MEILI_MASTER_KEY = process.env['MEILI_MASTER_KEY'] ?? 'masterkey'
const MEILI_INDEX = process.env['MEILI_CATALOG_INDEX'] ?? 'vendora_products'

interface SearchableProduct {
  id: string
  name: string
  description: string | null
  category: string
  currency: string
  stock: number
  published: boolean
  publishedAt: Date | null
  vendorId: string
  vendor: {
    id: string
    name: string
    status: string
  }
}

interface MeiliSearchResponse {
  hits?: Array<{ id?: string }>
}

interface MeiliTaskResponse {
  taskUid?: number
  uid?: number
  status?: string
  error?: unknown
}

function meiliHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${MEILI_MASTER_KEY}`,
  }
}

function toSearchDocument(product: SearchableProduct) {
  return {
    id: product.id,
    name: product.name,
    description: product.description ?? '',
    category: product.category,
    vendorId: product.vendorId,
    vendorName: product.vendor.name,
    stock: product.stock,
    inStock: product.stock > 0,
    publishedAt: product.publishedAt?.toISOString() ?? null,
  }
}

async function meiliRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${MEILI_URL}${path}`, {
    ...init,
    headers: {
      ...meiliHeaders(),
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`MEILI_REQUEST_FAILED: ${response.status} ${body}`)
  }

  return response.json() as Promise<T>
}

async function waitForMeiliTask(taskUid: number | undefined) {
  if (taskUid === undefined) return
  const startedAt = Date.now()

  while (Date.now() - startedAt < 10000) {
    const task = await meiliRequest<MeiliTaskResponse>(`/tasks/${taskUid}`)
    if (task.status === 'succeeded') return
    if (task.status === 'failed') throw new Error(`MEILI_TASK_FAILED: ${JSON.stringify(task.error ?? task)}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(`MEILI_TASK_TIMEOUT: ${taskUid}`)
}

export async function configureCatalogSearchIndex() {
  try {
    await meiliRequest(`/indexes/${MEILI_INDEX}`)
  } catch (err) {
    if (!String(err).includes('index_not_found')) throw err
    const createTask = await meiliRequest<MeiliTaskResponse>('/indexes', {
      method: 'POST',
      body: JSON.stringify({ uid: MEILI_INDEX, primaryKey: 'id' }),
    })
    await waitForMeiliTask(createTask.taskUid ?? createTask.uid)
  }

  const settingsTask = await meiliRequest<MeiliTaskResponse>(`/indexes/${MEILI_INDEX}/settings`, {
    method: 'PATCH',
    body: JSON.stringify({
      searchableAttributes: ['name', 'description', 'vendorName', 'category'],
      filterableAttributes: ['category', 'vendorId', 'inStock'],
      sortableAttributes: ['publishedAt'],
      displayedAttributes: ['id', 'name', 'description', 'category', 'vendorId', 'vendorName', 'stock', 'inStock', 'publishedAt'],
    }),
  })
  await waitForMeiliTask(settingsTask.taskUid ?? settingsTask.uid)
}

export async function reindexCatalogSearch() {
  const products = await prisma.product.findMany({
    where: {
      published: true,
      vendor: { status: 'APPROVED' },
    },
    include: { vendor: { select: { id: true, name: true, status: true } } },
    orderBy: { publishedAt: 'desc' },
  })
  const documents = products.map(toSearchDocument)

  await configureCatalogSearchIndex()
  const deleteTask = await meiliRequest<MeiliTaskResponse>(`/indexes/${MEILI_INDEX}/documents`, {
    method: 'DELETE',
  })
  await waitForMeiliTask(deleteTask.taskUid ?? deleteTask.uid)

  const addTask = await meiliRequest<MeiliTaskResponse>(`/indexes/${MEILI_INDEX}/documents`, {
    method: 'POST',
    body: JSON.stringify(documents),
  })
  await waitForMeiliTask(addTask.taskUid ?? addTask.uid)

  return {
    index: MEILI_INDEX,
    documents: documents.length,
  }
}

export async function syncProductToCatalogSearch(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { vendor: { select: { id: true, name: true, status: true } } },
  })

  if (!product || !product.published || product.vendor.status !== 'APPROVED') {
    await removeProductFromCatalogSearch(productId)
    return { indexed: false }
  }

  await configureCatalogSearchIndex()
  await meiliRequest(`/indexes/${MEILI_INDEX}/documents`, {
    method: 'POST',
    body: JSON.stringify([toSearchDocument(product)]),
  })

  return { indexed: true }
}

export async function removeProductFromCatalogSearch(productId: string) {
  await meiliRequest(`/indexes/${MEILI_INDEX}/documents/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
  })
  return { indexed: false }
}

export async function searchCatalogProductIds(input: {
  q: string
  category?: string
  vendorId?: string
  inStock?: boolean
  limit?: number
}) {
  const filter = [
    input.category ? `category = "${input.category.replaceAll('"', '\\"')}"` : null,
    input.vendorId ? `vendorId = "${input.vendorId.replaceAll('"', '\\"')}"` : null,
    input.inStock ? 'inStock = true' : null,
  ].filter(Boolean)

  const response = await meiliRequest<MeiliSearchResponse>(`/indexes/${MEILI_INDEX}/search`, {
    method: 'POST',
    body: JSON.stringify({
      q: input.q,
      limit: input.limit ?? 100,
      filter: filter.length > 0 ? filter : undefined,
      attributesToRetrieve: ['id'],
    }),
  })

  return (response.hits ?? []).map((hit) => hit.id).filter((id): id is string => Boolean(id))
}
