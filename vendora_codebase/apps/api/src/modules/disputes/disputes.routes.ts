import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  authenticate,
  requirePlatformAdmin,
  requireVendorContext,
  requireVendorReadRole,
  requireVendorRole,
  requireVerifiedEmail,
} from '../../plugins/authenticate.js'
import {
  createDispute,
  type DisputeEvidenceInput,
  getAdminDispute,
  getDisputeByOrder,
  getVendorBalance,
  listProviderFailures,
  listAdminDisputes,
  markPayoutFailureReviewed,
  markRefundFailureReviewed,
  readDisputeEvidenceContentForAdmin,
  resolveDispute,
  resolveDisputeById,
  retryPayoutFailure,
  retryRefundFailure,
  respondToDispute,
} from './disputes.service.js'
import {
  createDisputeSchema,
  providerFailureReviewSchema,
  resolveDisputeSchema,
  vendorDisputeResponseSchema,
} from './disputes.schema.js'

function sendDisputeError(reply: FastifyReply, err: unknown, fallback: string) {
  const rawMessage = err instanceof Error ? err.message : fallback
  const [maybeCode, ...messageParts] = rawMessage.split(': ')
  const knownCodes = new Set(['FORBIDDEN', 'RESOURCE_NOT_FOUND', 'VALIDATION_ERROR', 'DISPUTE_INVALID_STATE', 'ORDER_INVALID_STATE', 'REFUND_PROVIDER_FAILED'])
  const code = knownCodes.has(maybeCode) || maybeCode.includes('_') ? maybeCode : 'DISPUTE_REQUEST_FAILED'
  const message = code === maybeCode ? messageParts.join(': ') || rawMessage : rawMessage
  const statusCode = code === 'RESOURCE_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : code === 'REFUND_PROVIDER_FAILED' ? 502 : code.includes('INVALID_STATE') ? 409 : 400

  return reply.code(statusCode).send({
    error: {
      code,
      message,
    },
  })
}

export async function disputeRoutes(app: FastifyInstance) {
  app.post('/buyer/orders/:orderId/disputes', { preHandler: [authenticate, requireVerifiedEmail], schema: createDisputeSchema }, async (request, reply) => {
    if (request.user.isPlatformAdmin || request.user.accountType !== 'BUYER') {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Buyer access is required' } })
    }

    const { orderId } = request.params as { orderId: string }
    const { reason, evidence } = request.body as { reason: string; evidence?: DisputeEvidenceInput[] }

    try {
      const dispute = await createDispute(orderId, request.user.sub, reason, evidence)
      return reply.code(201).send({ data: dispute })
    } catch (err: unknown) {
      return sendDisputeError(reply, err, 'Failed to create dispute')
    }
  })

  app.post('/vendor/disputes/:disputeId/respond', {
    preHandler: [
      authenticate,
      requireVerifiedEmail,
      requireVendorContext,
      requireVendorRole(['OWNER', 'ADMIN', 'MANAGER']),
    ],
    schema: vendorDisputeResponseSchema,
  }, async (request, reply) => {
    const { vendorId } = request.user
    if (!vendorId) return reply.code(403).send({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Vendor workspace access is required' } })

    const { disputeId } = request.params as { disputeId: string }
    const { message, evidence } = request.body as { message: string; evidence?: DisputeEvidenceInput[] }

    try {
      const dispute = await respondToDispute(disputeId, vendorId, request.user.sub, message, evidence)
      return reply.send({ data: dispute })
    } catch (err: unknown) {
      return sendDisputeError(reply, err, 'Failed to respond to dispute')
    }
  })

  app.get('/vendor/balance', {
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
      const balance = await getVendorBalance(vendorId)
      return reply.send({ data: balance })
    } catch (err: unknown) {
      return sendDisputeError(reply, err, 'Failed to load vendor balance')
    }
  })

  app.get('/admin/disputes', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (_request, reply) => {
    try {
      const disputes = await listAdminDisputes()
      return reply.send({ data: disputes })
    } catch (err: unknown) {
      return sendDisputeError(reply, err, 'Failed to load disputes')
    }
  })

  app.get('/admin/money/provider-failures', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (_request, reply) => {
    try {
      const failures = await listProviderFailures()
      return reply.send({ data: failures })
    } catch (err: unknown) {
      return sendDisputeError(reply, err, 'Failed to load provider failures')
    }
  })

  app.post('/admin/money/refund-failures/:executionId/retry', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (request, reply) => {
    const { executionId } = request.params as { executionId: string }
    try {
      const execution = await retryRefundFailure(executionId, request.user.sub)
      return reply.send({ data: execution })
    } catch (err: unknown) {
      return sendDisputeError(reply, err, 'Failed to retry refund failure')
    }
  })

  app.post('/admin/money/payout-failures/:executionId/retry', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (request, reply) => {
    const { executionId } = request.params as { executionId: string }
    try {
      const execution = await retryPayoutFailure(executionId, request.user.sub)
      return reply.send({ data: execution })
    } catch (err: unknown) {
      return sendDisputeError(reply, err, 'Failed to retry payout failure')
    }
  })

  app.post('/admin/money/refund-failures/:executionId/mark-reviewed', {
    preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin],
    schema: providerFailureReviewSchema,
  }, async (request, reply) => {
    const { executionId } = request.params as { executionId: string }
    const { note } = request.body as { note?: string }
    try {
      const execution = await markRefundFailureReviewed(executionId, request.user.sub, note)
      return reply.send({ data: execution })
    } catch (err: unknown) {
      return sendDisputeError(reply, err, 'Failed to mark refund failure reviewed')
    }
  })

  app.post('/admin/money/payout-failures/:executionId/mark-reviewed', {
    preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin],
    schema: providerFailureReviewSchema,
  }, async (request, reply) => {
    const { executionId } = request.params as { executionId: string }
    const { note } = request.body as { note?: string }
    try {
      const execution = await markPayoutFailureReviewed(executionId, request.user.sub, note)
      return reply.send({ data: execution })
    } catch (err: unknown) {
      return sendDisputeError(reply, err, 'Failed to mark payout failure reviewed')
    }
  })

  app.get('/admin/disputes/:disputeId', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (request, reply) => {
    const { disputeId } = request.params as { disputeId: string }

    try {
      const dispute = await getAdminDispute(disputeId)
      return reply.send({ data: dispute })
    } catch (err: unknown) {
      return sendDisputeError(reply, err, 'Failed to load dispute')
    }
  })

  app.get('/admin/disputes/evidence/:evidenceId/content', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (request, reply) => {
    const { evidenceId } = request.params as { evidenceId: string }

    try {
      const content = await readDisputeEvidenceContentForAdmin(evidenceId, request.user.sub)
      return reply.send({ data: content })
    } catch (err: unknown) {
      return sendDisputeError(reply, err, 'Failed to read dispute evidence content')
    }
  })

  app.post('/admin/disputes/:disputeId/resolve', {
    preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin],
    schema: resolveDisputeSchema,
  }, async (request, reply) => {
    const { disputeId } = request.params as { disputeId: string }
    const { resolutionType, refundAmountMinor } = request.body as {
      resolutionType: 'BUYER_FAVOR_FULL_REFUND' | 'BUYER_FAVOR_PARTIAL_REFUND' | 'VENDOR_FAVOR_RELEASE'
      refundAmountMinor?: number
    }

    try {
      const dispute = await resolveDisputeById(disputeId, request.user.sub, resolutionType, { refundAmountMinor })
      return reply.send({ data: dispute })
    } catch (err: unknown) {
      return sendDisputeError(reply, err, 'Failed to resolve dispute')
    }
  })

  // Открыть спор (buyer)
  app.post('/orders/:orderId/dispute', { preHandler: [authenticate, requireVerifiedEmail], schema: createDisputeSchema }, async (request, reply) => {
    if (request.user.isPlatformAdmin) {
      return reply.code(403).send({ error: 'Platform admin cannot open buyer disputes' })
    }

    const buyerId = (request.user as { sub: string }).sub
    const { orderId } = request.params as { orderId: string }
    const { reason, evidence } = request.body as { reason: string; evidence?: DisputeEvidenceInput[] }

    try {
      const dispute = await createDispute(orderId, buyerId, reason, evidence)
      return reply.code(201).send(dispute)
    } catch (err: unknown) {
      return sendDisputeError(reply, err, 'Failed to create dispute')
    }
  })

  // Получить спор по заказу
  app.get('/orders/:orderId/dispute', { preHandler: [authenticate, requireVerifiedEmail] }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string }
    const dispute = await getDisputeByOrder(orderId)
    if (!dispute) return reply.code(404).send({ error: 'Dispute not found' })
    const order = dispute.order
    const canRead = request.user.isPlatformAdmin || order.buyerId === request.user.sub || order.vendorId === request.user.vendorId
    if (!canRead) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Dispute access is not allowed' } })
    return dispute
  })

  // Разрешить спор (platform admin — упрощённо)
  app.patch('/orders/:orderId/dispute/resolve', {
    preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin],
    schema: resolveDisputeSchema,
  }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string }
    try {
      const { resolutionType, refundAmountMinor } = request.body as {
        resolutionType?: 'BUYER_FAVOR_FULL_REFUND' | 'BUYER_FAVOR_PARTIAL_REFUND' | 'VENDOR_FAVOR_RELEASE'
        refundAmountMinor?: number
      }
      const dispute = await resolveDispute(orderId, request.user.sub, resolutionType ?? 'VENDOR_FAVOR_RELEASE', { refundAmountMinor })
      return dispute
    } catch (err: unknown) {
      return sendDisputeError(reply, err, 'Failed to resolve dispute')
    }
  })
}
