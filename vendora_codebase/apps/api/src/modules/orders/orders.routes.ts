import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Prisma } from '@prisma/client'
import {
  authenticate,
  requireVendorContext,
  requireVendorRole,
  requireVendorReadRole,
  requireVerifiedEmail,
} from '../../plugins/authenticate.js'
import {
  addCartItem,
  createCheckoutSession,
  getBuyerCheckoutSession,
  getBuyerOrderDetail,
  getCart,
  getVendorOrderDetail,
  isBuyerActor,
  processPaymentWebhook,
  removeCartItem,
  updateCartItem,
  getBuyerOrders,
  getVendorOrders,
  parsePaymentWebhook,
  updateOrderStatus,
  buyerMarkOrderDelivered,
  buyerConfirmReceipt,
  vendorCancelOrder,
  vendorConfirmOrder,
  vendorShipOrder,
} from './orders.service.js'
import {
  addCartItemSchema,
  buyerConfirmReceiptSchema,
  createCheckoutSessionSchema,
  createOrderSchema,
  paymentWebhookSchema,
  vendorShipOrderSchema,
  vendorOrderTransitionSchema,
  updateCartItemSchema,
} from './orders.schema.js'

function sendOrderError(reply: FastifyReply, err: unknown, fallback: string) {
  const rawMessage = err instanceof Error ? err.message : fallback
  const [maybeCode, ...messageParts] = rawMessage.split(': ')
  const knownCodes = new Set(['FORBIDDEN', 'RESOURCE_NOT_FOUND', 'VALIDATION_ERROR', 'IDEMPOTENCY_CONFLICT'])
  const isCodedError = knownCodes.has(maybeCode) || maybeCode.includes('_')
  const code = isCodedError ? maybeCode : 'ORDER_REQUEST_FAILED'
  const message = isCodedError ? messageParts.join(': ') || rawMessage : rawMessage
  const statusCode = code === 'RESOURCE_NOT_FOUND'
    ? 404
    : code === 'FORBIDDEN'
      ? 403
      : code === 'IDEMPOTENCY_CONFLICT' || code === 'ORDER_INVALID_STATE'
        ? 409
        : 400

  return reply.code(statusCode).send({
    error: {
      code,
      message,
    },
  })
}

function requireBuyer(request: { user: { isPlatformAdmin: boolean; accountType: string } }, reply: FastifyReply) {
  if (isBuyerActor(request.user)) return true

  reply.code(403).send({
    error: {
      code: 'FORBIDDEN',
      message: 'Buyer access is required',
    },
  })
  return false
}

export async function orderRoutes(app: FastifyInstance) {
  app.get('/cart', { preHandler: [authenticate, requireVerifiedEmail] }, async (request, reply) => {
    if (!requireBuyer(request, reply)) return

    try {
      const cart = await getCart(request.user.sub)
      return reply.send({ data: cart })
    } catch (err: unknown) {
      return sendOrderError(reply, err, 'Failed to load cart')
    }
  })

  app.post('/cart/items', { preHandler: [authenticate, requireVerifiedEmail], schema: addCartItemSchema }, async (request, reply) => {
    if (!requireBuyer(request, reply)) return

    const { listingId, quantity } = request.body as { listingId: string; quantity: number }
    try {
      const cart = await addCartItem(request.user.sub, listingId, quantity)
      return reply.code(201).send({ data: cart })
    } catch (err: unknown) {
      return sendOrderError(reply, err, 'Failed to add cart item')
    }
  })

  app.patch('/cart/items/:itemId', { preHandler: [authenticate, requireVerifiedEmail], schema: updateCartItemSchema }, async (request, reply) => {
    if (!requireBuyer(request, reply)) return

    const { itemId } = request.params as { itemId: string }
    const { quantity } = request.body as { quantity: number }
    try {
      const cart = await updateCartItem(request.user.sub, itemId, quantity)
      return reply.send({ data: cart })
    } catch (err: unknown) {
      return sendOrderError(reply, err, 'Failed to update cart item')
    }
  })

  app.delete('/cart/items/:itemId', { preHandler: [authenticate, requireVerifiedEmail] }, async (request, reply) => {
    if (!requireBuyer(request, reply)) return

    const { itemId } = request.params as { itemId: string }
    try {
      const cart = await removeCartItem(request.user.sub, itemId)
      return reply.send({ data: cart })
    } catch (err: unknown) {
      return sendOrderError(reply, err, 'Failed to remove cart item')
    }
  })

  app.post('/checkout/sessions', { preHandler: [authenticate, requireVerifiedEmail], schema: createCheckoutSessionSchema }, async (request, reply) => {
    if (!requireBuyer(request, reply)) return

    const idempotencyKey = request.headers['idempotency-key']
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 2) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Idempotency-Key header is required',
        },
      })
    }

    const { cartVersion, shippingAddress } = request.body as {
      cartVersion: number
      shippingAddress: {
        fullName: string
        line1: string
        city: string
        postalCode: string
        country: string
      }
    }

    try {
      const session = await createCheckoutSession({
        buyerId: request.user.sub,
        cartVersion,
        shippingAddress,
        idempotencyKey,
      })
      return reply.code(201).send({ data: session })
    } catch (err: unknown) {
      return sendOrderError(reply, err, 'Failed to create checkout session')
    }
  })

  app.get('/checkout/sessions/:sessionId', { preHandler: [authenticate, requireVerifiedEmail] }, async (request, reply) => {
    if (!requireBuyer(request, reply)) return

    const { sessionId } = request.params as { sessionId: string }
    try {
      const session = await getBuyerCheckoutSession(sessionId, request.user.sub)
      return reply.send({ data: session })
    } catch (err: unknown) {
      return sendOrderError(reply, err, 'Failed to load checkout session')
    }
  })

  app.post('/payments/provider/webhook', { schema: paymentWebhookSchema }, async (request, reply) => {
    try {
      const providerEvent = await parsePaymentWebhook(request.headers, request.body)
      const result = await processPaymentWebhook(providerEvent)
      return reply.send({ data: result })
    } catch (err: unknown) {
      return sendOrderError(reply, err, 'Failed to process payment event')
    }
  })

  app.get('/buyer/orders', { preHandler: [authenticate, requireVerifiedEmail] }, async (request, reply) => {
    if (!requireBuyer(request, reply)) return

    try {
      const orders = await getBuyerOrders(request.user.sub)
      return reply.send({ data: orders })
    } catch (err: unknown) {
      return sendOrderError(reply, err, 'Failed to load buyer orders')
    }
  })

  app.get('/buyer/orders/:orderId', { preHandler: [authenticate, requireVerifiedEmail] }, async (request, reply) => {
    if (!requireBuyer(request, reply)) return

    const { orderId } = request.params as { orderId: string }
    try {
      const order = await getBuyerOrderDetail(orderId, request.user.sub)
      return reply.send({ data: order })
    } catch (err: unknown) {
      return sendOrderError(reply, err, 'Failed to load buyer order')
    }
  })

  app.post('/buyer/orders/:orderId/confirm-receipt', {
    preHandler: [authenticate, requireVerifiedEmail],
    schema: buyerConfirmReceiptSchema,
  }, async (request, reply) => {
    if (!requireBuyer(request, reply)) return

    const { orderId } = request.params as { orderId: string }
    try {
      const order = await buyerConfirmReceipt(orderId, request.user.sub)
      return reply.send({ data: order })
    } catch (err: unknown) {
      return sendOrderError(reply, err, 'Failed to confirm receipt')
    }
  })

  app.post('/buyer/orders/:orderId/mark-delivered', {
    preHandler: [authenticate, requireVerifiedEmail],
    schema: buyerConfirmReceiptSchema,
  }, async (request, reply) => {
    if (!requireBuyer(request, reply)) return

    const { orderId } = request.params as { orderId: string }
    try {
      const order = await buyerMarkOrderDelivered(orderId, request.user.sub)
      return reply.send({ data: order })
    } catch (err: unknown) {
      return sendOrderError(reply, err, 'Failed to mark order delivered')
    }
  })

  app.get('/vendor/orders', {
    preHandler: [
      authenticate,
      requireVerifiedEmail,
      requireVendorContext,
      requireVendorReadRole(['OWNER', 'ADMIN', 'MANAGER', 'VIEWER']),
    ],
  }, async (request, reply) => {
    const { vendorId } = request.user
    if (!vendorId) return reply.code(403).send({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Vendor workspace access is required' } })

    try {
      const orders = await getVendorOrders(vendorId)
      return reply.send({ data: orders })
    } catch (err: unknown) {
      return sendOrderError(reply, err, 'Failed to load vendor orders')
    }
  })

  app.get('/vendor/orders/:orderId', {
    preHandler: [
      authenticate,
      requireVerifiedEmail,
      requireVendorContext,
      requireVendorReadRole(['OWNER', 'ADMIN', 'MANAGER', 'VIEWER']),
    ],
  }, async (request, reply) => {
    const { vendorId } = request.user
    if (!vendorId) return reply.code(403).send({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Vendor workspace access is required' } })

    const { orderId } = request.params as { orderId: string }
    try {
      const order = await getVendorOrderDetail(orderId, vendorId)
      return reply.send({ data: order })
    } catch (err: unknown) {
      return sendOrderError(reply, err, 'Failed to load vendor order')
    }
  })

  app.post('/vendor/orders/:orderId/confirm', {
    preHandler: [
      authenticate,
      requireVerifiedEmail,
      requireVendorContext,
      requireVendorRole(['OWNER', 'ADMIN', 'MANAGER']),
    ],
    schema: vendorOrderTransitionSchema,
  }, async (request, reply) => {
    const { vendorId } = request.user
    if (!vendorId) return reply.code(403).send({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Vendor workspace access is required' } })

    const { orderId } = request.params as { orderId: string }
    try {
      const order = await vendorConfirmOrder(orderId, vendorId, request.user.sub)
      return reply.send({ data: order })
    } catch (err: unknown) {
      return sendOrderError(reply, err, 'Failed to confirm order')
    }
  })

  app.post('/vendor/orders/:orderId/cancel', {
    preHandler: [
      authenticate,
      requireVerifiedEmail,
      requireVendorContext,
      requireVendorRole(['OWNER', 'ADMIN', 'MANAGER']),
    ],
    schema: vendorOrderTransitionSchema,
  }, async (request, reply) => {
    const { vendorId } = request.user
    if (!vendorId) return reply.code(403).send({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Vendor workspace access is required' } })

    const { orderId } = request.params as { orderId: string }
    try {
      const order = await vendorCancelOrder(orderId, vendorId, request.user.sub)
      return reply.send({ data: order })
    } catch (err: unknown) {
      return sendOrderError(reply, err, 'Failed to cancel order')
    }
  })

  app.post('/vendor/orders/:orderId/ship', {
    preHandler: [
      authenticate,
      requireVerifiedEmail,
      requireVendorContext,
      requireVendorRole(['OWNER', 'ADMIN', 'MANAGER']),
    ],
    schema: vendorShipOrderSchema,
  }, async (request, reply) => {
    const { vendorId } = request.user
    if (!vendorId) return reply.code(403).send({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Vendor workspace access is required' } })

    const { orderId } = request.params as { orderId: string }
    const body = request.body as { carrier?: string; trackingNumber?: string; metadata?: Record<string, unknown> } | undefined
    try {
      const order = await vendorShipOrder(orderId, vendorId, request.user.sub, {
        carrier: body?.carrier,
        trackingNumber: body?.trackingNumber,
        metadata: body?.metadata as Prisma.InputJsonValue | undefined,
      })
      return reply.send({ data: order })
    } catch (err: unknown) {
      return sendOrderError(reply, err, 'Failed to ship order')
    }
  })

  // Создать заказ (buyer)
  app.post('/orders', { preHandler: [authenticate, requireVerifiedEmail], schema: createOrderSchema }, async (request, reply) => {
    if (!requireBuyer(request, reply)) return

    return reply.code(409).send({
      error: {
        code: 'CHECKOUT_REQUIRED',
        message: 'Orders must be created through checkout finalization',
      },
    })
  })

  // Мои заказы (buyer)
  app.get('/orders/mine', { preHandler: [authenticate, requireVerifiedEmail] }, async (request, reply) => {
    if (!requireBuyer(request, reply)) return

    return getBuyerOrders(request.user.sub)
  })

  // Заказы vendor
  app.get('/orders/vendor', {
    preHandler: [
      authenticate,
      requireVerifiedEmail,
      requireVendorContext,
      requireVendorReadRole(['OWNER', 'ADMIN', 'MANAGER', 'VIEWER']),
    ],
  }, async (request, reply) => {
    const { vendorId } = request.user
    if (!vendorId) return reply.code(403).send({ error: 'Vendor workspace access is required' })
    return getVendorOrders(vendorId)
  })

  // Обновить статус заказа (vendor)
  app.patch('/orders/:id/status', {
    preHandler: [
      authenticate,
      requireVerifiedEmail,
      requireVendorContext,
      requireVendorRole(['OWNER', 'ADMIN', 'MANAGER']),
    ],
  }, async (request, reply) => {
    const { vendorId } = request.user
    if (!vendorId) return reply.code(403).send({ error: 'Vendor workspace access is required' })

    const { id } = request.params as { id: string }
    const { status } = request.body as { status: string }

    try {
      const order = await updateOrderStatus(id, vendorId, request.user.sub, status)
      return order
    } catch (err: unknown) {
      return sendOrderError(reply, err, 'Failed to update order')
    }
  })
}
