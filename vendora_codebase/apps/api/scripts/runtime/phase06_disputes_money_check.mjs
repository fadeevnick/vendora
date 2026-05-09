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

async function expectHttpError(path, token, expectedStatus, expectedCode, options = {}) {
  try {
    await request(path, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    })
  } catch (err) {
    assert(err.status === expectedStatus, `expected ${expectedStatus}, got ${err.status} for ${path}`)
    if (expectedCode) assert(err.code === expectedCode, `expected ${expectedCode}, got ${err.code}`)
    return
  }
  throw new Error(`expected ${path} to fail`)
}

async function login(email, admin = false) {
  const response = await request(admin ? '/admin/auth/login' : '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'password123' }),
  })
  return response.data.token
}

async function setupFixtures() {
  const hash = await bcrypt.hash('password123', 10)
  const verifiedNow = new Date()

  const buyer = await prisma.user.upsert({
    where: { email: 'phase06-buyer@vendora.local' },
    update: {
      password: hash,
      accountType: 'BUYER',
      emailVerifiedAt: verifiedNow,
      isPlatformAdmin: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    create: {
      email: 'phase06-buyer@vendora.local',
      password: hash,
      accountType: 'BUYER',
      emailVerifiedAt: verifiedNow,
    },
  })

  await prisma.user.upsert({
    where: { email: 'phase06-other-buyer@vendora.local' },
    update: {
      password: hash,
      accountType: 'BUYER',
      emailVerifiedAt: verifiedNow,
      isPlatformAdmin: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    create: {
      email: 'phase06-other-buyer@vendora.local',
      password: hash,
      accountType: 'BUYER',
      emailVerifiedAt: verifiedNow,
    },
  })

  const vendorUser = await prisma.user.upsert({
    where: { email: 'phase06-vendor2@vendora.local' },
    update: {
      password: hash,
      accountType: 'VENDOR_OWNER',
      emailVerifiedAt: verifiedNow,
      isPlatformAdmin: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    create: {
      email: 'phase06-vendor2@vendora.local',
      password: hash,
      accountType: 'VENDOR_OWNER',
      emailVerifiedAt: verifiedNow,
    },
  })

  const vendor = await prisma.vendor.upsert({
    where: { inn: 'PHASE06VENDOR2' },
    update: {
      name: 'Phase 06 Vendor Two',
      status: 'APPROVED',
      legalEntityName: 'Phase 06 Vendor Two LLC',
      country: 'RU',
      addressJson: { line1: '6 Runtime Street', city: 'Moscow', postalCode: '101006' },
      salesCategory: 'electronics',
      approvedAt: verifiedNow,
      reviewedAt: verifiedNow,
    },
    create: {
      name: 'Phase 06 Vendor Two',
      inn: 'PHASE06VENDOR2',
      status: 'APPROVED',
      legalEntityName: 'Phase 06 Vendor Two LLC',
      country: 'RU',
      addressJson: { line1: '6 Runtime Street', city: 'Moscow', postalCode: '101006' },
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
      legalEntityName: 'Phase 06 Vendor Two LLC',
      taxId: vendor.inn,
      country: 'RU',
      addressJson: { line1: '6 Runtime Street', city: 'Moscow', postalCode: '101006' },
      salesCategory: 'electronics',
      submittedByUserId: vendorUser.id,
      submittedAt: verifiedNow,
      reviewedAt: verifiedNow,
    },
    create: {
      vendorId: vendor.id,
      status: 'APPROVED',
      businessName: vendor.name,
      legalEntityName: 'Phase 06 Vendor Two LLC',
      taxId: vendor.inn,
      country: 'RU',
      addressJson: { line1: '6 Runtime Street', city: 'Moscow', postalCode: '101006' },
      salesCategory: 'electronics',
      submittedByUserId: vendorUser.id,
      submittedAt: verifiedNow,
      reviewedAt: verifiedNow,
    },
  })

  const vendor2Product = await prisma.product.upsert({
    where: { id: 'phase06-vendor2-product' },
    update: {
      vendorId: vendor.id,
      name: 'Phase 06 Runtime Dock',
      description: 'Runtime dispute fixture',
      category: 'electronics',
      price: 3600,
      currency: 'RUB',
      stock: 50,
      published: true,
      publishedAt: verifiedNow,
    },
    create: {
      id: 'phase06-vendor2-product',
      vendorId: vendor.id,
      name: 'Phase 06 Runtime Dock',
      description: 'Runtime dispute fixture',
      category: 'electronics',
      price: 3600,
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

  return { vendor1Product, vendor2Product }
}

async function createShippedOrder({ buyerToken, vendorToken, productId }) {
  let cart = await request('/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ listingId: productId, quantity: 1 }),
  })

  const checkout = await request('/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${buyerToken}`,
      'Idempotency-Key': `phase06-${Date.now()}-${productId}`,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: {
        fullName: 'Phase 06 Buyer',
        line1: '6 Runtime Ave',
        city: 'Moscow',
        postalCode: '101006',
        country: 'RU',
      },
    }),
  })

  const webhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `phase06-${checkout.data.checkoutSessionId}`,
      checkoutSessionId: checkout.data.checkoutSessionId,
      eventType: 'PAYMENT_SUCCEEDED',
    }),
  })
  assert(webhook.data.orderIds.length === 1, 'single-vendor checkout should create one order')
  const orderId = webhook.data.orderIds[0]

  await request(`/vendor/orders/${orderId}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({}),
  })
  await request(`/vendor/orders/${orderId}/ship`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({}),
  })

  return orderId
}

async function main() {
  const { vendor1Product, vendor2Product } = await setupFixtures()
  const buyerToken = await login('phase06-buyer@vendora.local')
  const otherBuyerToken = await login('phase06-other-buyer@vendora.local')
  const vendor1Token = await login('vendor@vendora.com')
  const vendor2Token = await login('phase06-vendor2@vendora.local')
  const adminToken = await login('admin@vendora.com', true)

  const vendorFavorOrderId = await createShippedOrder({ buyerToken, vendorToken: vendor1Token, productId: vendor1Product.id })
  const buyerFavorOrderId = await createShippedOrder({ buyerToken, vendorToken: vendor2Token, productId: vendor2Product.id })

  await expectHttpError(`/buyer/orders/${vendorFavorOrderId}/disputes`, otherBuyerToken, 404, 'RESOURCE_NOT_FOUND', {
    method: 'POST',
    body: JSON.stringify({ reason: 'Other buyer cannot dispute this order' }),
  })

  const vendorFavorDispute = await request(`/buyer/orders/${vendorFavorOrderId}/disputes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({
      reason: 'Runtime dispute for vendor release path',
      evidence: [{
        fileName: 'buyer-runtime-photo.png',
        contentType: 'image/png',
        sizeBytes: Buffer.byteLength('buyer-runtime-evidence'),
        contentBase64: Buffer.from('buyer-runtime-evidence').toString('base64'),
        description: 'Buyer runtime evidence metadata',
      }],
    }),
  })
  const frozenFund = await prisma.orderFund.findUnique({ where: { orderId: vendorFavorOrderId } })
  const frozenLedger = await prisma.vendorBalanceLedger.findFirst({
    where: { referenceId: vendorFavorDispute.data.id, entryType: 'FROZEN' },
  })
  assert(frozenFund?.status === 'FROZEN_DISPUTE', `expected frozen fund, got ${frozenFund?.status}`)
  assert(frozenLedger, 'expected FROZEN ledger entry')
  record('R1-DISP-01', 'buyer opens dispute from shipped order and funds freeze immediately')

  await expectHttpError(`/vendor/disputes/${vendorFavorDispute.data.id}/respond`, vendor2Token, 404, 'RESOURCE_NOT_FOUND', {
    method: 'POST',
    body: JSON.stringify({ message: 'Wrong tenant response attempt' }),
  })
  const vendorResponse = await request(`/vendor/disputes/${vendorFavorDispute.data.id}/respond`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendor1Token}` },
    body: JSON.stringify({
      message: 'Vendor response for platform review',
      evidence: [{
        fileName: 'vendor-runtime-proof.pdf',
        contentType: 'application/pdf',
        sizeBytes: Buffer.byteLength('vendor-runtime-evidence'),
        contentBase64: Buffer.from('vendor-runtime-evidence').toString('base64'),
        description: 'Vendor runtime evidence metadata',
      }],
    }),
  })
  assert(vendorResponse.data.status === 'PLATFORM_REVIEW', 'vendor response should move dispute to platform review')
  record('R1-DISP-02', 'vendor response is tenant-scoped and moves dispute to PLATFORM_REVIEW')

  await expectHttpError('/admin/disputes', buyerToken, 403, 'FORBIDDEN')
  const adminQueue = await request('/admin/disputes', { headers: { Authorization: `Bearer ${adminToken}` } })
  assert(adminQueue.data.some((dispute) => dispute.id === vendorFavorDispute.data.id), 'admin queue did not include dispute')
  const adminDetail = await request(`/admin/disputes/${vendorFavorDispute.data.id}`, { headers: { Authorization: `Bearer ${adminToken}` } })
  assert(adminDetail.data.order.id === vendorFavorOrderId, 'admin detail returned wrong order')
  assert(adminDetail.data.messages.length === 2, `expected 2 dispute messages, got ${adminDetail.data.messages.length}`)
  assert(adminDetail.data.evidence.length === 2, `expected 2 dispute evidence items, got ${adminDetail.data.evidence.length}`)
  assert(adminDetail.data.evidence.some((item) => item.fileName === 'buyer-runtime-photo.png' && item.submittedByActorType === 'BUYER'), 'buyer evidence metadata missing')
  assert(adminDetail.data.evidence.some((item) => item.fileName === 'vendor-runtime-proof.pdf' && item.submittedByActorType === 'VENDOR'), 'vendor evidence metadata missing')
  const buyerEvidence = adminDetail.data.evidence.find((item) => item.fileName === 'buyer-runtime-photo.png')
  assert(buyerEvidence?.contentSha256 && buyerEvidence.storageConfirmedAt, 'buyer evidence storage metadata missing')
  const evidenceContent = await request(`/admin/disputes/evidence/${buyerEvidence.id}/content`, { headers: { Authorization: `Bearer ${adminToken}` } })
  assert(evidenceContent.data.contentBase64 === Buffer.from('buyer-runtime-evidence').toString('base64'), 'stored buyer evidence content mismatch')
  record('R1-DISP-03', 'admin-only dispute queue/detail boundary is verified')
  record('R1-DISP-04', 'dispute messages and evidence metadata are persisted and visible to admin')
  record('R1-DISP-05', 'dispute raw evidence content is stored privately and readable by admin with integrity metadata')

  await expectHttpError(`/admin/disputes/${vendorFavorDispute.data.id}/resolve`, buyerToken, 403, 'FORBIDDEN', {
    method: 'POST',
    body: JSON.stringify({ resolutionType: 'VENDOR_FAVOR_RELEASE' }),
  })
  const vendorResolved = await request(`/admin/disputes/${vendorFavorDispute.data.id}/resolve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ resolutionType: 'VENDOR_FAVOR_RELEASE' }),
  })
  assert(vendorResolved.data.status === 'RESOLVED', 'vendor-favor dispute should resolve')
  const vendorFavorOrder = await prisma.order.findUnique({ where: { id: vendorFavorOrderId }, include: { funds: true } })
  const releasedLedger = await prisma.vendorBalanceLedger.findFirst({
    where: { referenceId: vendorFavorDispute.data.id, entryType: 'RELEASED' },
  })
  assert(vendorFavorOrder?.status === 'COMPLETED', `vendor-favor order expected COMPLETED, got ${vendorFavorOrder?.status}`)
  assert(vendorFavorOrder?.funds?.status === 'RELEASABLE', `vendor-favor fund expected RELEASABLE, got ${vendorFavorOrder?.funds?.status}`)
  assert(releasedLedger, 'expected RELEASED ledger entry')
  record('R1-MONEY-01', 'admin vendor-favor resolution releases frozen funds to RELEASABLE')

  const buyerFavorDispute = await request(`/buyer/orders/${buyerFavorOrderId}/disputes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ reason: 'Runtime dispute for buyer refund path' }),
  })
  await request(`/vendor/disputes/${buyerFavorDispute.data.id}/respond`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendor2Token}` },
    body: JSON.stringify({ message: 'Vendor response before buyer-favor decision' }),
  })
  const buyerResolved = await request(`/admin/disputes/${buyerFavorDispute.data.id}/resolve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ resolutionType: 'BUYER_FAVOR_FULL_REFUND' }),
  })
  assert(buyerResolved.data.status === 'RESOLVED', 'buyer-favor dispute should resolve')
  const buyerFavorOrder = await prisma.order.findUnique({ where: { id: buyerFavorOrderId }, include: { funds: true } })
  const refundedLedger = await prisma.vendorBalanceLedger.findFirst({
    where: { referenceId: buyerFavorDispute.data.id, entryType: 'REFUNDED' },
  })
  assert(buyerFavorOrder?.status === 'CANCELLED', `buyer-favor order expected CANCELLED, got ${buyerFavorOrder?.status}`)
  assert(buyerFavorOrder?.funds?.status === 'RETURNED_TO_BUYER', `buyer-favor fund expected RETURNED_TO_BUYER, got ${buyerFavorOrder?.funds?.status}`)
  assert(refundedLedger, 'expected REFUNDED ledger entry')
  record('R1-MONEY-02', 'admin buyer-favor resolution returns frozen funds to buyer')

  const vendor1Balance = await request('/vendor/balance', { headers: { Authorization: `Bearer ${vendor1Token}` } })
  const vendor2Balance = await request('/vendor/balance', { headers: { Authorization: `Bearer ${vendor2Token}` } })
  assert(vendor1Balance.data.ledger.some((entry) => entry.entryType === 'RELEASED' && entry.referenceId === vendorFavorDispute.data.id), 'vendor1 balance missing released ledger evidence')
  assert(vendor2Balance.data.ledger.some((entry) => entry.entryType === 'REFUNDED' && entry.referenceId === buyerFavorDispute.data.id), 'vendor2 balance missing refunded ledger evidence')
  record('R1-MONEY-03', 'vendor balance endpoint reflects release/refund ledger evidence')

  try {
    await request(`/admin/disputes/${buyerFavorDispute.data.id}/resolve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ resolutionType: 'BUYER_FAVOR_FULL_REFUND' }),
    })
    throw new Error('duplicate dispute resolution unexpectedly succeeded')
  } catch (err) {
    assert(err.status === 409 && err.code === 'DISPUTE_INVALID_STATE', `expected duplicate resolution DISPUTE_INVALID_STATE, got ${err.status}/${err.code}`)
  }
  const auditCount = await prisma.auditEvent.count({
    where: {
      resourceType: 'dispute',
      resourceId: { in: [vendorFavorDispute.data.id, buyerFavorDispute.data.id] },
      action: { in: ['DISPUTE_OPENED', 'DISPUTE_VENDOR_RESPONDED', 'DISPUTE_RESOLVED'] },
    },
  })
  assert(auditCount >= 6, `expected at least 6 dispute audit events, got ${auditCount}`)
  record('R1-AUDIT-01', 'dispute open/respond/resolve audit events are persisted and duplicate resolution is blocked')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    disputes: [vendorFavorDispute.data.id, buyerFavorDispute.data.id],
    orders: [vendorFavorOrderId, buyerFavorOrderId],
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
