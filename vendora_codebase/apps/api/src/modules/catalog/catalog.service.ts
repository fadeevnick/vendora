import type { Prisma } from '@prisma/client'
import { prisma } from '../../shared/db.js'
import {
  removeProductFromCatalogSearch,
  searchCatalogProductIds,
  syncProductToCatalogSearch,
} from './catalog.search.js'

interface CreateProductInput {
  name: string
  description?: string
  category?: string
  price: number
  currency?: string
  stock?: number
  vendorId: string
  media?: ProductMediaInput[]
}

interface CreateListingInput {
  title: string
  description: string
  category: string
  priceMinor: number
  currency: string
  stockQty: number
  vendorId: string
  media?: ProductMediaInput[]
}

interface UpdateListingInput {
  listingId: string
  vendorId: string
  title?: string
  description?: string
  category?: string
  priceMinor?: number
  currency?: string
  stockQty?: number
}

interface CatalogQuery {
  q?: string
  category?: string
  vendorId?: string
  inStock?: boolean
  page?: number
  pageSize?: number
}

interface ProductMediaInput {
  fileName: string
  contentType: string
  sizeBytes: number
  contentBase64: string
  altText?: string
}

const PRODUCT_MEDIA_MAX_ITEMS = 5
const PRODUCT_MEDIA_MAX_SIZE_BYTES = 512 * 1024
const PRODUCT_MEDIA_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function priceMinorToDecimal(priceMinor: number) {
  return priceMinor / 100
}

function decimalToMinor(price: unknown) {
  return Math.round(Number(price) * 100)
}

function listingStatus(product: { published: boolean; moderationStatus?: string }) {
  if (product.moderationStatus === 'SUSPENDED') return 'SUSPENDED'
  return product.published ? 'PUBLISHED' : 'DRAFT'
}

function normalizeMedia(media: ProductMediaInput[] | undefined) {
  if (!media || media.length === 0) return []
  if (media.length > PRODUCT_MEDIA_MAX_ITEMS) {
    throw new Error(`VALIDATION_ERROR: at most ${PRODUCT_MEDIA_MAX_ITEMS} media items are allowed`)
  }

  return media.map((item, index) => {
    const fileName = item.fileName.trim()
    const contentType = item.contentType.trim()
    const altText = item.altText?.trim()
    if (!fileName) throw new Error('VALIDATION_ERROR: media fileName is required')
    if (!PRODUCT_MEDIA_CONTENT_TYPES.has(contentType)) throw new Error('VALIDATION_ERROR: unsupported product media content type')
    if (!Number.isInteger(item.sizeBytes) || item.sizeBytes <= 0 || item.sizeBytes > PRODUCT_MEDIA_MAX_SIZE_BYTES) {
      throw new Error('VALIDATION_ERROR: product media size is invalid')
    }

    let decodedSize = 0
    try {
      decodedSize = Buffer.from(item.contentBase64, 'base64').byteLength
    } catch {
      throw new Error('VALIDATION_ERROR: product media contentBase64 is invalid')
    }
    if (decodedSize !== item.sizeBytes) throw new Error('VALIDATION_ERROR: product media size does not match content')

    return {
      fileName,
      contentType,
      sizeBytes: item.sizeBytes,
      assetUrl: `data:${contentType};base64,${item.contentBase64}`,
      storageProvider: 'local_inline',
      altText: altText || null,
      sortOrder: index,
    }
  })
}

function toListingView(product: {
  id: string
  vendorId: string
  name: string
  description: string | null
  category: string
  price: unknown
  currency: string
  stock: number
  published: boolean
  publishedAt: Date | null
  unpublishedReason: string | null
  moderationStatus?: string
  moderationReason?: string | null
  moderatedAt?: Date | null
  moderatedByUserId?: string | null
  createdAt: Date
  updatedAt: Date
  media?: Array<{
    id: string
    fileName: string
    contentType: string
    sizeBytes: number
    assetUrl: string
    storageProvider: string
    altText: string | null
    sortOrder: number
    createdAt: Date
  }>
}) {
  return {
    id: product.id,
    listingId: product.id,
    vendorId: product.vendorId,
    title: product.name,
    name: product.name,
    description: product.description,
    category: product.category,
    priceMinor: decimalToMinor(product.price),
    price: String(product.price),
    currency: product.currency,
    stockQty: product.stock,
    stock: product.stock,
    status: listingStatus(product),
    published: product.published,
    publishedAt: product.publishedAt,
    unpublishedReason: product.unpublishedReason,
    moderationStatus: product.moderationStatus ?? 'APPROVED',
    moderationReason: product.moderationReason ?? null,
    moderatedAt: product.moderatedAt ?? null,
    moderatedByUserId: product.moderatedByUserId ?? null,
    media: product.media ?? [],
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  }
}

function toPublicProductView(product: Parameters<typeof toListingView>[0] & {
  vendor: { id: string; name: string; status?: string }
}) {
  return {
    ...toListingView(product),
    vendor: {
      id: product.vendor.id,
      name: product.vendor.name,
    },
    availability: {
      inStock: product.stock > 0,
      stockQty: product.stock,
    },
  }
}

async function requireApprovedVendor(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } })
  if (!vendor) throw new Error('RESOURCE_NOT_FOUND: Vendor not found')
  if (vendor.status !== 'APPROVED') throw new Error('FORBIDDEN: Vendor must be approved before managing listings')
  return vendor
}

export async function createProduct(input: CreateProductInput) {
  await requireApprovedVendor(input.vendorId)
  const media = normalizeMedia(input.media)

  return prisma.product.create({
    data: {
      name: input.name,
      description: input.description,
      category: input.category ?? 'general',
      price: input.price,
      currency: input.currency ?? 'RUB',
      stock: input.stock ?? 0,
      vendorId: input.vendorId,
      media: media.length > 0 ? { create: media } : undefined,
    },
    include: { media: { orderBy: { sortOrder: 'asc' } } },
  })
}

export async function createListing(input: CreateListingInput) {
  await requireApprovedVendor(input.vendorId)
  const media = normalizeMedia(input.media)

  const product = await prisma.product.create({
    data: {
      name: input.title,
      description: input.description,
      category: input.category,
      price: priceMinorToDecimal(input.priceMinor),
      currency: input.currency.toUpperCase(),
      stock: input.stockQty,
      vendorId: input.vendorId,
      published: false,
      media: media.length > 0 ? { create: media } : undefined,
    },
    include: { media: { orderBy: { sortOrder: 'asc' } } },
  })

  return toListingView(product)
}

export async function getVendorProducts(vendorId: string) {
  return prisma.product.findMany({
    where: { vendorId },
    include: { media: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getVendorListings(vendorId: string) {
  const products = await prisma.product.findMany({
    where: { vendorId },
    include: { media: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })
  return products.map(toListingView)
}

export async function getPublishedProducts(query: CatalogQuery = {}) {
  const page = Math.max(query.page ?? 1, 1)
  const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 100)
  let searchIds: string[] | undefined

  if (query.q?.trim()) {
    try {
      searchIds = await searchCatalogProductIds({
        q: query.q.trim(),
        category: query.category,
        vendorId: query.vendorId,
        inStock: query.inStock,
        limit: 1000,
      })
      if (searchIds.length === 0) return []
    } catch {
      searchIds = undefined
    }
  }

  const where: Prisma.ProductWhereInput = {
    published: true,
    moderationStatus: 'APPROVED',
    ...(searchIds ? { id: { in: searchIds } } : {}),
    vendor: {
      status: 'APPROVED' as const,
      ...(query.vendorId ? { id: query.vendorId } : {}),
    },
    ...(query.category ? { category: query.category } : {}),
    ...(query.inStock ? { stock: { gt: 0 } } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' as const } },
            { description: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  return prisma.product.findMany({
    where,
    include: {
      vendor: { select: { id: true, name: true } },
      media: { orderBy: { sortOrder: 'asc' } },
    },
    orderBy: searchIds ? undefined : { publishedAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: searchIds ? undefined : pageSize,
  }).then((products) => {
    if (!searchIds) return products
    const order = new Map(searchIds.map((id, index) => [id, index]))
    return products
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .slice((page - 1) * pageSize, page * pageSize)
  })
}

export async function getCatalogProducts(query: CatalogQuery = {}) {
  const products = await getPublishedProducts(query)
  return products.map(toPublicProductView)
}

export async function getCatalogProductById(productId: string) {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      published: true,
      moderationStatus: 'APPROVED',
      vendor: {
        status: 'APPROVED',
      },
    },
    include: {
      vendor: { select: { id: true, name: true } },
      media: { orderBy: { sortOrder: 'asc' } },
    },
  })

  if (!product) throw new Error('RESOURCE_NOT_FOUND: Product not found')
  return toPublicProductView(product)
}

export async function updateListing(input: UpdateListingInput) {
  await requireApprovedVendor(input.vendorId)
  const product = await prisma.product.findFirst({
    where: { id: input.listingId, vendorId: input.vendorId },
  })
  if (!product) throw new Error('RESOURCE_NOT_FOUND: Listing not found')
  if (product.published) throw new Error('CATALOG_INVALID_STATE: published listings cannot be edited in R1')

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: {
      name: input.title,
      description: input.description,
      category: input.category,
      price: input.priceMinor === undefined ? undefined : priceMinorToDecimal(input.priceMinor),
      currency: input.currency?.toUpperCase(),
      stock: input.stockQty,
    },
  })

  const withMedia = await prisma.product.findUniqueOrThrow({
    where: { id: updated.id },
    include: { media: { orderBy: { sortOrder: 'asc' } } },
  })

  return toListingView(withMedia)
}

export async function listAdminCatalogListings() {
  const products = await prisma.product.findMany({
    include: {
      vendor: { select: { id: true, name: true, status: true } },
      media: { orderBy: { sortOrder: 'asc' } },
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: 100,
  })

  return products.map((product) => ({
    ...toPublicProductView(product),
    vendor: product.vendor,
  }))
}

export async function moderateCatalogListing(input: {
  productId: string
  adminUserId: string
  action: 'APPROVE' | 'SUSPEND'
  reason?: string
}) {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { vendor: { select: { id: true, name: true, status: true } } },
  })
  if (!product) throw new Error('RESOURCE_NOT_FOUND: Product not found')

  const moderationStatus = input.action === 'APPROVE' ? 'APPROVED' : 'SUSPENDED'
  const reason = input.reason?.trim() || (input.action === 'APPROVE' ? null : 'admin_suspended')
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.product.update({
      where: { id: product.id },
      data: {
        moderationStatus,
        moderationReason: reason,
        moderatedAt: new Date(),
        moderatedByUserId: input.adminUserId,
      },
      include: {
        vendor: { select: { id: true, name: true, status: true } },
        media: { orderBy: { sortOrder: 'asc' } },
      },
    })

    await tx.auditEvent.create({
      data: {
        actorUserId: input.adminUserId,
        action: input.action === 'APPROVE' ? 'CATALOG_LISTING_APPROVED' : 'CATALOG_LISTING_SUSPENDED',
        resourceType: 'product',
        resourceId: product.id,
        metadata: {
          vendorId: product.vendorId,
          from: product.moderationStatus,
          to: moderationStatus,
          reason,
        },
      },
    })

    return next
  })

  await syncProductToCatalogSearch(product.id).catch(() => null)
  return {
    ...toPublicProductView(updated),
    vendor: updated.vendor,
  }
}

export async function publishProduct(productId: string, vendorId: string) {
  await requireApprovedVendor(vendorId)
  const product = await prisma.product.findFirst({
    where: { id: productId, vendorId },
  })
  if (!product) throw new Error('RESOURCE_NOT_FOUND: Product not found')
  if (!product.description || !product.category || Number(product.price) <= 0) {
    throw new Error('VALIDATION_ERROR: Listing is missing required publish fields')
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      published: true,
      publishedAt: product.publishedAt ?? new Date(),
      unpublishedReason: null,
    },
  })
  await syncProductToCatalogSearch(productId).catch(() => null)

  return prisma.product.findUniqueOrThrow({
    where: { id: updated.id },
    include: { media: { orderBy: { sortOrder: 'asc' } } },
  })
}

export async function publishListing(productId: string, vendorId: string) {
  const product = await publishProduct(productId, vendorId)
  return toListingView(product)
}

export async function unpublishListing(productId: string, vendorId: string, reason?: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, vendorId },
  })
  if (!product) throw new Error('RESOURCE_NOT_FOUND: Listing not found')

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: {
      published: false,
      publishedAt: null,
      unpublishedReason: reason ?? 'vendor_unpublished',
    },
  })
  await removeProductFromCatalogSearch(product.id).catch(() => null)

  const withMedia = await prisma.product.findUniqueOrThrow({
    where: { id: updated.id },
    include: { media: { orderBy: { sortOrder: 'asc' } } },
  })

  return toListingView(withMedia)
}
