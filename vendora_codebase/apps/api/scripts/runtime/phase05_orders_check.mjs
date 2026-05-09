import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const API = process.env.RUNTIME_API_URL ?? 'http://127.0.0.1:3001'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const evidence = []

function record(id, detail) {
  evidence.push({ id, detail })
  console.log(`${id}: ${detail}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = payload.error ?? {}
    const code = typeof error === 'object' ? error.code : undefined
    const message = typeof error === 'object' ? error.message : error
    const err = new Error(message || `HTTP ${response.status}`)
    err.status = response.status
    err.code = code
    err.payload = payload
    throw err
  }
  return payload
}

async function expectHttpError(path, token, expectedStatus, expectedCode) {
  try {
    await request(path, { headers: { Authorization: `Bearer ${token}` } })
  } catch (err) {
    assert(err.status === expectedStatus, `expected ${expectedStatus}, got ${err.status} for ${path}`)
    if (expectedCode) assert(err.code === expectedCode, `expected ${expectedCode}, got ${err.code}`)
    return
  }
  throw new Error(`expected ${path} to fail`)
}

async function login(email) {
  const response = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'password123' }),
  })
  return response.data.token
}

async function setupFixtures() {
  const hash = await bcrypt.hash('password123', 10)
  const verifiedNow = new Date()

  const buyer = await prisma.user.upsert({
    where: { email: 'phase05-buyer@vendora.local' },
    update: {
      password: hash,
      accountType: 'BUYER',
      emailVerifiedAt: verifiedNow,
      isPlatformAdmin: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    create: {
      email: 'phase05-buyer@vendora.local',
      password: hash,
      accountType: 'BUYER',
      emailVerifiedAt: verifiedNow,
    },
  })

  await prisma.user.upsert({
    where: { email: 'phase05-other-buyer@vendora.local' },
    update: {
      password: hash,
      accountType: 'BUYER',
      emailVerifiedAt: verifiedNow,
      isPlatformAdmin: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    create: {
      email: 'phase05-other-buyer@vendora.local',
      password: hash,
      accountType: 'BUYER',
      emailVerifiedAt: verifiedNow,
    },
  })

  const vendorUser = await prisma.user.upsert({
    where: { email: 'phase05-vendor2@vendora.local' },
    update: {
      password: hash,
      accountType: 'VENDOR_OWNER',
      emailVerifiedAt: verifiedNow,
      isPlatformAdmin: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    create: {
      email: 'phase05-vendor2@vendora.local',
      password: hash,
      accountType: 'VENDOR_OWNER',
      emailVerifiedAt: verifiedNow,
    },
  })

  const vendor = await prisma.vendor.upsert({
    where: { inn: 'PHASE05VENDOR2' },
    update: {
      name: 'Phase 05 Vendor Two',
      status: 'APPROVED',
      legalEntityName: 'Phase 05 Vendor Two LLC',
      country: 'RU',
      addressJson: { line1: '2 Runtime Street', city: 'Moscow', postalCode: '101001' },
      salesCategory: 'electronics',
      approvedAt: verifiedNow,
      reviewedAt: verifiedNow,
    },
    create: {
      name: 'Phase 05 Vendor Two',
      inn: 'PHASE05VENDOR2',
      status: 'APPROVED',
      legalEntityName: 'Phase 05 Vendor Two LLC',
      country: 'RU',
      addressJson: { line1: '2 Runtime Street', city: 'Moscow', postalCode: '101001' },
      salesCategory: 'electronics',
      approvedAt: verifiedNow,
      reviewedAt: verifiedNow,
    },
  })

  await prisma.vendorMember.upsert({
    where: { userId_vendorId: { userId: vendorUser.id, vendorId: vendor.id } },
    update: { role: 'OWNER' },
    create: { userId: vendorUser.id, vendorId: vendor.id, role: 'OWNER' },
  })

  await prisma.vendorApplication.upsert({
    where: { vendorId: vendor.id },
    update: {
      status: 'APPROVED',
      businessName: vendor.name,
      legalEntityName: 'Phase 05 Vendor Two LLC',
      taxId: vendor.inn,
      country: 'RU',
      addressJson: { line1: '2 Runtime Street', city: 'Moscow', postalCode: '101001' },
      salesCategory: 'electronics',
      submittedByUserId: vendorUser.id,
      submittedAt: verifiedNow,
      reviewedAt: verifiedNow,
    },
    create: {
      vendorId: vendor.id,
      status: 'APPROVED',
      businessName: vendor.name,
      legalEntityName: 'Phase 05 Vendor Two LLC',
      taxId: vendor.inn,
      country: 'RU',
      addressJson: { line1: '2 Runtime Street', city: 'Moscow', postalCode: '101001' },
      salesCategory: 'electronics',
      submittedByUserId: vendorUser.id,
      submittedAt: verifiedNow,
      reviewedAt: verifiedNow,
    },
  })

  const vendor2Product = await prisma.product.upsert({
    where: { id: 'phase05-vendor2-product' },
    update: {
      vendorId: vendor.id,
      name: 'Phase 05 Runtime Cable',
      description: 'Runtime order fixture',
      category: 'electronics',
      price: 2500,
      currency: 'RUB',
      stock: 50,
      published: true,
      publishedAt: verifiedNow,
    },
    create: {
      id: 'phase05-vendor2-product',
      vendorId: vendor.id,
      name: 'Phase 05 Runtime Cable',
      description: 'Runtime order fixture',
      category: 'electronics',
      price: 2500,
      currency: 'RUB',
      stock: 50,
      published: true,
      publishedAt: verifiedNow,
    },
  })

  const buyerCart = await prisma.cart.findUnique({ where: { buyerUserId: buyer.id } })
  if (buyerCart) {
    await prisma.cartItem.deleteMany({ where: { cartId: buyerCart.id } })
    await prisma.cart.update({ where: { id: buyerCart.id }, data: { version: { increment: 1 } } })
  }

  const vendor1Product = await prisma.product.findFirst({
    where: { published: true, vendor: { status: 'APPROVED', inn: '7700000001' } },
    orderBy: { createdAt: 'asc' },
  })
  assert(vendor1Product, 'seed vendor product is missing')
  await prisma.product.update({
    where: { id: vendor1Product.id },
    data: {
      stock: 50,
      published: true,
      publishedAt: vendor1Product.publishedAt ?? verifiedNow,
    },
  })

  return { vendor1Product, vendor2Product }
}

async function main() {
  const { vendor1Product, vendor2Product } = await setupFixtures()
  const buyerToken = await login('phase05-buyer@vendora.local')
  const otherBuyerToken = await login('phase05-other-buyer@vendora.local')
  const vendor1Token = await login('vendor@vendora.com')
  const vendor2Token = await login('phase05-vendor2@vendora.local')

  let cart = await request('/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ listingId: vendor1Product.id, quantity: 1 }),
  })
  cart = await request('/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ listingId: vendor2Product.id, quantity: 1 }),
  })

  const checkout = await request('/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${buyerToken}`,
      'Idempotency-Key': `phase05-${Date.now()}`,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: {
        fullName: 'Phase 05 Buyer',
        line1: '5 Runtime Ave',
        city: 'Moscow',
        postalCode: '101005',
        country: 'RU',
      },
    }),
  })

  const webhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `phase05-${checkout.data.checkoutSessionId}`,
      checkoutSessionId: checkout.data.checkoutSessionId,
      eventType: 'PAYMENT_SUCCEEDED',
    }),
  })
  assert(webhook.data.orderIds.length === 2, 'checkout should create two vendor orders')

  const orders = await prisma.order.findMany({
    where: { id: { in: webhook.data.orderIds } },
    include: { funds: true },
  })
  const vendor1Order = orders.find((order) => order.vendorId === vendor1Product.vendorId)
  const vendor2Order = orders.find((order) => order.vendorId === vendor2Product.vendorId)
  assert(vendor1Order, 'vendor1 order missing')
  assert(vendor2Order, 'vendor2 order missing')
  assert(orders.every((order) => order.status === 'PAYMENT_HELD' && order.funds?.status === 'HELD'), 'new orders should start with held payment and funds')
  record('R1-ORD-01', 'checkout-created vendor orders start as PAYMENT_HELD with HELD funds')

  const vendor1Queue = await request('/vendor/orders', { headers: { Authorization: `Bearer ${vendor1Token}` } })
  const vendor2Queue = await request('/vendor/orders', { headers: { Authorization: `Bearer ${vendor2Token}` } })
  assert(vendor1Queue.data.some((order) => order.id === vendor1Order.id), 'vendor1 cannot see own order')
  assert(!vendor1Queue.data.some((order) => order.id === vendor2Order.id), 'vendor1 queue leaked vendor2 order')
  assert(vendor2Queue.data.some((order) => order.id === vendor2Order.id), 'vendor2 cannot see own order')
  assert(!vendor2Queue.data.some((order) => order.id === vendor1Order.id), 'vendor2 queue leaked vendor1 order')
  await expectHttpError(`/vendor/orders/${vendor2Order.id}`, vendor1Token, 404, 'RESOURCE_NOT_FOUND')
  await expectHttpError(`/vendor/orders/${vendor1Order.id}`, vendor2Token, 404, 'RESOURCE_NOT_FOUND')
  record('R1-ORD-02', 'vendor order queue/detail is tenant-scoped')

  const buyerDetail = await request(`/buyer/orders/${vendor1Order.id}`, { headers: { Authorization: `Bearer ${buyerToken}` } })
  assert(buyerDetail.data.id === vendor1Order.id, 'buyer cannot read own order detail')
  await expectHttpError(`/buyer/orders/${vendor1Order.id}`, otherBuyerToken, 404, 'RESOURCE_NOT_FOUND')
  record('R1-ORD-03', 'buyer order detail is self-scoped')

  let transitioned = await request(`/vendor/orders/${vendor1Order.id}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendor1Token}` },
    body: JSON.stringify({}),
  })
  assert(transitioned.data.status === 'CONFIRMED', 'vendor confirm did not move order to CONFIRMED')
  try {
    await request(`/vendor/orders/${vendor1Order.id}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${vendor1Token}` },
      body: JSON.stringify({}),
    })
    throw new Error('duplicate confirm unexpectedly succeeded')
  } catch (err) {
    assert(err.status === 409 && err.code === 'ORDER_INVALID_STATE', `duplicate confirm expected ORDER_INVALID_STATE, got ${err.status}/${err.code}`)
  }
  transitioned = await request(`/vendor/orders/${vendor1Order.id}/ship`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendor1Token}` },
    body: JSON.stringify({}),
  })
  assert(transitioned.data.status === 'SHIPPED', 'vendor ship did not move order to SHIPPED')
  record('R1-ORD-04', 'vendor valid confirm/ship transitions pass and duplicate confirm is rejected')

  const completed = await request(`/buyer/orders/${vendor1Order.id}/confirm-receipt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({}),
  })
  assert(completed.data.status === 'COMPLETED', 'buyer receipt did not complete order')
  const completedFund = await prisma.orderFund.findUnique({ where: { orderId: vendor1Order.id } })
  assert(completedFund?.status === 'RELEASABLE', `completed order fund expected RELEASABLE, got ${completedFund?.status}`)
  record('R1-ORD-05', 'buyer receipt completes shipped order and moves funds to RELEASABLE')

  const cancelled = await request(`/vendor/orders/${vendor2Order.id}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendor2Token}` },
    body: JSON.stringify({}),
  })
  assert(cancelled.data.status === 'CANCELLED', 'vendor cancel did not cancel held order')
  const cancelledFund = await prisma.orderFund.findUnique({ where: { orderId: vendor2Order.id } })
  assert(cancelledFund?.status === 'RETURNED_TO_BUYER', `cancelled order fund expected RETURNED_TO_BUYER, got ${cancelledFund?.status}`)
  try {
    await request(`/vendor/orders/${vendor2Order.id}/ship`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${vendor2Token}` },
      body: JSON.stringify({}),
    })
    throw new Error('ship after cancel unexpectedly succeeded')
  } catch (err) {
    assert(err.status === 409 && err.code === 'ORDER_INVALID_STATE', `ship after cancel expected ORDER_INVALID_STATE, got ${err.status}/${err.code}`)
  }
  record('R1-ORD-06', 'vendor cancellation from PAYMENT_HELD returns funds to buyer and blocks later ship')

  const auditCount = await prisma.auditEvent.count({
    where: {
      resourceType: 'order',
      resourceId: { in: [vendor1Order.id, vendor2Order.id] },
      action: { in: ['ORDER_VENDOR_CONFIRMED', 'ORDER_VENDOR_SHIPPED', 'ORDER_BUYER_RECEIPT_CONFIRMED', 'ORDER_VENDOR_CANCELLED'] },
    },
  })
  assert(auditCount >= 4, `expected at least 4 order audit events, got ${auditCount}`)
  record('R1-ORD-07', 'order transition audit events were persisted')

  console.log(JSON.stringify({ ok: true, evidence, orderIds: webhook.data.orderIds }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
