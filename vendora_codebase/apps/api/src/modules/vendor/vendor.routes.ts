import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  authenticate,
  requirePlatformAdmin,
  requireVendorContext,
  requireVendorOwner,
  requireVerifiedEmail,
} from '../../plugins/authenticate.js'
import {
  approveKycApplication,
  completeKycDocument,
  createVendor,
  getKycApplicationForAdmin,
  readKycDocumentContentForAdmin,
  getVendorApplication,
  getVendorById,
  listKycApplications,
  presignKycDocument,
  rejectKycApplication,
  submitVendorApplication,
  updateVendorApplication,
  uploadKycDocumentContent,
} from './vendor.service.js'
import { buildTokenPayload } from '../auth/auth.service.js'
import {
  createVendorSchema,
  presignKycDocumentSchema,
  reviewKycApplicationSchema,
  updateVendorApplicationSchema,
  uploadKycDocumentContentSchema,
} from './vendor.schema.js'

function sendVendorError(reply: FastifyReply, err: unknown, fallback: string) {
  const rawMessage = err instanceof Error ? err.message : fallback
  const [maybeCode, ...messageParts] = rawMessage.split(': ')
  const code = maybeCode.includes('_') ? maybeCode : 'VENDOR_REQUEST_FAILED'
  const message = maybeCode.includes('_') ? messageParts.join(': ') || rawMessage : rawMessage
  const statusCode = code === 'RESOURCE_NOT_FOUND' || message.includes('not found') ? 404 : code === 'VALIDATION_ERROR' || code === 'KYC_INVALID_STATE' ? 400 : 400

  return reply.code(statusCode).send({
    error: {
      code,
      message,
    },
  })
}

export async function vendorRoutes(app: FastifyInstance) {
  app.post('/vendors', { preHandler: [authenticate, requireVerifiedEmail], schema: createVendorSchema }, async (request, reply) => {
    const { name, inn } = request.body as { name: string; inn: string }
    const { sub: userId, accountType, isPlatformAdmin } = request.user

    if (isPlatformAdmin || accountType !== 'VENDOR_OWNER') {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Vendor owner access is required',
        },
      })
    }

    try {
      const vendor = await createVendor({ name, inn, userId })
      // Перевыпускаем токен с vendor-контекстом
      const payload = await buildTokenPayload(userId)
      const token = app.jwt.sign(payload)
      return reply.code(201).send({ vendor, token })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create vendor'
      return reply.code(400).send({ error: message })
    }
  })

  app.get('/vendors/me', { preHandler: [authenticate, requireVerifiedEmail, requireVendorContext] }, async (request, reply) => {
    const { vendorId } = request.user
    if (!vendorId) return reply.code(403).send({ error: 'Vendor workspace access is required' })
    const vendor = await getVendorById(vendorId)
    if (!vendor) return reply.code(404).send({ error: 'Vendor not found' })
    return vendor
  })

  app.get('/vendor/application', { preHandler: [authenticate, requireVerifiedEmail, requireVendorOwner] }, async (request, reply) => {
    const { vendorId } = request.user
    if (!vendorId) return reply.code(403).send({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Vendor workspace access is required' } })

    try {
      const application = await getVendorApplication(vendorId)
      return reply.send({ data: application })
    } catch (err: unknown) {
      return sendVendorError(reply, err, 'Failed to load vendor application')
    }
  })

  app.put(
    '/vendor/application',
    { preHandler: [authenticate, requireVerifiedEmail, requireVendorOwner], schema: updateVendorApplicationSchema },
    async (request, reply) => {
      const { vendorId, sub: userId } = request.user
      if (!vendorId) return reply.code(403).send({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Vendor workspace access is required' } })

      try {
        const application = await updateVendorApplication({
          ...(request.body as {
            businessName: string
            legalEntityName: string
            taxId: string
            country: string
            address: { line1: string; city: string; postalCode: string }
            salesCategory: string
          }),
          vendorId,
          userId,
        })
        return reply.send({ data: application })
      } catch (err: unknown) {
        return sendVendorError(reply, err, 'Failed to update vendor application')
      }
    },
  )

  app.post(
    '/vendor/application/documents/presign',
    { preHandler: [authenticate, requireVerifiedEmail, requireVendorOwner], schema: presignKycDocumentSchema },
    async (request, reply) => {
      const { vendorId, sub: userId } = request.user
      if (!vendorId) return reply.code(403).send({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Vendor workspace access is required' } })

      try {
        const documentSlot = await presignKycDocument({
          ...(request.body as {
            documentType: string
            fileName: string
            contentType: string
            sizeBytes: number
          }),
          vendorId,
          userId,
        })
        return reply.code(201).send({ data: documentSlot })
      } catch (err: unknown) {
        return sendVendorError(reply, err, 'Failed to create KYC document slot')
      }
    },
  )

  app.post(
    '/vendor/application/documents/:documentId/upload',
    { preHandler: [authenticate, requireVerifiedEmail, requireVendorOwner], schema: uploadKycDocumentContentSchema },
    async (request, reply) => {
      const { vendorId, sub: userId } = request.user
      const { documentId } = request.params as { documentId: string }
      const { contentBase64 } = request.body as { contentBase64: string }
      if (!vendorId) return reply.code(403).send({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Vendor workspace access is required' } })

      try {
        const document = await uploadKycDocumentContent({ vendorId, userId, documentId, contentBase64 })
        return reply.send({ data: document })
      } catch (err: unknown) {
        return sendVendorError(reply, err, 'Failed to upload KYC document content')
      }
    },
  )

  app.post(
    '/vendor/application/documents/:documentId/complete',
    { preHandler: [authenticate, requireVerifiedEmail, requireVendorOwner] },
    async (request, reply) => {
      const { vendorId, sub: userId } = request.user
      const { documentId } = request.params as { documentId: string }
      if (!vendorId) return reply.code(403).send({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Vendor workspace access is required' } })

      try {
        const document = await completeKycDocument(vendorId, userId, documentId)
        return reply.send({ data: document })
      } catch (err: unknown) {
        return sendVendorError(reply, err, 'Failed to complete KYC document')
      }
    },
  )

  app.post('/vendor/application/submit', { preHandler: [authenticate, requireVerifiedEmail, requireVendorOwner] }, async (request, reply) => {
    const { vendorId, sub: userId } = request.user
    if (!vendorId) return reply.code(403).send({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Vendor workspace access is required' } })

    try {
      const application = await submitVendorApplication(vendorId, userId)
      return reply.send({ data: application })
    } catch (err: unknown) {
      return sendVendorError(reply, err, 'Failed to submit vendor application')
    }
  })

  app.get('/admin/kyc/applications', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (request, reply) => {
    try {
      const applications = await listKycApplications(request.user.sub)
      return reply.send({ data: applications })
    } catch (err: unknown) {
      return sendVendorError(reply, err, 'Failed to load KYC applications')
    }
  })

  app.get('/admin/kyc/applications/:applicationId', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (request, reply) => {
    const { applicationId } = request.params as { applicationId: string }

    try {
      const application = await getKycApplicationForAdmin(applicationId, request.user.sub)
      return reply.send({ data: application })
    } catch (err: unknown) {
      return sendVendorError(reply, err, 'Failed to load KYC application')
    }
  })

  app.get('/admin/kyc/documents/:documentId/content', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (request, reply) => {
    const { documentId } = request.params as { documentId: string }

    try {
      const document = await readKycDocumentContentForAdmin(documentId, request.user.sub)
      return reply.send({ data: document })
    } catch (err: unknown) {
      return sendVendorError(reply, err, 'Failed to read KYC document content')
    }
  })

  app.post(
    '/admin/kyc/applications/:applicationId/approve',
    { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin], schema: reviewKycApplicationSchema },
    async (request, reply) => {
      const { applicationId } = request.params as { applicationId: string }
      const { note } = request.body as { note?: string }

      try {
        const application = await approveKycApplication(applicationId, request.user.sub, note)
        return reply.send({ data: application })
      } catch (err: unknown) {
        return sendVendorError(reply, err, 'Failed to approve KYC application')
      }
    },
  )

  app.post(
    '/admin/kyc/applications/:applicationId/reject',
    { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin], schema: reviewKycApplicationSchema },
    async (request, reply) => {
      const { applicationId } = request.params as { applicationId: string }
      const { note, reasonCode } = request.body as { note?: string; reasonCode?: string }

      try {
        const application = await rejectKycApplication(applicationId, request.user.sub, note, reasonCode)
        return reply.send({ data: application })
      } catch (err: unknown) {
        return sendVendorError(reply, err, 'Failed to reject KYC application')
      }
    },
  )
}
