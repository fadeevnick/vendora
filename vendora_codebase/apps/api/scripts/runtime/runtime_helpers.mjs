import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

export const API = process.env.RUNTIME_API_URL ?? 'http://127.0.0.1:3001'
export const PASSWORD = 'password123'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
export const prisma = new PrismaClient({ adapter })

export const evidence = []

export function runtimeSuffix() {
  return `${Date.now()}-${randomUUID().slice(0, 8)}`
}

export function routeInn(prefix, suffix) {
  const cleanPrefix = String(prefix).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4).padEnd(4, '0')
  const cleanSuffix = String(suffix).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8).padEnd(8, '0')
  return `${cleanPrefix}${cleanSuffix}`
}

export function record(id, detail) {
  evidence.push({ id, detail })
  console.log(`${id}: ${detail}`)
}

export function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export async function request(path, options = {}) {
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

export async function expectHttpError(path, token, expectedStatus, expectedCode, options = {}) {
  try {
    await request(path, {
      ...options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    })
  } catch (err) {
    assert(err.status === expectedStatus, `expected ${expectedStatus}, got ${err.status} for ${path}`)
    if (expectedCode) assert(err.code === expectedCode, `expected ${expectedCode}, got ${err.code}`)
    return err
  }
  throw new Error(`expected ${path} to fail`)
}

export async function login(email, admin = false) {
  const response = await request(admin ? '/admin/auth/login' : '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  return response.data.token
}

export async function upsertVerifiedUser(email, accountType = 'BUYER', extra = {}) {
  const hash = await bcrypt.hash(PASSWORD, 10)
  const verifiedNow = new Date()
  return prisma.user.upsert({
    where: { email },
    update: {
      password: hash,
      accountType,
      emailVerifiedAt: verifiedNow,
      failedLoginAttempts: 0,
      lockedUntil: null,
      isPlatformAdmin: extra.isPlatformAdmin ?? false,
    },
    create: {
      email,
      password: hash,
      accountType,
      emailVerifiedAt: verifiedNow,
      isPlatformAdmin: extra.isPlatformAdmin ?? false,
    },
  })
}

export async function ensureVendorFixture({ user, inn, name, status = 'APPROVED', category = 'runtime' }) {
  const now = new Date()
  const vendor = await prisma.vendor.upsert({
    where: { inn },
    update: {
      name,
      status,
      legalEntityName: `${name} LLC`,
      country: 'RU',
      addressJson: { line1: 'Runtime Street 1', city: 'Moscow', postalCode: '101000' },
      salesCategory: category,
      approvedAt: status === 'APPROVED' ? now : null,
      reviewedAt: ['APPROVED', 'REJECTED'].includes(status) ? now : null,
    },
    create: {
      name,
      inn,
      status,
      legalEntityName: `${name} LLC`,
      country: 'RU',
      addressJson: { line1: 'Runtime Street 1', city: 'Moscow', postalCode: '101000' },
      salesCategory: category,
      approvedAt: status === 'APPROVED' ? now : null,
      reviewedAt: ['APPROVED', 'REJECTED'].includes(status) ? now : null,
    },
  })

  await prisma.vendorMember.upsert({
    where: { userId_vendorId: { userId: user.id, vendorId: vendor.id } },
    update: { role: 'OWNER' },
    create: { userId: user.id, vendorId: vendor.id, role: 'OWNER' },
  })

  await prisma.vendorApplication.upsert({
    where: { vendorId: vendor.id },
    update: {
      status: status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : 'DRAFT',
      businessName: name,
      legalEntityName: `${name} LLC`,
      taxId: inn,
      country: 'RU',
      addressJson: { line1: 'Runtime Street 1', city: 'Moscow', postalCode: '101000' },
      salesCategory: category,
      submittedByUserId: user.id,
      submittedAt: now,
      reviewedAt: ['APPROVED', 'REJECTED'].includes(status) ? now : null,
    },
    create: {
      vendorId: vendor.id,
      status: status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : 'DRAFT',
      businessName: name,
      legalEntityName: `${name} LLC`,
      taxId: inn,
      country: 'RU',
      addressJson: { line1: 'Runtime Street 1', city: 'Moscow', postalCode: '101000' },
      salesCategory: category,
      submittedByUserId: user.id,
      submittedAt: now,
      reviewedAt: ['APPROVED', 'REJECTED'].includes(status) ? now : null,
    },
  })

  return vendor
}

export async function ensureProductFixture({ id, vendorId, name, category = 'runtime', price = 1000, stock = 20, published = true }) {
  const now = new Date()
  return prisma.product.upsert({
    where: { id },
    update: {
      vendorId,
      name,
      description: `${name} runtime fixture`,
      category,
      price,
      currency: 'RUB',
      stock,
      published,
      publishedAt: published ? now : null,
      unpublishedReason: published ? null : 'runtime_fixture',
    },
    create: {
      id,
      vendorId,
      name,
      description: `${name} runtime fixture`,
      category,
      price,
      currency: 'RUB',
      stock,
      published,
      publishedAt: published ? now : null,
      unpublishedReason: published ? null : 'runtime_fixture',
    },
  })
}

export async function clearBuyerCart(buyerId) {
  const cart = await prisma.cart.findUnique({ where: { buyerUserId: buyerId } })
  if (!cart) return
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })
  await prisma.cart.update({ where: { id: cart.id }, data: { version: { increment: 1 } } })
}

export function shippingAddress(label = 'Runtime Buyer') {
  return {
    fullName: label,
    line1: '1 Runtime Ave',
    city: 'Moscow',
    postalCode: '101001',
    country: 'RU',
  }
}

export async function disconnect() {
  await prisma.$disconnect()
}
