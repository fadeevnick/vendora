import type { FastifyInstance, FastifyReply } from 'fastify'
import { authenticate, requirePlatformAdmin, requireVerifiedEmail } from '../../plugins/authenticate.js'
import {
  completeReturnInspection,
  getAdminOpsSummary,
  getAdminQueueOps,
  getAdminWorkerOps,
  listAdminNotifications,
  listMoneyFailuresOps,
  listMoneyReconciliationOps,
  listReturnInspections,
  retryNotification,
  runCatalogSearchReindexFromOps,
  runDisputeSlaFromOps,
  runOrderMaintenanceFromOps,
} from './ops.service.js'

function sendOpsError(reply: FastifyReply, err: unknown, fallback: string) {
  const rawMessage = err instanceof Error ? err.message : fallback
  const [maybeCode, ...messageParts] = rawMessage.split(': ')
  const knownCodes = new Set(['FORBIDDEN', 'RESOURCE_NOT_FOUND', 'OPS_INVALID_STATE', 'VALIDATION_ERROR'])
  const code = knownCodes.has(maybeCode) || maybeCode.includes('_') ? maybeCode : 'OPS_REQUEST_FAILED'
  const message = code === maybeCode ? messageParts.join(': ') || rawMessage : rawMessage
  const statusCode = code === 'RESOURCE_NOT_FOUND'
    ? 404
    : code === 'FORBIDDEN'
      ? 403
      : code.includes('INVALID_STATE')
        ? 409
        : 400

  return reply.code(statusCode).send({
    error: {
      code,
      message,
    },
  })
}

export async function adminOpsRoutes(app: FastifyInstance) {
  app.get('/admin/ops/summary', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (_request, reply) => {
    try {
      const summary = await getAdminOpsSummary()
      return reply.send({ data: summary })
    } catch (err: unknown) {
      return sendOpsError(reply, err, 'Failed to load ops summary')
    }
  })

  app.get('/admin/ops/workers', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (_request, reply) => {
    try {
      const workers = await getAdminWorkerOps()
      return reply.send({ data: workers })
    } catch (err: unknown) {
      return sendOpsError(reply, err, 'Failed to load worker ops')
    }
  })

  app.get('/admin/ops/queues', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (_request, reply) => {
    try {
      const queues = await getAdminQueueOps()
      return reply.send({ data: queues })
    } catch (err: unknown) {
      return sendOpsError(reply, err, 'Failed to load queue ops')
    }
  })

  app.get('/admin/ops/notifications', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (request, reply) => {
    const query = request.query as {
      status?: string
      eventType?: string
      referenceId?: string
      limit?: string
    }

    try {
      const notifications = await listAdminNotifications(query)
      return reply.send({ data: notifications })
    } catch (err: unknown) {
      return sendOpsError(reply, err, 'Failed to load notification outbox')
    }
  })

  app.post('/admin/ops/notifications/:notificationId/retry', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (request, reply) => {
    const { notificationId } = request.params as { notificationId: string }
    try {
      const notification = await retryNotification(notificationId, request.user.sub)
      return reply.send({ data: notification })
    } catch (err: unknown) {
      return sendOpsError(reply, err, 'Failed to retry notification')
    }
  })

  app.post('/admin/ops/order-maintenance/run', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (request, reply) => {
    const body = request.body as {
      dryRun?: boolean
      limit?: string | number
      now?: string
      confirmationOlderThanHours?: string | number
      deliveryOlderThanHours?: string | number
    }

    try {
      const result = await runOrderMaintenanceFromOps(request.user.sub, body ?? {})
      return reply.send({ data: result })
    } catch (err: unknown) {
      return sendOpsError(reply, err, 'Failed to run order maintenance')
    }
  })

  app.post('/admin/ops/dispute-sla/run', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (request, reply) => {
    const body = request.body as {
      dryRun?: boolean
      limit?: string | number
      now?: string
      olderThanHours?: string | number
    }

    try {
      const result = await runDisputeSlaFromOps(request.user.sub, body ?? {})
      return reply.send({ data: result })
    } catch (err: unknown) {
      return sendOpsError(reply, err, 'Failed to run dispute SLA')
    }
  })

  app.post('/admin/ops/catalog-search/reindex', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (request, reply) => {
    const body = request.body as {
      dryRun?: boolean
    }

    try {
      const result = await runCatalogSearchReindexFromOps(request.user.sub, body ?? {})
      return reply.send({ data: result })
    } catch (err: unknown) {
      return sendOpsError(reply, err, 'Failed to reindex catalog search')
    }
  })

  app.get('/admin/ops/money/reconciliation', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (request, reply) => {
    const query = request.query as {
      status?: string
      itemStatus?: string
      itemType?: string
      limit?: string
    }

    try {
      const runs = await listMoneyReconciliationOps(query)
      return reply.send({ data: runs })
    } catch (err: unknown) {
      return sendOpsError(reply, err, 'Failed to load money reconciliation ops')
    }
  })

  app.get('/admin/ops/money/failures', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (request, reply) => {
    const query = request.query as {
      type?: string
      reviewed?: string
      limit?: string
    }

    try {
      const failures = await listMoneyFailuresOps(query)
      return reply.send({ data: failures })
    } catch (err: unknown) {
      return sendOpsError(reply, err, 'Failed to load money failure ops')
    }
  })

  app.get('/admin/ops/return-inspections', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (request, reply) => {
    const query = request.query as { status?: string; limit?: string }

    try {
      const inspections = await listReturnInspections(query)
      return reply.send({ data: inspections })
    } catch (err: unknown) {
      return sendOpsError(reply, err, 'Failed to load return inspections')
    }
  })

  app.post('/admin/ops/return-inspections/:disputeId/complete', { preHandler: [authenticate, requireVerifiedEmail, requirePlatformAdmin] }, async (request, reply) => {
    const { disputeId } = request.params as { disputeId: string }
    const { outcome, note } = request.body as { outcome?: string; note?: string }

    try {
      const inspection = await completeReturnInspection(disputeId, request.user.sub, {
        outcome: outcome ?? '',
        note,
      })
      return reply.send({ data: inspection })
    } catch (err: unknown) {
      return sendOpsError(reply, err, 'Failed to complete return inspection')
    }
  })
}
