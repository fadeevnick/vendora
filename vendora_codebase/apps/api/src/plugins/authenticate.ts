import type { FastifyRequest, FastifyReply } from 'fastify'

export type SessionActorType = 'BUYER' | 'VENDOR_OWNER' | 'PLATFORM_ADMIN'

export interface JwtPayload {
  sub: string
  email: string
  accountType: 'BUYER' | 'VENDOR_OWNER'
  actorType: SessionActorType
  emailVerified: boolean
  isPlatformAdmin: boolean
  vendorId: string | null
  vendorRole: string | null
  vendorStatus: string | null
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Unauthorized',
      },
    })
  }
}

export async function requireVerifiedEmail(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.emailVerified) {
    return
  }

  return reply.code(403).send({
    error: {
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Email verification is required',
    },
  })
}

export async function requireVendorContext(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.vendorId) {
    return
  }

  return reply.code(403).send({
    error: {
      code: 'TENANT_SCOPE_REQUIRED',
      message: 'Vendor workspace access is required',
    },
  })
}

export function requireVendorRole(roles: string[]) {
  return async function vendorRoleGuard(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user.vendorId || !request.user.vendorRole || !roles.includes(request.user.vendorRole)) {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Vendor role is not allowed to perform this action',
        },
      })
    }
  }
}

export function requireVendorReadRole(roles: string[]) {
  return requireVendorRole(roles)
}

export async function requireVendorOwner(request: FastifyRequest, reply: FastifyReply) {
  return requireVendorRole(['OWNER'])(request, reply)
}

export async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.isPlatformAdmin) {
    return
  }

  return reply.code(403).send({
    error: {
      code: 'FORBIDDEN',
      message: 'Platform admin access is required',
    },
  })
}
