import bcrypt from 'bcryptjs'
import type { AccountType } from '@prisma/client'
import { prisma } from '../../shared/db.js'
import type { JwtPayload, SessionActorType } from '../../plugins/authenticate.js'

const FAILED_LOGIN_LIMIT = 5
const LOGIN_LOCK_MINUTES = 15

interface RegisterUserInput {
  accountType: AccountType
  email: string
  password: string
}

interface ValidateUserOptions {
  adminOnly?: boolean
}

interface SessionView {
  user: {
    id: string
    email: string
    actorType: SessionActorType
    accountType: AccountType
    emailVerified: boolean
    isPlatformAdmin: boolean
  }
  vendorMembership: {
    vendorId: string
    vendorName: string
    vendorStatus: string
    role: string
  } | null
  capabilities: {
    buyer: boolean
    vendorWorkspace: boolean
    platformAdmin: boolean
    publishListings: boolean
  }
}

export class AuthError extends Error {
  code: string
  statusCode: number

  constructor(code: string, message: string, statusCode: number) {
    super(message)
    this.name = 'AuthError'
    this.code = code
    this.statusCode = statusCode
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function isStrongPassword(password: string) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)
}

function deriveActorType(accountType: AccountType, isPlatformAdmin: boolean, vendorRole: string | null): SessionActorType {
  if (isPlatformAdmin) {
    return 'PLATFORM_ADMIN'
  }

  if (accountType === 'VENDOR_OWNER' || vendorRole === 'OWNER') {
    return 'VENDOR_OWNER'
  }

  return 'BUYER'
}

export async function registerUser(input: RegisterUserInput) {
  const email = normalizeEmail(input.email)
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw new AuthError('VALIDATION_ERROR', 'Email already in use', 409)
  }

  if (!isStrongPassword(input.password)) {
    throw new AuthError('VALIDATION_ERROR', 'Password must contain at least 8 characters, one letter and one digit', 400)
  }

  const hashed = await bcrypt.hash(input.password, 10)
  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      accountType: input.accountType,
    },
  })

  return {
    id: user.id,
    email: user.email,
    accountType: user.accountType,
  }
}

export async function validateUser(emailInput: string, password: string, options: ValidateUserOptions = {}) {
  const email = normalizeEmail(emailInput)
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.password) {
    throw new AuthError('INVALID_CREDENTIALS', 'Invalid credentials', 401)
  }

  const now = new Date()
  if (user.lockedUntil && user.lockedUntil > now) {
    throw new AuthError('AUTH_LOCKED', 'Too many failed login attempts. Try again in 15 minutes.', 423)
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    const nextFailedAttempts = user.failedLoginAttempts + 1
    const shouldLock = nextFailedAttempts >= FAILED_LOGIN_LIMIT

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: shouldLock ? 0 : nextFailedAttempts,
        lockedUntil: shouldLock ? new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60 * 1000) : null,
      },
    })

    if (shouldLock) {
      throw new AuthError('AUTH_LOCKED', 'Too many failed login attempts. Try again in 15 minutes.', 423)
    }

    throw new AuthError('INVALID_CREDENTIALS', 'Invalid credentials', 401)
  }

  if (options.adminOnly && !user.isPlatformAdmin) {
    throw new AuthError('INVALID_CREDENTIALS', 'Invalid credentials', 401)
  }

  if (!user.emailVerifiedAt) {
    throw new AuthError('EMAIL_NOT_VERIFIED', 'Email verification is required before login', 403)
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  })

  return {
    id: user.id,
    email: user.email,
    accountType: user.accountType,
    emailVerifiedAt: user.emailVerifiedAt,
    isPlatformAdmin: user.isPlatformAdmin,
  }
}

export async function verifyUserEmail(userId: string, emailInput: string) {
  const email = normalizeEmail(emailInput)
  const user = await prisma.user.findUnique({ where: { id: userId } })

  if (!user || user.email !== email) {
    throw new AuthError('RESOURCE_NOT_FOUND', 'Verification token is invalid', 404)
  }

  if (!user.emailVerifiedAt) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifiedAt: new Date(),
      },
    })
  }

  return {
    id: user.id,
    email: user.email,
  }
}

export async function buildTokenPayload(userId: string): Promise<JwtPayload> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    throw new AuthError('RESOURCE_NOT_FOUND', 'User not found', 404)
  }

  const member = await prisma.vendorMember.findFirst({
    where: { userId },
    include: { vendor: true },
  })

  return {
    sub: userId,
    email: user.email,
    accountType: user.accountType,
    actorType: deriveActorType(user.accountType, user.isPlatformAdmin, member?.role ?? null),
    emailVerified: Boolean(user.emailVerifiedAt),
    isPlatformAdmin: user.isPlatformAdmin,
    vendorId: member?.vendor.id ?? null,
    vendorRole: member?.role ?? null,
    vendorStatus: member?.vendor.status ?? null,
  }
}

export async function getSessionView(userId: string): Promise<SessionView> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    throw new AuthError('RESOURCE_NOT_FOUND', 'User not found', 404)
  }

  const member = await prisma.vendorMember.findFirst({
    where: { userId },
    include: { vendor: true },
  })

  const actorType = deriveActorType(user.accountType, user.isPlatformAdmin, member?.role ?? null)

  return {
    user: {
      id: user.id,
      email: user.email,
      actorType,
      accountType: user.accountType,
      emailVerified: Boolean(user.emailVerifiedAt),
      isPlatformAdmin: user.isPlatformAdmin,
    },
    vendorMembership: member
      ? {
          vendorId: member.vendorId,
          vendorName: member.vendor.name,
          vendorStatus: member.vendor.status,
          role: member.role,
        }
      : null,
    capabilities: {
      buyer: !user.isPlatformAdmin,
      vendorWorkspace: Boolean(member),
      platformAdmin: user.isPlatformAdmin,
      publishListings: member?.role === 'OWNER' && member.vendor.status === 'APPROVED',
    },
  }
}
