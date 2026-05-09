import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  AuthError,
  buildTokenPayload,
  getSessionView,
  registerUser,
  validateUser,
  verifyUserEmail,
} from './auth.service.js'
import { loginSchema, registerSchema, verifyEmailSchema } from './auth.schema.js'
import { authenticate } from '../../plugins/authenticate.js'
import { enqueueNotification } from '../notifications/notifications.service.js'

interface AuthBody {
  email: string
  password: string
}

interface RegisterBody extends AuthBody {
  accountType: 'BUYER' | 'VENDOR_OWNER'
}

function sendAuthError(reply: FastifyReply, err: unknown, fallback: string) {
  if (err instanceof AuthError) {
    return reply.code(err.statusCode).send({
      error: {
        code: err.code,
        message: err.message,
      },
    })
  }

  const message = err instanceof Error ? err.message : fallback
  return reply.code(400).send({
    error: {
      code: 'AUTH_REQUEST_FAILED',
      message,
    },
  })
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', { schema: registerSchema }, async (request, reply) => {
    const { accountType, email, password } = request.body as RegisterBody

    try {
      const user = await registerUser({ accountType, email, password })
      const verificationToken = app.jwt.sign(
        {
          purpose: 'email_verification',
          sub: user.id,
          email: user.email,
        } as never,
        { expiresIn: '48h' },
      )
      const appBaseUrl = process.env['WEB_APP_URL'] ?? 'http://localhost:3000'
      await enqueueNotification({
        eventType: 'AUTH_EMAIL_VERIFICATION_REQUESTED',
        recipientUserId: user.id,
        recipientEmail: user.email,
        subject: 'Verify your Vendora email',
        templateKey: 'auth.email_verification',
        payload: {
          userId: user.id,
          accountType: user.accountType,
          verificationUrl: `${appBaseUrl}/auth/verify-email?token=${encodeURIComponent(verificationToken)}`,
          expiresInHours: 48,
        },
        referenceType: 'user',
        referenceId: user.id,
      })

      return reply.code(201).send({
        data: {
          userId: user.id,
          email: user.email,
          accountType: user.accountType,
          emailVerificationRequired: true,
          verificationTokenExpiresInHours: 48,
          devVerificationToken: process.env['NODE_ENV'] === 'production' ? undefined : verificationToken,
        },
      })
    } catch (err: unknown) {
      return sendAuthError(reply, err, 'Registration failed')
    }
  })

  app.post('/auth/verify-email', { schema: verifyEmailSchema }, async (request, reply) => {
    const { token } = request.body as { token: string }

    try {
      const decoded = await app.jwt.verify<{
        purpose?: string
        sub?: string
        email?: string
      }>(token)

      if (decoded.purpose !== 'email_verification' || !decoded.sub || !decoded.email) {
        throw new AuthError('VALIDATION_ERROR', 'Verification token is invalid', 400)
      }

      await verifyUserEmail(decoded.sub, decoded.email)
      const payload = await buildTokenPayload(decoded.sub)
      const session = await getSessionView(decoded.sub)
      const sessionToken = app.jwt.sign(payload)
      await enqueueNotification({
        eventType: 'AUTH_EMAIL_VERIFIED',
        recipientUserId: decoded.sub,
        recipientEmail: decoded.email,
        subject: 'Your Vendora email is verified',
        templateKey: 'auth.email_verified',
        payload: {
          userId: decoded.sub,
          accountType: session.user.accountType,
        },
        referenceType: 'user',
        referenceId: decoded.sub,
      })

      return reply.send({
        data: {
          verified: true,
          token: sessionToken,
          session,
        },
      })
    } catch (err: unknown) {
      return sendAuthError(reply, err, 'Email verification failed')
    }
  })

  app.post('/auth/login', { schema: loginSchema }, async (request, reply) => {
    const { email, password } = request.body as AuthBody

    try {
      const user = await validateUser(email, password)
      const payload = await buildTokenPayload(user.id)
      const session = await getSessionView(user.id)
      const token = app.jwt.sign(payload)

      return reply.send({
        data: {
          token,
          session,
        },
      })
    } catch (err: unknown) {
      return sendAuthError(reply, err, 'Login failed')
    }
  })

  app.post('/admin/auth/login', { schema: loginSchema }, async (request, reply) => {
    const { email, password } = request.body as AuthBody

    try {
      const user = await validateUser(email, password, { adminOnly: true })
      const payload = await buildTokenPayload(user.id)
      const session = await getSessionView(user.id)
      const token = app.jwt.sign(payload)

      return reply.send({
        data: {
          token,
          session,
        },
      })
    } catch (err: unknown) {
      return sendAuthError(reply, err, 'Admin login failed')
    }
  })

  app.get('/auth/session', { preHandler: authenticate }, async (request, reply) => {
    try {
      const session = await getSessionView(request.user.sub)
      return reply.send({ data: session })
    } catch (err: unknown) {
      return sendAuthError(reply, err, 'Failed to load session')
    }
  })
}
