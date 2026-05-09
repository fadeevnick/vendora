import crypto from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../shared/db.js'
import { enqueueForVendorOwners, enqueueNotification } from '../notifications/notifications.service.js'
import { createPaymentProvider } from './payment-providers.js'

interface OrderItem {
  productId: string
  qty: number
}

interface ShippingAddress {
  fullName: string
  line1: string
  city: string
  postalCode: string
  country: string
}

interface CreateCheckoutSessionInput {
  buyerId: string
  cartVersion: number
  shippingAddress: ShippingAddress
  idempotencyKey: string
}

interface PaymentWebhookInput {
  providerName: string
  providerEventId: string
  checkoutSessionId: string
  eventType: 'PAYMENT_SUCCEEDED' | 'PAYMENT_FAILED'
  rawPayload: unknown
}

interface ShipmentDetails {
  carrier?: string
  trackingNumber?: string
  metadata?: Prisma.InputJsonValue
}

const CHECKOUT_IDEMPOTENCY_ROUTE = 'POST:/checkout/sessions'
const CHECKOUT_SESSION_TTL_MS = 24 * 60 * 60 * 1000
const VENDOR_ORDER_ACTIONS = {
  confirm: { from: 'PAYMENT_HELD', to: 'CONFIRMED', auditAction: 'ORDER_VENDOR_CONFIRMED' },
  cancel: { from: 'PAYMENT_HELD', to: 'CANCELLED', auditAction: 'ORDER_VENDOR_CANCELLED' },
  ship: { from: 'CONFIRMED', to: 'SHIPPED', auditAction: 'ORDER_VENDOR_SHIPPED' },
} as const

type VendorOrderAction = keyof typeof VENDOR_ORDER_ACTIONS
type OrderTimelineActor = 'buyer' | 'vendor' | 'system'

interface OrderTimelineEvent {
  id: string
  code: string
  label: string
  status: string
  actor: OrderTimelineActor
  actorUserId: string | null
  happenedAt: Date
  metadata: Prisma.JsonValue | null
}

const ORDER_TIMELINE_ACTIONS: Record<string, { label: string; actor: OrderTimelineActor; status: string }> = {
  ORDER_VENDOR_CONFIRMED: { label: 'Vendor accepted the order', actor: 'vendor', status: 'CONFIRMED' },
  ORDER_VENDOR_SHIPPED: { label: 'Vendor shipped the order', actor: 'vendor', status: 'SHIPPED' },
  ORDER_BUYER_MARKED_DELIVERED: { label: 'Buyer marked the order delivered', actor: 'buyer', status: 'DELIVERED' },
  ORDER_BUYER_RECEIPT_CONFIRMED: { label: 'Buyer confirmed receipt', actor: 'buyer', status: 'COMPLETED' },
  ORDER_VENDOR_CANCELLED: { label: 'Vendor cancelled the order', actor: 'vendor', status: 'CANCELLED' },
  ORDER_AUTO_CANCELLED_CONFIRMATION_TIMEOUT: { label: 'Order auto-cancelled after vendor confirmation timeout', actor: 'system', status: 'CANCELLED' },
  ORDER_AUTO_COMPLETED_DELIVERY_TIMEOUT: { label: 'Order auto-completed after delivery timeout', actor: 'system', status: 'COMPLETED' },
}

function decimalToMinor(price: unknown) {
  return Math.round(Number(price) * 100)
}

function minorToDecimal(amountMinor: number) {
  return amountMinor / 100
}

function hashPayload(payload: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function isBuyerActor(user: { isPlatformAdmin?: boolean; accountType?: string }) {
  return !user.isPlatformAdmin && user.accountType === 'BUYER'
}

function orderNumber() {
  return `ORD-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

function compareTimelineEvents(a: OrderTimelineEvent, b: OrderTimelineEvent) {
  const diff = a.happenedAt.getTime() - b.happenedAt.getTime()
  if (diff !== 0) return diff
  return a.id.localeCompare(b.id)
}

async function getOrderTimeline(order: {
  id: string
  orderNumber: string
  status: string
  createdAt: Date
  checkoutSessionId: string | null
  funds?: { status: string; amountMinor: number; currency: string } | null
}): Promise<OrderTimelineEvent[]> {
  const audits = await prisma.auditEvent.findMany({
    where: {
      resourceType: 'order',
      resourceId: order.id,
      action: { in: Object.keys(ORDER_TIMELINE_ACTIONS) },
    },
    orderBy: { createdAt: 'asc' },
  })

  const createdEvent: OrderTimelineEvent = {
    id: `order-created-${order.id}`,
    code: 'ORDER_PAYMENT_HELD',
    label: 'Payment authorized and vendor order created',
    status: 'PAYMENT_HELD',
    actor: 'system',
    actorUserId: null,
    happenedAt: order.createdAt,
    metadata: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      checkoutSessionId: order.checkoutSessionId,
      fundStatus: order.funds?.status ?? null,
      amountMinor: order.funds?.amountMinor ?? null,
      currency: order.funds?.currency ?? null,
    },
  }

  const auditEvents = audits.map<OrderTimelineEvent>((audit) => {
    const config = ORDER_TIMELINE_ACTIONS[audit.action]
    return {
      id: audit.id,
      code: audit.action,
      label: config.label,
      status: config.status,
      actor: config.actor,
      actorUserId: audit.actorUserId,
      happenedAt: audit.createdAt,
      metadata: audit.metadata,
    }
  })

  return [createdEvent, ...auditEvents].sort(compareTimelineEvents)
}

async function getOrCreateCart(buyerId: string) {
  const existing = await prisma.cart.findUnique({ where: { buyerUserId: buyerId } })
  if (existing) return existing

  return prisma.cart.create({
    data: {
      buyerUserId: buyerId,
      currency: 'RUB',
    },
  })
}

function assertEligibleProduct(product: {
  published: boolean
  stock: number
  vendor: { status: string }
}, quantity: number) {
  assertProductSellableForCheckout(product)

  if (product.stock < quantity) {
    throw new Error('VALIDATION_ERROR: requested quantity exceeds available stock')
  }
}

function assertProductSellableForCheckout(product: {
  published: boolean
  vendor: { status: string }
}) {
  if (!product.published || product.vendor.status !== 'APPROVED') {
    throw new Error('VALIDATION_ERROR: listing is not eligible for checkout')
  }
}

async function reserveStockForCheckout(
  tx: Prisma.TransactionClient,
  checkoutSessionId: string,
  cartItems: Array<{ productId: string; quantity: number }>,
) {
  for (const item of cartItems) {
    const reserved = await tx.product.updateMany({
      where: {
        id: item.productId,
        stock: { gte: item.quantity },
      },
      data: {
        stock: { decrement: item.quantity },
      },
    })
    if (reserved.count !== 1) {
      throw new Error('VALIDATION_ERROR: requested quantity exceeds available stock')
    }

    await tx.stockReservation.create({
      data: {
        checkoutSessionId,
        productId: item.productId,
        quantity: item.quantity,
      },
    })
  }
}

async function releaseReservedStock(tx: Prisma.TransactionClient, checkoutSessionId: string) {
  const reservations = await tx.stockReservation.findMany({
    where: {
      checkoutSessionId,
      status: 'RESERVED',
    },
  })

  for (const reservation of reservations) {
    const released = await tx.stockReservation.updateMany({
      where: {
        id: reservation.id,
        status: 'RESERVED',
      },
      data: {
        status: 'RELEASED',
      },
    })
    if (released.count === 1) {
      await tx.product.update({
        where: { id: reservation.productId },
        data: { stock: { increment: reservation.quantity } },
      })
    }
  }
}

function assertReservedStockForSession(
  cartItems: Array<{ productId: string; quantity: number }>,
  reservations: Array<{ productId: string; quantity: number; status: string }>,
) {
  const reservedByProduct = new Map(reservations.map((reservation) => [reservation.productId, reservation]))

  for (const item of cartItems) {
    const reservation = reservedByProduct.get(item.productId)
    if (!reservation || reservation.status !== 'RESERVED' || reservation.quantity !== item.quantity) {
      throw new Error('STOCK_RESERVATION_INVALID_STATE: checkout stock reservation is missing or stale')
    }
  }
}

async function commitReservedStock(
  tx: Prisma.TransactionClient,
  checkoutSessionId: string,
  expectedReservationCount: number,
) {
  const committed = await tx.stockReservation.updateMany({
    where: {
      checkoutSessionId,
      status: 'RESERVED',
    },
    data: {
      status: 'COMMITTED',
    },
  })
  if (committed.count !== expectedReservationCount) {
    throw new Error('STOCK_RESERVATION_INVALID_STATE: checkout stock reservation is missing or stale')
  }
}

async function returnOrderItemsToStock(tx: Prisma.TransactionClient, orderId: string) {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: {
      productId: true,
      qty: true,
    },
  })

  let returnedQuantity = 0
  for (const item of items) {
    await tx.product.update({
      where: { id: item.productId },
      data: { stock: { increment: item.qty } },
    })
    returnedQuantity += item.qty
  }

  return returnedQuantity
}

async function createProcessedPaymentEvent(
  tx: Prisma.TransactionClient,
  input: PaymentWebhookInput,
  payloadHash: string,
) {
  return tx.paymentProviderEvent.create({
    data: {
      providerName: input.providerName,
      providerEventId: input.providerEventId,
      checkoutSessionId: input.checkoutSessionId,
      eventType: input.eventType,
      payloadHash,
      processedAt: new Date(),
    },
  })
}

async function loadCartForValidation(buyerId: string) {
  const cart = await prisma.cart.findUnique({
    where: { buyerUserId: buyerId },
    include: {
      items: {
        include: {
          product: {
            include: {
              vendor: true,
            },
          },
          vendor: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!cart) throw new Error('VALIDATION_ERROR: cart is empty')
  if (cart.items.length === 0) throw new Error('VALIDATION_ERROR: cart is empty')

  return cart
}

function toCartView(cart: Awaited<ReturnType<typeof loadCartForValidation>>) {
  const groups = new Map<string, {
    vendorId: string
    vendorName: string
    subtotalMinor: number
    items: unknown[]
  }>()
  let totalMinor = 0

  for (const item of cart.items) {
    const currentUnitPriceMinor = decimalToMinor(item.product.price)
    const lineTotalMinor = currentUnitPriceMinor * item.quantity
    totalMinor += lineTotalMinor
    const group = groups.get(item.vendorId) ?? {
      vendorId: item.vendorId,
      vendorName: item.vendor.name,
      subtotalMinor: 0,
      items: [],
    }

    group.subtotalMinor += lineTotalMinor
    group.items.push({
      id: item.id,
      listingId: item.productId,
      title: item.product.name,
      quantity: item.quantity,
      unitPriceMinorSnapshot: item.unitPriceMinorSnapshot,
      currentUnitPriceMinor,
      currency: item.currency,
      stockQty: item.product.stock,
      eligible: item.product.published && item.product.vendor.status === 'APPROVED',
    })
    groups.set(item.vendorId, group)
  }

  return {
    id: cart.id,
    version: cart.version,
    currency: cart.currency,
    totalMinor,
    groups: Array.from(groups.values()),
  }
}

async function getCheckoutSessionView(sessionId: string, buyerId: string) {
  const session = await prisma.checkoutSession.findFirst({
    where: {
      id: sessionId,
      buyerUserId: buyerId,
    },
    include: {
      orders: {
        select: {
          id: true,
          orderNumber: true,
          vendorId: true,
          status: true,
          total: true,
        },
      },
    },
  })

  if (!session) throw new Error('RESOURCE_NOT_FOUND: checkout session not found')

  return {
    checkoutSessionId: session.id,
    paymentProvider: session.providerName,
    providerSessionSecret: session.providerSessionId,
    status: session.status,
    totalMinor: session.totalMinor,
    currency: session.currency,
    expiresAt: session.expiresAt.toISOString(),
    orderIds: session.orders.map((order) => order.id),
    orders: session.orders.map((order) => ({
      ...order,
      total: order.total.toString(),
    })),
  }
}

async function validateCartForCheckout(buyerId: string, cartVersion: number) {
  const cart = await loadCartForValidation(buyerId)
  if (cart.version !== cartVersion) {
    throw new Error('VALIDATION_ERROR: cart version changed')
  }

  const currencies = new Set<string>()
  let totalMinor = 0

  for (const item of cart.items) {
    assertEligibleProduct(item.product, item.quantity)
    const currentUnitPriceMinor = decimalToMinor(item.product.price)
    if (currentUnitPriceMinor !== item.unitPriceMinorSnapshot) {
      throw new Error('VALIDATION_ERROR: cart price snapshot is stale')
    }
    currencies.add(item.currency)
    totalMinor += currentUnitPriceMinor * item.quantity
  }

  if (currencies.size !== 1) {
    throw new Error('VALIDATION_ERROR: checkout supports a single currency in R1')
  }

  return {
    cart,
    totalMinor,
    currency: Array.from(currencies)[0] ?? 'RUB',
  }
}

export async function getCart(buyerId: string) {
  await getOrCreateCart(buyerId)
  const cart = await loadCartForValidation(buyerId).catch(async (err: unknown) => {
    if (err instanceof Error && err.message.includes('cart is empty')) {
      const empty = await prisma.cart.findUnique({
        where: { buyerUserId: buyerId },
        include: { items: { include: { product: { include: { vendor: true } }, vendor: true } } },
      })
      if (!empty) throw err
      return empty
    }
    throw err
  })
  return toCartView(cart)
}

export async function addCartItem(buyerId: string, productId: string, quantity: number) {
  const product = await prisma.product.findFirst({
    where: { id: productId },
    include: { vendor: true },
  })
  if (!product) throw new Error('RESOURCE_NOT_FOUND: listing not found')
  assertEligibleProduct(product, quantity)

  const cart = await getOrCreateCart(buyerId)
  if (cart.currency !== product.currency && cart.currency !== 'RUB') {
    throw new Error('VALIDATION_ERROR: cart supports a single currency in R1')
  }

  const existing = await prisma.cartItem.findUnique({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId,
      },
    },
  })
  const nextQuantity = (existing?.quantity ?? 0) + quantity
  assertEligibleProduct(product, nextQuantity)

  await prisma.$transaction([
    prisma.cartItem.upsert({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId,
        },
      },
      update: {
        quantity: nextQuantity,
        unitPriceMinorSnapshot: decimalToMinor(product.price),
        currency: product.currency,
      },
      create: {
        cartId: cart.id,
        productId,
        vendorId: product.vendorId,
        quantity,
        unitPriceMinorSnapshot: decimalToMinor(product.price),
        currency: product.currency,
      },
    }),
    prisma.cart.update({
      where: { id: cart.id },
      data: {
        currency: product.currency,
        version: { increment: 1 },
      },
    }),
  ])

  return getCart(buyerId)
}

export async function updateCartItem(buyerId: string, itemId: string, quantity: number) {
  const cart = await prisma.cart.findUnique({ where: { buyerUserId: buyerId } })
  if (!cart) throw new Error('RESOURCE_NOT_FOUND: cart not found')

  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
    include: { product: { include: { vendor: true } } },
  })
  if (!item) throw new Error('RESOURCE_NOT_FOUND: cart item not found')
  assertEligibleProduct(item.product, quantity)

  await prisma.$transaction([
    prisma.cartItem.update({
      where: { id: item.id },
      data: {
        quantity,
        unitPriceMinorSnapshot: decimalToMinor(item.product.price),
        currency: item.product.currency,
      },
    }),
    prisma.cart.update({
      where: { id: cart.id },
      data: { version: { increment: 1 } },
    }),
  ])

  return getCart(buyerId)
}

export async function removeCartItem(buyerId: string, itemId: string) {
  const cart = await prisma.cart.findUnique({ where: { buyerUserId: buyerId } })
  if (!cart) throw new Error('RESOURCE_NOT_FOUND: cart not found')

  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } })
  if (!item) throw new Error('RESOURCE_NOT_FOUND: cart item not found')

  await prisma.$transaction([
    prisma.cartItem.delete({ where: { id: item.id } }),
    prisma.cart.update({
      where: { id: cart.id },
      data: { version: { increment: 1 } },
    }),
  ])

  return getCart(buyerId)
}

export async function createCheckoutSession(input: CreateCheckoutSessionInput) {
  const requestHash = hashPayload({
    cartVersion: input.cartVersion,
    shippingAddress: input.shippingAddress,
  })

  const existing = await prisma.idempotencyRecord.findUnique({
    where: {
      actorUserId_routeKey_idempotencyKey: {
        actorUserId: input.buyerId,
        routeKey: CHECKOUT_IDEMPOTENCY_ROUTE,
        idempotencyKey: input.idempotencyKey,
      },
    },
  })

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new Error('IDEMPOTENCY_CONFLICT: idempotency key was reused with a different request')
    }
    return getCheckoutSessionView(existing.responseRefId, input.buyerId)
  }

  const { cart, totalMinor, currency } = await validateCartForCheckout(input.buyerId, input.cartVersion)
  const checkoutExpiresAt = new Date(Date.now() + CHECKOUT_SESSION_TTL_MS)
  const reservedSessionId = crypto.randomUUID()
  const paymentSession = await createPaymentProvider().createCheckoutSession({
    checkoutSessionId: reservedSessionId,
    buyerUserId: input.buyerId,
    amountMinor: totalMinor,
    currency,
  })

  const session = await prisma.$transaction(async (tx) => {
    const checkoutSession = await tx.checkoutSession.create({
      data: {
        id: reservedSessionId,
        buyerUserId: input.buyerId,
        cartId: cart.id,
        cartVersion: cart.version,
        shippingAddressJson: input.shippingAddress as unknown as Prisma.InputJsonValue,
        totalMinor,
        currency,
        providerName: paymentSession.providerName,
        providerSessionId: paymentSession.providerSessionId,
        expiresAt: checkoutExpiresAt,
      },
    })

    await reserveStockForCheckout(tx, checkoutSession.id, cart.items)

    await tx.idempotencyRecord.create({
      data: {
        actorUserId: input.buyerId,
        routeKey: CHECKOUT_IDEMPOTENCY_ROUTE,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        responseRefType: 'checkout_session',
        responseRefId: checkoutSession.id,
        expiresAt: checkoutExpiresAt,
      },
    })

    return checkoutSession
  })

  return getCheckoutSessionView(session.id, input.buyerId)
}

export async function getBuyerCheckoutSession(sessionId: string, buyerId: string) {
  return getCheckoutSessionView(sessionId, buyerId)
}

export async function parsePaymentWebhook(headers: Record<string, string | string[] | undefined>, body: unknown) {
  return createPaymentProvider().parseWebhook({ headers, body })
}

export async function processPaymentWebhook(input: PaymentWebhookInput) {
  const payloadHash = hashPayload(input.rawPayload)
  const existingEvent = await prisma.paymentProviderEvent.findUnique({
    where: { providerEventId: input.providerEventId },
    include: { checkoutSession: { include: { orders: true } } },
  })
  if (existingEvent?.processedAt) {
    return {
      processed: false,
      duplicate: true,
      checkoutSessionId: existingEvent.checkoutSessionId,
      orderIds: existingEvent.checkoutSession?.orders.map((order) => order.id) ?? [],
    }
  }

  const session = await prisma.checkoutSession.findUnique({
    where: { id: input.checkoutSessionId },
    include: {
      buyer: true,
      cart: {
        include: {
          items: {
            include: {
              product: {
                include: { vendor: true },
              },
            },
          },
        },
      },
      orders: true,
      stockReservations: true,
    },
  })
  if (!session) throw new Error('RESOURCE_NOT_FOUND: checkout session not found')

  if (session.status === 'SUCCEEDED' || session.orders.length > 0) {
    await prisma.$transaction((tx) => createProcessedPaymentEvent(tx, input, payloadHash))
    return {
      processed: false,
      duplicate: true,
      checkoutSessionId: session.id,
      orderIds: session.orders.map((order) => order.id),
    }
  }

  if (input.eventType === 'PAYMENT_FAILED' && session.status === 'FAILED') {
    await prisma.$transaction((tx) => createProcessedPaymentEvent(tx, input, payloadHash))
    return { processed: false, duplicate: true, checkoutSessionId: session.id, orderIds: [] }
  }

  if (session.status === 'EXPIRED') {
    await prisma.$transaction((tx) => createProcessedPaymentEvent(tx, input, payloadHash))
    return { processed: false, duplicate: true, checkoutSessionId: session.id, orderIds: [] }
  }

  if (input.eventType === 'PAYMENT_FAILED') {
    await prisma.$transaction(async (tx) => {
      await createProcessedPaymentEvent(tx, input, payloadHash)
      await releaseReservedStock(tx, session.id)
      await tx.checkoutSession.update({
        where: { id: session.id },
        data: { status: 'FAILED' },
      })
      await enqueueNotification({
        eventType: 'CHECKOUT_PAYMENT_FAILED',
        recipientUserId: session.buyerUserId,
        recipientEmail: session.buyer.email,
        subject: 'Vendora payment failed',
        templateKey: 'checkout.payment_failed.buyer',
        payload: {
          checkoutSessionId: session.id,
          totalMinor: session.totalMinor,
          currency: session.currency,
        },
        referenceType: 'checkout_session',
        referenceId: session.id,
      }, tx)
    })

    return { processed: true, duplicate: false, checkoutSessionId: session.id, orderIds: [] }
  }

  if (session.status === 'FAILED') {
    throw new Error('STOCK_RESERVATION_INVALID_STATE: checkout payment already failed')
  }

  for (const item of session.cart.items) {
    assertProductSellableForCheckout(item.product)
    if (decimalToMinor(item.product.price) !== item.unitPriceMinorSnapshot) {
      throw new Error('VALIDATION_ERROR: cart price snapshot is stale')
    }
  }
  assertReservedStockForSession(session.cart.items, session.stockReservations)

  const createdOrders = await prisma.$transaction(async (tx) => {
    const event = await tx.paymentProviderEvent.create({
      data: {
        providerName: input.providerName,
        providerEventId: input.providerEventId,
        checkoutSessionId: session.id,
        eventType: input.eventType,
        payloadHash,
      },
    })

    await commitReservedStock(tx, session.id, session.cart.items.length)

    const byVendor = new Map<string, typeof session.cart.items>()
    for (const item of session.cart.items) {
      const vendorItems = byVendor.get(item.vendorId) ?? []
      vendorItems.push(item)
      byVendor.set(item.vendorId, vendorItems)
    }

    const orders = []
    for (const [vendorId, vendorItems] of byVendor.entries()) {
      const totalMinor = vendorItems.reduce((sum, item) => sum + item.unitPriceMinorSnapshot * item.quantity, 0)
      const order = await tx.order.create({
        data: {
          checkoutSessionId: session.id,
          orderNumber: orderNumber(),
          buyerId: session.buyerUserId,
          vendorId,
          total: minorToDecimal(totalMinor),
          shippingAddressJson: session.shippingAddressJson as Prisma.InputJsonValue,
          buyerEmailSnapshot: session.buyer.email,
          items: {
            create: vendorItems.map((item) => ({
              productId: item.productId,
              qty: item.quantity,
              price: minorToDecimal(item.unitPriceMinorSnapshot),
              listingTitleSnapshot: item.product.name,
              unitPriceMinor: item.unitPriceMinorSnapshot,
              lineTotalMinor: item.unitPriceMinorSnapshot * item.quantity,
            })),
          },
        },
      })

      await tx.orderFund.create({
        data: {
          orderId: order.id,
          vendorId,
          status: 'HELD',
          amountMinor: totalMinor,
          currency: session.currency,
        },
      })
      await enqueueNotification({
        eventType: 'ORDER_PAYMENT_HELD_BUYER',
        recipientUserId: session.buyerUserId,
        recipientEmail: session.buyer.email,
        subject: 'Vendora order created',
        templateKey: 'order.payment_held.buyer',
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          checkoutSessionId: session.id,
          vendorId,
          totalMinor,
          currency: session.currency,
        },
        referenceType: 'order',
        referenceId: order.id,
      }, tx)
      await enqueueForVendorOwners({
        vendorId,
        eventType: 'ORDER_PAYMENT_HELD_VENDOR',
        subject: 'New Vendora order',
        templateKey: 'order.payment_held.vendor',
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          checkoutSessionId: session.id,
          buyerEmail: session.buyer.email,
          totalMinor,
          currency: session.currency,
        },
        referenceType: 'order',
        referenceId: order.id,
      }, tx)
      orders.push(order)
    }

    await tx.checkoutSession.update({
      where: { id: session.id },
      data: {
        status: 'SUCCEEDED',
        completedAt: new Date(),
      },
    })

    await tx.cartItem.deleteMany({ where: { cartId: session.cartId } })
    await tx.cart.update({
      where: { id: session.cartId },
      data: { version: { increment: 1 } },
    })

    await tx.paymentProviderEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date() },
    })

    return orders
  })

  return {
    processed: true,
    duplicate: false,
    checkoutSessionId: session.id,
    orderIds: createdOrders.map((order) => order.id),
  }
}

export async function expireAbandonedCheckoutSessions(input: { now?: Date; limit?: number } = {}) {
  const now = input.now ?? new Date()
  const limit = input.limit ?? 50
  const candidates = await prisma.checkoutSession.findMany({
    where: {
      status: 'AWAITING_PAYMENT',
      expiresAt: { lte: now },
      orders: { none: {} },
      stockReservations: { some: { status: 'RESERVED' } },
    },
    orderBy: { expiresAt: 'asc' },
    take: limit,
    select: { id: true },
  })

  let expired = 0
  let releasedReservations = 0
  let releasedQuantity = 0

  for (const candidate of candidates) {
    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.checkoutSession.findUnique({
        where: { id: candidate.id },
        include: {
          orders: true,
          stockReservations: true,
        },
      })
      if (!session || session.status !== 'AWAITING_PAYMENT' || session.expiresAt > now || session.orders.length > 0) {
        return { expired: false, releasedReservations: 0, releasedQuantity: 0 }
      }

      const reservations = session.stockReservations.filter((reservation) => reservation.status === 'RESERVED')
      if (reservations.length === 0) {
        return { expired: false, releasedReservations: 0, releasedQuantity: 0 }
      }

      await releaseReservedStock(tx, session.id)
      await tx.checkoutSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      })

      return {
        expired: true,
        releasedReservations: reservations.length,
        releasedQuantity: reservations.reduce((sum, reservation) => sum + reservation.quantity, 0),
      }
    })

    if (result.expired) expired += 1
    releasedReservations += result.releasedReservations
    releasedQuantity += result.releasedQuantity
  }

  return {
    checked: candidates.length,
    expired,
    releasedReservations,
    releasedQuantity,
  }
}

export async function createOrders(buyerId: string, items: OrderItem[]) {
  const productIds = items.map((i) => i.productId)
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      published: true,
      vendor: { status: 'APPROVED' },
    },
    include: { vendor: true },
  })

  if (products.length !== productIds.length) {
    throw new Error('Some products are unavailable')
  }

  const byVendor = new Map<string, { product: typeof products[0]; qty: number }[]>()
  for (const item of items) {
    const product = products.find((p) => p.id === item.productId)!
    assertEligibleProduct(product, item.qty)
    const group = byVendor.get(product.vendorId) ?? []
    group.push({ product, qty: item.qty })
    byVendor.set(product.vendorId, group)
  }

  const orders = await prisma.$transaction(
    Array.from(byVendor.entries()).map(([vendorId, vendorItems]) => {
      const total = vendorItems.reduce((sum, { product, qty }) => {
        return sum + Number(product.price) * qty
      }, 0)

      return prisma.order.create({
        data: {
          buyerId,
          vendorId,
          total,
          buyerEmailSnapshot: undefined,
          items: {
            create: vendorItems.map(({ product, qty }) => ({
              productId: product.id,
              qty,
              price: product.price,
              listingTitleSnapshot: product.name,
              unitPriceMinor: decimalToMinor(product.price),
              lineTotalMinor: decimalToMinor(product.price) * qty,
            })),
          },
        },
        include: { items: true, vendor: { select: { id: true, name: true } } },
      })
    }),
  )

  return orders
}

export async function getBuyerOrders(buyerId: string) {
  return prisma.order.findMany({
    where: { buyerId },
    include: {
      items: { include: { product: { select: { id: true, name: true } } } },
      vendor: { select: { id: true, name: true } },
      funds: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getBuyerOrderDetail(orderId: string, buyerId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId },
    include: {
      items: { include: { product: { select: { id: true, name: true } } } },
      vendor: { select: { id: true, name: true } },
      funds: true,
      dispute: true,
    },
  })

  if (!order) throw new Error('RESOURCE_NOT_FOUND: order not found')
  const timeline = await getOrderTimeline(order)
  return { ...order, timeline }
}

export async function getVendorOrders(vendorId: string) {
  return prisma.order.findMany({
    where: { vendorId },
    include: {
      items: { include: { product: { select: { id: true, name: true } } } },
      buyer: { select: { id: true, email: true } },
      funds: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getVendorOrderDetail(orderId: string, vendorId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, vendorId },
    include: {
      items: { include: { product: { select: { id: true, name: true } } } },
      buyer: { select: { id: true, email: true } },
      funds: true,
      dispute: true,
    },
  })

  if (!order) throw new Error('RESOURCE_NOT_FOUND: order not found')
  const timeline = await getOrderTimeline(order)
  return { ...order, timeline }
}

async function applyVendorOrderAction(
  orderId: string,
  vendorId: string,
  actorUserId: string,
  action: VendorOrderAction,
  shipment?: ShipmentDetails,
) {
  const transition = VENDOR_ORDER_ACTIONS[action]
  const order = await prisma.order.findFirst({
    where: { id: orderId, vendorId },
    include: { funds: true },
  })
  if (!order) throw new Error('RESOURCE_NOT_FOUND: order not found')
  if (order.status !== transition.from) {
    throw new Error(`ORDER_INVALID_STATE: expected ${transition.from}, got ${order.status}`)
  }
  if ((action === 'cancel' || action === 'confirm') && !order.funds) {
    throw new Error('VALIDATION_ERROR: order fund record is missing')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const orderUpdate: Prisma.OrderUpdateInput = { status: transition.to }
    if (action === 'ship') {
      orderUpdate.shipmentCarrier = shipment?.carrier ?? null
      orderUpdate.shipmentTrackingNumber = shipment?.trackingNumber ?? null
      orderUpdate.shipmentMetadataJson = shipment?.metadata ?? undefined
      orderUpdate.shippedAt = new Date()
    }

    const nextOrder = await tx.order.update({
      where: { id: order.id },
      data: orderUpdate,
      include: {
        items: { include: { product: { select: { id: true, name: true } } } },
        buyer: { select: { id: true, email: true } },
        funds: true,
        dispute: true,
      },
    })

    const returnedStockQuantity = action === 'cancel' ? await returnOrderItemsToStock(tx, order.id) : 0

    if (action === 'cancel') {
      await tx.orderFund.update({
        where: { orderId: order.id },
        data: { status: 'RETURNED_TO_BUYER' },
      })
    }

    await tx.auditEvent.create({
      data: {
        actorUserId,
        action: transition.auditAction,
        resourceType: 'order',
        resourceId: order.id,
        metadata: {
          from: order.status,
          to: transition.to,
          vendorId,
          fundStatus: action === 'cancel' ? 'RETURNED_TO_BUYER' : order.funds?.status,
          returnedStockQuantity: action === 'cancel' ? returnedStockQuantity : undefined,
          shipmentCarrier: action === 'ship' ? shipment?.carrier ?? null : undefined,
          shipmentTrackingNumber: action === 'ship' ? shipment?.trackingNumber ?? null : undefined,
        },
      },
    })

    await enqueueNotification({
      eventType: action === 'cancel' ? 'ORDER_CANCELLED_BUYER' : action === 'ship' ? 'ORDER_SHIPPED_BUYER' : 'ORDER_CONFIRMED_BUYER',
      recipientUserId: nextOrder.buyer.id,
      recipientEmail: nextOrder.buyer.email,
      subject: action === 'cancel' ? 'Vendora order cancelled' : action === 'ship' ? 'Vendora order shipped' : 'Vendora order confirmed',
      templateKey: action === 'cancel' ? 'order.cancelled.buyer' : action === 'ship' ? 'order.shipped.buyer' : 'order.confirmed.buyer',
      payload: {
        orderId: order.id,
        orderNumber: nextOrder.orderNumber,
        vendorId,
        from: order.status,
        to: transition.to,
        fundStatus: action === 'cancel' ? 'RETURNED_TO_BUYER' : order.funds?.status,
        returnedStockQuantity: action === 'cancel' ? returnedStockQuantity : undefined,
        shipmentCarrier: action === 'ship' ? shipment?.carrier ?? null : undefined,
        shipmentTrackingNumber: action === 'ship' ? shipment?.trackingNumber ?? null : undefined,
      },
      referenceType: 'order',
      referenceId: order.id,
    }, tx)

    return nextOrder
  })

  return getVendorOrderDetail(updated.id, vendorId)
}

export async function vendorConfirmOrder(orderId: string, vendorId: string, actorUserId: string) {
  return applyVendorOrderAction(orderId, vendorId, actorUserId, 'confirm')
}

export async function vendorCancelOrder(orderId: string, vendorId: string, actorUserId: string) {
  return applyVendorOrderAction(orderId, vendorId, actorUserId, 'cancel')
}

export async function vendorShipOrder(orderId: string, vendorId: string, actorUserId: string, shipment?: ShipmentDetails) {
  return applyVendorOrderAction(orderId, vendorId, actorUserId, 'ship', shipment)
}

export async function autoCancelUnconfirmedOrders(input: { now?: Date; olderThanHours?: number; limit?: number } = {}) {
  const now = input.now ?? new Date()
  const olderThanHours = input.olderThanHours ?? 48
  const limit = input.limit ?? 50
  const cutoff = new Date(now.getTime() - olderThanHours * 60 * 60 * 1000)

  const candidates = await prisma.order.findMany({
    where: {
      status: 'PAYMENT_HELD',
      createdAt: { lte: cutoff },
      funds: { status: 'HELD' },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  })

  let cancelled = 0
  let returnedFunds = 0
  let returnedAmountMinor = 0

  for (const candidate of candidates) {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: candidate.id },
        include: {
          buyer: { select: { id: true, email: true } },
          funds: true,
        },
      })
      if (!order || order.status !== 'PAYMENT_HELD' || order.createdAt > cutoff) {
        return { cancelled: false, returnedFunds: 0, returnedAmountMinor: 0 }
      }
      if (!order.funds || order.funds.status !== 'HELD') {
        return { cancelled: false, returnedFunds: 0, returnedAmountMinor: 0 }
      }

      const orderUpdate = await tx.order.updateMany({
        where: {
          id: order.id,
          status: 'PAYMENT_HELD',
          createdAt: { lte: cutoff },
        },
        data: { status: 'CANCELLED' },
      })
      if (orderUpdate.count !== 1) {
        return { cancelled: false, returnedFunds: 0, returnedAmountMinor: 0 }
      }

      const fundUpdate = await tx.orderFund.updateMany({
        where: {
          orderId: order.id,
          status: 'HELD',
        },
        data: { status: 'RETURNED_TO_BUYER' },
      })
      if (fundUpdate.count !== 1) {
        throw new Error(`ORDER_FUND_CONFLICT: expected held funds for unconfirmed order ${order.id}`)
      }

      const returnedStockQuantity = await returnOrderItemsToStock(tx, order.id)

      await tx.auditEvent.create({
        data: {
          actorUserId: null,
          action: 'ORDER_AUTO_CANCELLED_CONFIRMATION_TIMEOUT',
          resourceType: 'order',
          resourceId: order.id,
          metadata: {
            from: order.status,
            to: 'CANCELLED',
            fundStatus: 'RETURNED_TO_BUYER',
            returnedStockQuantity,
            orderCreatedAt: order.createdAt.toISOString(),
            cutoff: cutoff.toISOString(),
          },
        },
      })
      await enqueueNotification({
        eventType: 'ORDER_AUTO_CANCELLED_BUYER',
        recipientUserId: order.buyer.id,
        recipientEmail: order.buyer.email,
        subject: 'Vendora order cancelled',
        templateKey: 'order.auto_cancelled.buyer',
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          from: order.status,
          to: 'CANCELLED',
          fundStatus: 'RETURNED_TO_BUYER',
          returnedStockQuantity,
        },
        referenceType: 'order',
        referenceId: order.id,
      }, tx)
      await enqueueForVendorOwners({
        vendorId: order.vendorId,
        eventType: 'ORDER_AUTO_CANCELLED_VENDOR',
        subject: 'Vendora order auto-cancelled',
        templateKey: 'order.auto_cancelled.vendor',
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          from: order.status,
          to: 'CANCELLED',
          fundStatus: 'RETURNED_TO_BUYER',
          returnedStockQuantity,
        },
        referenceType: 'order',
        referenceId: order.id,
      }, tx)

      return {
        cancelled: true,
        returnedFunds: 1,
        returnedAmountMinor: order.funds.amountMinor,
      }
    })

    if (result.cancelled) cancelled += 1
    returnedFunds += result.returnedFunds
    returnedAmountMinor += result.returnedAmountMinor
  }

  return {
    checked: candidates.length,
    cancelled,
    returnedFunds,
    returnedAmountMinor,
  }
}

export async function buyerMarkOrderDelivered(orderId: string, buyerId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId },
    include: { funds: true },
  })
  if (!order) throw new Error('RESOURCE_NOT_FOUND: order not found')
  if (order.status !== 'SHIPPED') {
    throw new Error(`ORDER_INVALID_STATE: expected SHIPPED, got ${order.status}`)
  }
  if (!order.funds) throw new Error('VALIDATION_ERROR: order fund record is missing')

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date(),
      },
    })
    await tx.auditEvent.create({
      data: {
        actorUserId: buyerId,
        action: 'ORDER_BUYER_MARKED_DELIVERED',
        resourceType: 'order',
        resourceId: order.id,
        metadata: {
          from: order.status,
          to: 'DELIVERED',
          fundStatus: order.funds?.status,
        },
      },
    })
    await enqueueForVendorOwners({
      vendorId: order.vendorId,
      eventType: 'ORDER_DELIVERED_VENDOR',
      subject: 'Vendora order delivered',
      templateKey: 'order.delivered.vendor',
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerId,
        from: order.status,
        to: 'DELIVERED',
        fundStatus: order.funds?.status,
      },
      referenceType: 'order',
      referenceId: order.id,
    }, tx)
  })

  return getBuyerOrderDetail(order.id, buyerId)
}

export async function buyerConfirmReceipt(orderId: string, buyerId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId },
    include: { funds: true },
  })
  if (!order) throw new Error('RESOURCE_NOT_FOUND: order not found')
  if (order.status !== 'SHIPPED' && order.status !== 'DELIVERED') {
    throw new Error(`ORDER_INVALID_STATE: expected SHIPPED or DELIVERED, got ${order.status}`)
  }
  if (!order.funds) throw new Error('VALIDATION_ERROR: order fund record is missing')

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'COMPLETED' },
    })
    await tx.orderFund.update({
      where: { orderId: order.id },
      data: { status: 'RELEASABLE' },
    })
    await tx.auditEvent.create({
      data: {
        actorUserId: buyerId,
        action: 'ORDER_BUYER_RECEIPT_CONFIRMED',
        resourceType: 'order',
        resourceId: order.id,
        metadata: {
          from: order.status,
          to: 'COMPLETED',
          fundStatus: 'RELEASABLE',
        },
      },
    })
    await enqueueForVendorOwners({
      vendorId: order.vendorId,
      eventType: 'ORDER_RECEIPT_CONFIRMED_VENDOR',
      subject: 'Vendora order receipt confirmed',
      templateKey: 'order.receipt_confirmed.vendor',
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerId,
        from: order.status,
        to: 'COMPLETED',
        fundStatus: 'RELEASABLE',
      },
      referenceType: 'order',
      referenceId: order.id,
    }, tx)
  })

  return getBuyerOrderDetail(order.id, buyerId)
}

export async function autoCompleteDeliveredOrders(input: { now?: Date; olderThanHours?: number; limit?: number } = {}) {
  const now = input.now ?? new Date()
  const olderThanHours = input.olderThanHours ?? 72
  const limit = input.limit ?? 50
  const cutoff = new Date(now.getTime() - olderThanHours * 60 * 60 * 1000)

  const candidates = await prisma.order.findMany({
    where: {
      status: 'DELIVERED',
      deliveredAt: { lte: cutoff },
      funds: { status: 'HELD' },
    },
    orderBy: { deliveredAt: 'asc' },
    take: limit,
    select: { id: true },
  })

  let completed = 0
  let releasedFunds = 0
  let releasedAmountMinor = 0

  for (const candidate of candidates) {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: candidate.id },
        include: {
          buyer: { select: { id: true, email: true } },
          funds: true,
        },
      })
      if (!order || order.status !== 'DELIVERED' || !order.deliveredAt || order.deliveredAt > cutoff) {
        return { completed: false, releasedFunds: 0, releasedAmountMinor: 0 }
      }
      if (!order.funds || order.funds.status !== 'HELD') {
        return { completed: false, releasedFunds: 0, releasedAmountMinor: 0 }
      }

      const orderUpdate = await tx.order.updateMany({
        where: {
          id: order.id,
          status: 'DELIVERED',
          deliveredAt: { lte: cutoff },
        },
        data: { status: 'COMPLETED' },
      })
      if (orderUpdate.count !== 1) {
        return { completed: false, releasedFunds: 0, releasedAmountMinor: 0 }
      }

      const fundUpdate = await tx.orderFund.updateMany({
        where: {
          orderId: order.id,
          status: 'HELD',
        },
        data: { status: 'RELEASABLE' },
      })
      if (fundUpdate.count !== 1) {
        throw new Error(`ORDER_FUND_CONFLICT: expected held funds for delivered order ${order.id}`)
      }
      await tx.auditEvent.create({
        data: {
          actorUserId: null,
          action: 'ORDER_AUTO_COMPLETED_DELIVERY_TIMEOUT',
          resourceType: 'order',
          resourceId: order.id,
          metadata: {
            from: order.status,
            to: 'COMPLETED',
            fundStatus: 'RELEASABLE',
            deliveredAt: order.deliveredAt.toISOString(),
            cutoff: cutoff.toISOString(),
          },
        },
      })
      await enqueueNotification({
        eventType: 'ORDER_AUTO_COMPLETED_BUYER',
        recipientUserId: order.buyer.id,
        recipientEmail: order.buyer.email,
        subject: 'Vendora order completed',
        templateKey: 'order.auto_completed.buyer',
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          from: order.status,
          to: 'COMPLETED',
          fundStatus: 'RELEASABLE',
        },
        referenceType: 'order',
        referenceId: order.id,
      }, tx)
      await enqueueForVendorOwners({
        vendorId: order.vendorId,
        eventType: 'ORDER_AUTO_COMPLETED_VENDOR',
        subject: 'Vendora order auto-completed',
        templateKey: 'order.auto_completed.vendor',
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          from: order.status,
          to: 'COMPLETED',
          fundStatus: 'RELEASABLE',
        },
        referenceType: 'order',
        referenceId: order.id,
      }, tx)

      return {
        completed: true,
        releasedFunds: 1,
        releasedAmountMinor: order.funds.amountMinor,
      }
    })

    if (result.completed) completed += 1
    releasedFunds += result.releasedFunds
    releasedAmountMinor += result.releasedAmountMinor
  }

  return {
    checked: candidates.length,
    completed,
    releasedFunds,
    releasedAmountMinor,
  }
}

export async function updateOrderStatus(orderId: string, vendorId: string, actorUserId: string, status: string) {
  if (status === 'CONFIRMED') return vendorConfirmOrder(orderId, vendorId, actorUserId)
  if (status === 'CANCELLED') return vendorCancelOrder(orderId, vendorId, actorUserId)
  if (status === 'SHIPPED') return vendorShipOrder(orderId, vendorId, actorUserId)

  throw new Error(`ORDER_INVALID_STATE: vendor cannot set status ${status}`)
}

export { isBuyerActor }
