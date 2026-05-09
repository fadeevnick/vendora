import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  authenticate,
  requirePlatformAdmin,
  requireVendorContext,
  requireVendorOwner,
  requireVerifiedEmail,
} from '../../plugins/authenticate.js'
import {
  createListing,
  createProduct,
  getCatalogProductById,
  getCatalogProducts,
  listAdminCatalogListings,
  getPublishedProducts,
  getVendorListings,
  getVendorProducts,
  moderateCatalogListing,
  publishListing,
  publishProduct,
  unpublishListing,
  updateListing,
} from './catalog.service.js'
import {
  createListingSchema,
  createProductSchema,
  moderateListingSchema,
  unpublishListingSchema,
  updateListingSchema,
} from './catalog.schema.js'

function sendCatalogError(reply: FastifyReply, err: unknown, fallback: string) {
  const rawMessage = err instanceof Error ? err.message : fallback
  const [maybeCode, ...messageParts] = rawMessage.split(': ')
  const knownCodes = new Set(['FORBIDDEN', 'RESOURCE_NOT_FOUND', 'VALIDATION_ERROR', 'CATALOG_INVALID_STATE'])
  const isCodedError = knownCodes.has(maybeCode) || maybeCode.includes('_')
  const code = isCodedError ? maybeCode : 'CATALOG_REQUEST_FAILED'
  const message = isCodedError ? messageParts.join(': ') || rawMessage : rawMessage
  const statusCode = code === 'RESOURCE_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 400

  return reply.code(statusCode).send({
    error: {
      code,
      message,
    },
  })
}

function parseCatalogQuery(query: Record<string, unknown>) {
  return {
    q: typeof query['q'] === 'string' ? query['q'] : undefined,
    category: typeof query['category'] === 'string' ? query['category'] : undefined,
    vendorId: typeof query['vendorId'] === 'string' ? query['vendorId'] : undefined,
    inStock: query['inStock'] === 'true',
    page: typeof query['page'] === 'string' ? Number(query['page']) : undefined,
    pageSize: typeof query['pageSize'] === 'string' ? Number(query['pageSize']) : undefined,
  }
}

export async function catalogRoutes(app: FastifyInstance) {
  // Публичный: список опубликованных товаров
  app.get('/products', async (request) => {
    return getPublishedProducts(parseCatalogQuery(request.query as Record<string, unknown>))
  })

  app.get('/catalog/products', async (request, reply) => {
    try {
      const products = await getCatalogProducts(parseCatalogQuery(request.query as Record<string, unknown>))
      return reply.send({ data: products })
    } catch (err: unknown) {
      return sendCatalogError(reply, err, 'Failed to load catalog products')
    }
  })

  app.get('/catalog/products/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      const product = await getCatalogProductById(id)
      return reply.send({ data: product })
    } catch (err: unknown) {
      return sendCatalogError(reply, err, 'Failed to load catalog product')
    }
  })

  app.get('/admin/catalog/listings', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (_request, reply) => {
    try {
      const listings = await listAdminCatalogListings()
      return reply.send({ data: listings })
    } catch (err: unknown) {
      return sendCatalogError(reply, err, 'Failed to load admin catalog listings')
    }
  })

  app.post('/admin/catalog/listings/:id/moderate', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin], schema: moderateListingSchema }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { action: 'APPROVE' | 'SUSPEND'; reason?: string }

    try {
      const listing = await moderateCatalogListing({
        productId: id,
        adminUserId: request.user.sub,
        action: body.action,
        reason: body.reason,
      })
      return reply.send({ data: listing })
    } catch (err: unknown) {
      return sendCatalogError(reply, err, 'Failed to moderate catalog listing')
    }
  })

  // Создать товар (только vendor)
  app.post('/products', { preHandler: [authenticate, requireVerifiedEmail, requireVendorContext], schema: createProductSchema }, async (request, reply) => {
    const { vendorId } = request.user
    if (!vendorId) return reply.code(403).send({ error: 'Vendor workspace access is required' })

    try {
      const product = await createProduct({ ...(request.body as {
        name: string
        description?: string
        category?: string
        price: number
        currency?: string
        stock?: number
        media?: Array<{
          fileName: string
          contentType: string
          sizeBytes: number
          contentBase64: string
          altText?: string
        }>
      }), vendorId })
      return reply.code(201).send(product)
    } catch (err: unknown) {
      return sendCatalogError(reply, err, 'Failed to create product')
    }
  })

  app.post(
    '/vendor/listings',
    { preHandler: [authenticate, requireVerifiedEmail, requireVendorContext], schema: createListingSchema },
    async (request, reply) => {
      const { vendorId } = request.user
      if (!vendorId) return reply.code(403).send({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Vendor workspace access is required' } })

      try {
        const listing = await createListing({
          ...(request.body as {
            title: string
            description: string
            category: string
            priceMinor: number
            currency: string
            stockQty: number
            media?: Array<{
              fileName: string
              contentType: string
              sizeBytes: number
              contentBase64: string
              altText?: string
            }>
          }),
          vendorId,
        })
        return reply.code(201).send({ data: listing })
      } catch (err: unknown) {
        return sendCatalogError(reply, err, 'Failed to create listing')
      }
    },
  )

  // Список своих товаров
  app.get('/products/mine', { preHandler: [authenticate, requireVerifiedEmail, requireVendorContext] }, async (request, reply) => {
    const { vendorId } = request.user
    if (!vendorId) return reply.code(403).send({ error: 'Vendor workspace access is required' })
    return getVendorProducts(vendorId)
  })

  app.get('/vendor/listings', { preHandler: [authenticate, requireVerifiedEmail, requireVendorContext] }, async (request, reply) => {
    const { vendorId } = request.user
    if (!vendorId) return reply.code(403).send({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Vendor workspace access is required' } })

    try {
      const listings = await getVendorListings(vendorId)
      return reply.send({ data: listings })
    } catch (err: unknown) {
      return sendCatalogError(reply, err, 'Failed to load vendor listings')
    }
  })

  app.patch(
    '/vendor/listings/:id',
    { preHandler: [authenticate, requireVerifiedEmail, requireVendorContext], schema: updateListingSchema },
    async (request, reply) => {
      const { vendorId } = request.user
      const { id } = request.params as { id: string }
      if (!vendorId) return reply.code(403).send({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Vendor workspace access is required' } })

      try {
        const listing = await updateListing({
          ...(request.body as {
            title?: string
            description?: string
            category?: string
            priceMinor?: number
            currency?: string
            stockQty?: number
          }),
          listingId: id,
          vendorId,
        })
        return reply.send({ data: listing })
      } catch (err: unknown) {
        return sendCatalogError(reply, err, 'Failed to update listing')
      }
    },
  )

  // Опубликовать товар
  app.post('/products/:id/publish', { preHandler: [authenticate, requireVerifiedEmail, requireVendorOwner] }, async (request, reply) => {
    const { vendorId } = request.user
    if (!vendorId) return reply.code(403).send({ error: 'Vendor workspace access is required' })

    const { id } = request.params as { id: string }
    try {
      const product = await publishProduct(id, vendorId)
      return product
    } catch (err: unknown) {
      return sendCatalogError(reply, err, 'Failed to publish product')
    }
  })

  app.post('/vendor/listings/:id/publish', { preHandler: [authenticate, requireVerifiedEmail, requireVendorOwner] }, async (request, reply) => {
    const { vendorId } = request.user
    const { id } = request.params as { id: string }
    if (!vendorId) return reply.code(403).send({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Vendor workspace access is required' } })

    try {
      const listing = await publishListing(id, vendorId)
      return reply.send({ data: listing })
    } catch (err: unknown) {
      return sendCatalogError(reply, err, 'Failed to publish listing')
    }
  })

  app.post(
    '/vendor/listings/:id/unpublish',
    { preHandler: [authenticate, requireVerifiedEmail, requireVendorOwner], schema: unpublishListingSchema },
    async (request, reply) => {
      const { vendorId } = request.user
      const { id } = request.params as { id: string }
      const { reason } = request.body as { reason?: string }
      if (!vendorId) return reply.code(403).send({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Vendor workspace access is required' } })

      try {
        const listing = await unpublishListing(id, vendorId, reason)
        return reply.send({ data: listing })
      } catch (err: unknown) {
        return sendCatalogError(reply, err, 'Failed to unpublish listing')
      }
    },
  )
}
