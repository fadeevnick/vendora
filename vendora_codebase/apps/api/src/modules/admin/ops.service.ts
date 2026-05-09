import type {
  MoneyReconciliationItemStatus,
  MoneyReconciliationStatus,
  MoneyReconciliationType,
  NotificationDeliveryStatus,
  Prisma,
} from '@prisma/client'
import { prisma } from '../../shared/db.js'
import { reindexCatalogSearch } from '../catalog/catalog.search.js'
import { autoEscalateVendorResponseDisputes } from '../disputes/disputes.service.js'
import { runOrderMaintenanceJobs } from '../orders/maintenance.service.js'

const DEFAULT_NOTIFICATION_LIMIT = 25
const MAX_NOTIFICATION_LIMIT = 100
const DEFAULT_MAINTENANCE_LIMIT = 50
const MAX_MAINTENANCE_LIMIT = 100
const NOTIFICATION_WORKER_DEFAULT_INTERVAL_MS = 30_000
const NOTIFICATION_WORKER_DEFAULT_MAX_ATTEMPTS = 3
const ORDER_MAINTENANCE_WORKER_DEFAULT_INTERVAL_MS = 60_000
const DISPUTE_SLA_WORKER_DEFAULT_INTERVAL_MS = 60_000
const CATALOG_SEARCH_WORKER_DEFAULT_INTERVAL_MS = 3_600_000
type ReturnInspectionOutcome = 'RESTOCK' | 'DO_NOT_RESTOCK'
type MoneyFailureType = 'ALL' | 'REFUND' | 'PAYOUT'
type ReviewedFilter = 'ALL' | 'REVIEWED' | 'UNREVIEWED'

function clampLimit(value: unknown) {
  const parsed = typeof value === 'string' ? Number(value) : undefined
  if (!parsed || !Number.isFinite(parsed) || parsed <= 0) return DEFAULT_NOTIFICATION_LIMIT
  return Math.min(Math.floor(parsed), MAX_NOTIFICATION_LIMIT)
}

function clampMaintenanceLimit(value: unknown) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined
  if (!parsed || !Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAINTENANCE_LIMIT
  return Math.min(Math.floor(parsed), MAX_MAINTENANCE_LIMIT)
}

function parsePositiveNumber(value: unknown, fallback: number, label: string) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`VALIDATION_ERROR: ${label} must be a positive number`)
  }
  return parsed
}

function parseOpsNow(value: unknown) {
  if (value === undefined || value === null || value === '') return new Date()
  if (typeof value !== 'string') throw new Error('VALIDATION_ERROR: now must be an ISO date string')
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error('VALIDATION_ERROR: now must be a valid ISO date string')
  return parsed
}

function dateHoursAgo(now: Date, hours: number) {
  return new Date(now.getTime() - hours * 60 * 60 * 1000)
}

function assertReturnInspectionOutcome(outcome: string): asserts outcome is ReturnInspectionOutcome {
  if (outcome !== 'RESTOCK' && outcome !== 'DO_NOT_RESTOCK') {
    throw new Error('VALIDATION_ERROR: outcome must be RESTOCK or DO_NOT_RESTOCK')
  }
}

function parseMoneyFailureType(value: unknown): MoneyFailureType {
  if (!value || value === 'ALL') return 'ALL'
  if (value === 'REFUND' || value === 'PAYOUT') return value
  throw new Error('VALIDATION_ERROR: type must be ALL, REFUND or PAYOUT')
}

function parseReviewedFilter(value: unknown): ReviewedFilter {
  if (!value || value === 'ALL') return 'ALL'
  if (value === 'REVIEWED' || value === 'UNREVIEWED') return value
  throw new Error('VALIDATION_ERROR: reviewed must be ALL, REVIEWED or UNREVIEWED')
}

function parseReconciliationStatus(value: unknown): MoneyReconciliationStatus | undefined {
  if (!value) return undefined
  if (value === 'SUCCEEDED' || value === 'FAILED') return value
  throw new Error('VALIDATION_ERROR: status must be SUCCEEDED or FAILED')
}

function parseReconciliationItemStatus(value: unknown): MoneyReconciliationItemStatus | undefined {
  if (!value) return undefined
  if (value === 'MATCHED' || value === 'MISMATCHED') return value
  throw new Error('VALIDATION_ERROR: itemStatus must be MATCHED or MISMATCHED')
}

function parseReconciliationItemType(value: unknown): MoneyReconciliationType | undefined {
  if (!value) return undefined
  if (value === 'PAYMENT_EVENT' || value === 'REFUND_EXECUTION' || value === 'PAYOUT_EXECUTION') return value
  throw new Error('VALIDATION_ERROR: itemType must be PAYMENT_EVENT, REFUND_EXECUTION or PAYOUT_EXECUTION')
}

async function countNotifications(status: NotificationDeliveryStatus) {
  return prisma.notificationOutbox.count({ where: { status } })
}

async function notificationQueueSummary() {
  const [pending, sent, failed, suppressed, oldestPending, oldestFailed] = await Promise.all([
    countNotifications('PENDING'),
    countNotifications('SENT'),
    countNotifications('FAILED'),
    countNotifications('SUPPRESSED'),
    prisma.notificationOutbox.findFirst({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, eventType: true, referenceType: true, referenceId: true, createdAt: true, attempts: true, lastError: true },
    }),
    prisma.notificationOutbox.findFirst({
      where: { status: 'FAILED' },
      orderBy: { updatedAt: 'asc' },
      select: { id: true, eventType: true, referenceType: true, referenceId: true, updatedAt: true, attempts: true, lastError: true },
    }),
  ])

  return {
    pending,
    sent,
    failed,
    suppressed,
    total: pending + sent + failed + suppressed,
    oldestPending,
    oldestFailed,
  }
}

async function orderMaintenanceBacklog(now: Date, input: {
  confirmationOlderThanHours?: number
  deliveryOlderThanHours?: number
} = {}) {
  const confirmationCutoff = dateHoursAgo(now, input.confirmationOlderThanHours ?? 48)
  const deliveryCutoff = dateHoursAgo(now, input.deliveryOlderThanHours ?? 72)

  const [checkoutExpiryDue, confirmationTimeoutDue, deliveryTimeoutDue] = await Promise.all([
    prisma.checkoutSession.count({
      where: {
        status: 'AWAITING_PAYMENT',
        expiresAt: { lte: now },
        orders: { none: {} },
        stockReservations: { some: { status: 'RESERVED' } },
      },
    }),
    prisma.order.count({
      where: {
        status: 'PAYMENT_HELD',
        createdAt: { lte: confirmationCutoff },
        funds: { status: 'HELD' },
      },
    }),
    prisma.order.count({
      where: {
        status: 'DELIVERED',
        deliveredAt: { lte: deliveryCutoff },
        funds: { status: 'HELD' },
      },
    }),
  ])

  return {
    checkoutExpiryDue,
    confirmationTimeoutDue,
    deliveryTimeoutDue,
    totalDue: checkoutExpiryDue + confirmationTimeoutDue + deliveryTimeoutDue,
  }
}

async function disputeSlaBacklog(now: Date, olderThanHours = 48) {
  const cutoff = dateHoursAgo(now, olderThanHours)
  const due = await prisma.dispute.count({
    where: {
      status: 'VENDOR_RESPONSE',
      createdAt: { lte: cutoff },
    },
  })

  return {
    vendorResponseDue: due,
    totalDue: due,
    olderThanHours,
  }
}

async function returnInspectionQueueSummary(limit = 1000) {
  const disputes = await prisma.dispute.findMany({
    where: {
      status: 'RESOLVED',
      resolutionType: { in: ['BUYER_FAVOR_FULL_REFUND', 'BUYER_FAVOR_PARTIAL_REFUND'] },
      order: { shippedAt: { not: null } },
    },
    select: { id: true, orderId: true, resolvedAt: true },
    orderBy: { resolvedAt: 'asc' },
    take: limit,
  })
  const completed = disputes.length === 0
    ? []
    : await prisma.auditEvent.findMany({
        where: {
          resourceType: 'dispute',
          action: 'RETURN_INSPECTION_COMPLETED',
          resourceId: { in: disputes.map((dispute) => dispute.id) },
        },
        select: { resourceId: true, createdAt: true },
      })
  const completedIds = new Set(completed.map((audit) => audit.resourceId))
  const pendingDisputes = disputes.filter((dispute) => !completedIds.has(dispute.id))
  const oldestPending = pendingDisputes[0] ?? null

  return {
    pending: pendingDisputes.length,
    completed: completedIds.size,
    total: disputes.length,
    oldestPending,
  }
}

async function moneyFailureQueueSummary() {
  const [failedRefunds, unreviewedFailedRefunds, failedPayouts, unreviewedFailedPayouts] = await Promise.all([
    prisma.refundProviderExecution.count({ where: { status: 'FAILED' } }),
    prisma.refundProviderExecution.count({ where: { status: 'FAILED', reviewedAt: null } }),
    prisma.payoutProviderExecution.count({ where: { status: 'FAILED' } }),
    prisma.payoutProviderExecution.count({ where: { status: 'FAILED', reviewedAt: null } }),
  ])

  return {
    refunds: {
      failed: failedRefunds,
      unreviewed: unreviewedFailedRefunds,
    },
    payouts: {
      failed: failedPayouts,
      unreviewed: unreviewedFailedPayouts,
    },
    totalFailed: failedRefunds + failedPayouts,
    totalUnreviewed: unreviewedFailedRefunds + unreviewedFailedPayouts,
  }
}

async function latestWorkerActivity() {
  return prisma.auditEvent.findMany({
    where: {
      action: {
        in: [
          'ADMIN_ORDER_MAINTENANCE_RUN',
          'ORDER_AUTO_CANCELLED_CONFIRMATION_TIMEOUT',
          'ORDER_AUTO_COMPLETED_DELIVERY_TIMEOUT',
          'DISPUTE_VENDOR_RESPONSE_SLA_ESCALATED',
          'ADMIN_DISPUTE_SLA_RUN',
          'ADMIN_CATALOG_SEARCH_REINDEX',
          'CATALOG_SEARCH_REINDEX_WORKER_RUN',
          'NOTIFICATION_OUTBOX_RETRY_REQUESTED',
          'RETURN_INSPECTION_COMPLETED',
        ],
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      actorUserId: true,
      action: true,
      resourceType: true,
      resourceId: true,
      metadata: true,
      createdAt: true,
    },
  })
}

async function workerHeartbeatSummary(workerName: string, now: Date, staleAfterMs: number) {
  const heartbeats = await prisma.workerHeartbeat.findMany({
    where: { workerName },
    orderBy: [{ lastHeartbeatAt: 'desc' }, { updatedAt: 'desc' }],
    take: 5,
    select: {
      id: true,
      workerName: true,
      instanceId: true,
      status: true,
      runs: true,
      processed: true,
      idleRuns: true,
      lastStartedAt: true,
      lastHeartbeatAt: true,
      lastStoppedAt: true,
      lastError: true,
      metadata: true,
      updatedAt: true,
    },
  })
  const latest = heartbeats[0] ?? null
  const heartbeatAgeMs = latest?.lastHeartbeatAt ? now.getTime() - latest.lastHeartbeatAt.getTime() : null
  const effectiveStatus = latest
    ? latest.status === 'RUNNING' && heartbeatAgeMs !== null && heartbeatAgeMs > staleAfterMs
      ? 'STALE'
      : latest.status
    : 'NO_HEARTBEAT'

  return {
    status: effectiveStatus,
    staleAfterMs,
    latest,
    instances: heartbeats,
  }
}

export async function getAdminWorkerOps(now = new Date()) {
  const [
    notifications,
    maintenanceBacklog,
    disputeSla,
    activity,
    notificationHeartbeat,
    orderMaintenanceHeartbeat,
    disputeSlaHeartbeat,
    catalogSearch,
    catalogSearchHeartbeat,
  ] = await Promise.all([
    notificationQueueSummary(),
    orderMaintenanceBacklog(now),
    disputeSlaBacklog(now),
    latestWorkerActivity(),
    workerHeartbeatSummary('notification_outbox', now, NOTIFICATION_WORKER_DEFAULT_INTERVAL_MS * 3),
    workerHeartbeatSummary('order_maintenance', now, ORDER_MAINTENANCE_WORKER_DEFAULT_INTERVAL_MS * 3),
    workerHeartbeatSummary('dispute_sla', now, DISPUTE_SLA_WORKER_DEFAULT_INTERVAL_MS * 3),
    catalogSearchReindexBacklog(),
    workerHeartbeatSummary('catalog_search', now, CATALOG_SEARCH_WORKER_DEFAULT_INTERVAL_MS * 3),
  ])

  return {
    generatedAt: now,
    note: 'Local worker heartbeat records prove process entrypoint activity in this runtime DB; deployed liveness still requires deployed worker execution evidence.',
    notificationWorker: {
      status: notificationHeartbeat.status,
      heartbeat: notificationHeartbeat,
      queue: notifications,
      config: {
        provider: process.env['EMAIL_PROVIDER'] ?? 'dev_log',
        defaultLimit: DEFAULT_NOTIFICATION_LIMIT,
        defaultMaxAttempts: NOTIFICATION_WORKER_DEFAULT_MAX_ATTEMPTS,
        defaultIntervalMs: NOTIFICATION_WORKER_DEFAULT_INTERVAL_MS,
      },
    },
    orderMaintenanceWorker: {
      status: orderMaintenanceHeartbeat.status,
      heartbeat: orderMaintenanceHeartbeat,
      backlog: maintenanceBacklog,
      config: {
        defaultLimit: DEFAULT_MAINTENANCE_LIMIT,
        defaultConfirmationOlderThanHours: 48,
        defaultDeliveryOlderThanHours: 72,
        defaultIntervalMs: ORDER_MAINTENANCE_WORKER_DEFAULT_INTERVAL_MS,
      },
    },
    disputeSlaWorker: {
      status: disputeSlaHeartbeat.status,
      heartbeat: disputeSlaHeartbeat,
      backlog: disputeSla,
      config: {
        defaultLimit: DEFAULT_MAINTENANCE_LIMIT,
        defaultOlderThanHours: 48,
        defaultIntervalMs: DISPUTE_SLA_WORKER_DEFAULT_INTERVAL_MS,
      },
    },
    catalogSearchWorker: {
      status: catalogSearchHeartbeat.status,
      heartbeat: catalogSearchHeartbeat,
      backlog: catalogSearch,
      config: {
        defaultIntervalMs: CATALOG_SEARCH_WORKER_DEFAULT_INTERVAL_MS,
        index: process.env['MEILI_CATALOG_INDEX'] ?? 'vendora_products',
      },
    },
    latestActivity: activity,
  }
}

export async function getAdminQueueOps(now = new Date()) {
  const [notifications, maintenanceBacklog, disputeSla, returnInspections, moneyFailures] = await Promise.all([
    notificationQueueSummary(),
    orderMaintenanceBacklog(now),
    disputeSlaBacklog(now),
    returnInspectionQueueSummary(),
    moneyFailureQueueSummary(),
  ])

  return {
    generatedAt: now,
    notifications,
    orderMaintenance: maintenanceBacklog,
    disputeSla,
    returnInspections,
    moneyFailures,
    totals: {
      actionable: notifications.pending
        + notifications.failed
        + maintenanceBacklog.totalDue
        + disputeSla.totalDue
        + returnInspections.pending
        + moneyFailures.totalUnreviewed,
    },
  }
}

export async function runOrderMaintenanceFromOps(actorUserId: string, input: {
  dryRun?: boolean
  limit?: string | number
  now?: string
  confirmationOlderThanHours?: string | number
  deliveryOlderThanHours?: string | number
}) {
  const dryRun = input.dryRun !== false
  const limit = clampMaintenanceLimit(input.limit)
  const now = parseOpsNow(input.now)
  const confirmationOlderThanHours = parsePositiveNumber(input.confirmationOlderThanHours, 48, 'confirmationOlderThanHours')
  const deliveryOlderThanHours = parsePositiveNumber(input.deliveryOlderThanHours, 72, 'deliveryOlderThanHours')

  const backlog = await orderMaintenanceBacklog(now, {
    confirmationOlderThanHours,
    deliveryOlderThanHours,
  })

  if (dryRun) {
    return {
      mode: 'DRY_RUN',
      executed: false,
      generatedAt: now,
      limit,
      confirmationOlderThanHours,
      deliveryOlderThanHours,
      backlog,
    }
  }

  const result = await runOrderMaintenanceJobs({
    limit,
    now,
    confirmationOlderThanHours,
    deliveryOlderThanHours,
  })

  const audit = await prisma.auditEvent.create({
    data: {
      actorUserId,
      action: 'ADMIN_ORDER_MAINTENANCE_RUN',
      resourceType: 'order_maintenance',
      resourceId: `order-maintenance:${now.toISOString()}`,
      metadata: {
        dryRun: false,
        limit,
        now: now.toISOString(),
        confirmationOlderThanHours,
        deliveryOlderThanHours,
        backlogBefore: backlog,
        result,
      } as Prisma.InputJsonValue,
    },
  })

  return {
    mode: 'EXECUTE',
    executed: true,
    generatedAt: now,
    limit,
    confirmationOlderThanHours,
    deliveryOlderThanHours,
    backlogBefore: backlog,
    result,
    auditEventId: audit.id,
  }
}

export async function runDisputeSlaFromOps(actorUserId: string, input: {
  dryRun?: boolean
  limit?: string | number
  now?: string
  olderThanHours?: string | number
}) {
  const dryRun = input.dryRun !== false
  const limit = clampMaintenanceLimit(input.limit)
  const now = parseOpsNow(input.now)
  const olderThanHours = parsePositiveNumber(input.olderThanHours, 48, 'olderThanHours')
  const backlog = await disputeSlaBacklog(now, olderThanHours)

  if (dryRun) {
    return {
      mode: 'DRY_RUN',
      executed: false,
      generatedAt: now,
      limit,
      olderThanHours,
      backlog,
    }
  }

  const result = await autoEscalateVendorResponseDisputes({
    limit,
    now,
    olderThanHours,
  })

  const audit = await prisma.auditEvent.create({
    data: {
      actorUserId,
      action: 'ADMIN_DISPUTE_SLA_RUN',
      resourceType: 'dispute_sla',
      resourceId: `dispute-sla:${now.toISOString()}`,
      metadata: {
        dryRun: false,
        limit,
        now: now.toISOString(),
        olderThanHours,
        backlogBefore: backlog,
        result,
      } as Prisma.InputJsonValue,
    },
  })

  return {
    mode: 'EXECUTE',
    executed: true,
    generatedAt: now,
    limit,
    olderThanHours,
    backlogBefore: backlog,
    result,
    auditEventId: audit.id,
  }
}

async function catalogSearchReindexBacklog() {
  const documents = await prisma.product.count({
    where: {
      published: true,
      vendor: { status: 'APPROVED' },
    },
  })

  return {
    documents,
  }
}

export async function runCatalogSearchReindexFromOps(actorUserId: string, input: {
  dryRun?: boolean
}) {
  const dryRun = input.dryRun !== false
  const now = new Date()
  const backlog = await catalogSearchReindexBacklog()

  if (dryRun) {
    return {
      mode: 'DRY_RUN',
      executed: false,
      generatedAt: now,
      backlog,
    }
  }

  const result = await reindexCatalogSearch()
  const audit = await prisma.auditEvent.create({
    data: {
      actorUserId,
      action: 'ADMIN_CATALOG_SEARCH_REINDEX',
      resourceType: 'catalog_search',
      resourceId: `catalog-search:${now.toISOString()}`,
      metadata: {
        dryRun: false,
        backlogBefore: backlog,
        result,
      } as Prisma.InputJsonValue,
    },
  })

  return {
    mode: 'EXECUTE',
    executed: true,
    generatedAt: now,
    backlogBefore: backlog,
    result,
    auditEventId: audit.id,
  }
}

export async function getAdminOpsSummary(now = new Date()) {
  const [
    pendingNotifications,
    sentNotifications,
    failedNotifications,
    suppressedNotifications,
    oldestPendingNotification,
    failedRefunds,
    unreviewedFailedRefunds,
    failedPayouts,
    unreviewedFailedPayouts,
    latestReconciliation,
    maintenanceBacklog,
  ] = await Promise.all([
    countNotifications('PENDING'),
    countNotifications('SENT'),
    countNotifications('FAILED'),
    countNotifications('SUPPRESSED'),
    prisma.notificationOutbox.findFirst({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, createdAt: true, eventType: true, referenceType: true, referenceId: true },
    }),
    prisma.refundProviderExecution.count({ where: { status: 'FAILED' } }),
    prisma.refundProviderExecution.count({ where: { status: 'FAILED', reviewedAt: null } }),
    prisma.payoutProviderExecution.count({ where: { status: 'FAILED' } }),
    prisma.payoutProviderExecution.count({ where: { status: 'FAILED', reviewedAt: null } }),
    prisma.moneyReconciliationRun.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, mismatches: true, checkedPayments: true, checkedRefunds: true, checkedPayouts: true, createdAt: true, completedAt: true },
    }),
    orderMaintenanceBacklog(now),
  ])

  return {
    generatedAt: now,
    notifications: {
      pending: pendingNotifications,
      sent: sentNotifications,
      failed: failedNotifications,
      suppressed: suppressedNotifications,
      oldestPending: oldestPendingNotification,
    },
    moneyProviderFailures: {
      refunds: {
        failed: failedRefunds,
        unreviewed: unreviewedFailedRefunds,
      },
      payouts: {
        failed: failedPayouts,
        unreviewed: unreviewedFailedPayouts,
      },
    },
    latestReconciliation,
    orderMaintenanceBacklog: maintenanceBacklog,
  }
}

export async function listAdminNotifications(input: {
  status?: string
  eventType?: string
  referenceId?: string
  limit?: string
}) {
  const where: Prisma.NotificationOutboxWhereInput = {}
  if (input.status) where.status = input.status as NotificationDeliveryStatus
  if (input.eventType) where.eventType = input.eventType
  if (input.referenceId) where.referenceId = input.referenceId

  return prisma.notificationOutbox.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: clampLimit(input.limit),
    select: {
      id: true,
      eventType: true,
      recipientUserId: true,
      recipientEmail: true,
      subject: true,
      templateKey: true,
      status: true,
      providerName: true,
      providerMessageId: true,
      attempts: true,
      lastError: true,
      referenceType: true,
      referenceId: true,
      createdAt: true,
      updatedAt: true,
      sentAt: true,
    },
  })
}

export async function listMoneyReconciliationOps(input: {
  status?: string
  itemStatus?: string
  itemType?: string
  limit?: string
}) {
  const status = parseReconciliationStatus(input.status)
  const itemStatus = parseReconciliationItemStatus(input.itemStatus)
  const itemType = parseReconciliationItemType(input.itemType)
  const itemWhere: Prisma.MoneyReconciliationItemWhereInput = {}
  if (itemStatus) itemWhere.status = itemStatus
  if (itemType) itemWhere.itemType = itemType

  const where: Prisma.MoneyReconciliationRunWhereInput = {}
  if (status) where.status = status
  if (itemStatus || itemType) where.items = { some: itemWhere }

  const runs = await prisma.moneyReconciliationRun.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: clampLimit(input.limit),
    include: {
      items: {
        where: itemStatus || itemType ? itemWhere : undefined,
        orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
        take: 25,
      },
    },
  })

  return runs.map((run) => ({
    id: run.id,
    scope: run.scope,
    status: run.status,
    checkedPayments: run.checkedPayments,
    checkedRefunds: run.checkedRefunds,
    checkedPayouts: run.checkedPayouts,
    mismatches: run.mismatches,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    items: run.items.map((item) => ({
      id: item.id,
      itemType: item.itemType,
      resourceId: item.resourceId,
      status: item.status,
      detail: item.detail,
      createdAt: item.createdAt,
    })),
  }))
}

export async function listMoneyFailuresOps(input: {
  type?: string
  reviewed?: string
  limit?: string
}) {
  const type = parseMoneyFailureType(input.type)
  const reviewed = parseReviewedFilter(input.reviewed)
  const reviewWhere = reviewed === 'REVIEWED'
    ? { reviewedAt: { not: null } }
    : reviewed === 'UNREVIEWED'
      ? { reviewedAt: null }
      : {}
  const limit = clampLimit(input.limit)

  const [refunds, payouts] = await Promise.all([
    type === 'PAYOUT'
      ? Promise.resolve([])
      : prisma.refundProviderExecution.findMany({
          where: {
            status: 'FAILED',
            ...reviewWhere,
          },
          include: {
            dispute: {
              include: {
                order: {
                  include: {
                    buyer: { select: { id: true, email: true } },
                    vendor: { select: { id: true, name: true } },
                    funds: true,
                  },
                },
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: limit,
        }),
    type === 'REFUND'
      ? Promise.resolve([])
      : prisma.payoutProviderExecution.findMany({
          where: {
            status: 'FAILED',
            ...reviewWhere,
          },
          include: {
            vendor: { select: { id: true, name: true } },
            orderFund: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: limit,
        }),
  ])

  return {
    filters: { type, reviewed, limit },
    totals: {
      refunds: refunds.length,
      payouts: payouts.length,
      all: refunds.length + payouts.length,
    },
    refunds: refunds.map((execution) => ({
      id: execution.id,
      type: 'REFUND',
      providerName: execution.providerName,
      providerRefundId: execution.providerRefundId,
      amountMinor: execution.amountMinor,
      currency: execution.currency,
      status: execution.status,
      errorMessage: execution.errorMessage,
      reviewedAt: execution.reviewedAt,
      reviewedByUserId: execution.reviewedByUserId,
      reviewNote: execution.reviewNote,
      disputeId: execution.disputeId,
      orderId: execution.orderId,
      orderStatus: execution.dispute.order.status,
      fundStatus: execution.dispute.order.funds?.status ?? null,
      fundAmountMinor: execution.dispute.order.funds?.amountMinor ?? null,
      disputeStatus: execution.dispute.status,
      disputeResolutionType: execution.dispute.resolutionType,
      buyer: execution.dispute.order.buyer,
      vendor: execution.dispute.order.vendor,
      createdAt: execution.createdAt,
      updatedAt: execution.updatedAt,
    })),
    payouts: payouts.map((execution) => ({
      id: execution.id,
      type: 'PAYOUT',
      providerName: execution.providerName,
      providerPayoutId: execution.providerPayoutId,
      amountMinor: execution.amountMinor,
      currency: execution.currency,
      status: execution.status,
      errorMessage: execution.errorMessage,
      reviewedAt: execution.reviewedAt,
      reviewedByUserId: execution.reviewedByUserId,
      reviewNote: execution.reviewNote,
      vendor: execution.vendor,
      orderId: execution.orderId,
      orderFundId: execution.orderFundId,
      fundStatus: execution.orderFund.status,
      fundAmountMinor: execution.orderFund.amountMinor,
      createdAt: execution.createdAt,
      updatedAt: execution.updatedAt,
    })),
  }
}

export async function retryNotification(notificationId: string, actorUserId: string) {
  const notification = await prisma.notificationOutbox.findUnique({ where: { id: notificationId } })
  if (!notification) throw new Error('RESOURCE_NOT_FOUND: notification not found')
  if (notification.status !== 'FAILED') {
    throw new Error(`OPS_INVALID_STATE: expected FAILED notification, got ${notification.status}`)
  }

  return prisma.$transaction(async (tx) => {
    const retried = await tx.notificationOutbox.update({
      where: { id: notification.id },
      data: {
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        providerName: null,
        providerMessageId: null,
        sentAt: null,
      },
    })
    await tx.auditEvent.create({
      data: {
        actorUserId,
        action: 'NOTIFICATION_OUTBOX_RETRY_REQUESTED',
        resourceType: 'notification_outbox',
        resourceId: notification.id,
        metadata: {
          eventType: notification.eventType,
          recipientEmail: notification.recipientEmail,
          previousAttempts: notification.attempts,
          previousProviderName: notification.providerName,
          previousLastError: notification.lastError,
        },
      },
    })
    return retried
  })
}

async function getCompletedReturnInspection(disputeId: string) {
  return prisma.auditEvent.findFirst({
    where: {
      resourceType: 'dispute',
      resourceId: disputeId,
      action: 'RETURN_INSPECTION_COMPLETED',
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function listReturnInspections(input: { status?: string; limit?: string }) {
  const status = input.status === 'COMPLETED' ? 'COMPLETED' : input.status === 'ALL' ? 'ALL' : 'PENDING'
  const limit = clampLimit(input.limit)
  const disputes = await prisma.dispute.findMany({
    where: {
      status: 'RESOLVED',
      resolutionType: { in: ['BUYER_FAVOR_FULL_REFUND', 'BUYER_FAVOR_PARTIAL_REFUND'] },
      order: {
        shippedAt: { not: null },
      },
    },
    include: {
      order: {
        include: {
          buyer: { select: { id: true, email: true } },
          vendor: { select: { id: true, name: true } },
          items: {
            include: { product: { select: { id: true, name: true, stock: true } } },
          },
          funds: true,
        },
      },
    },
    orderBy: { resolvedAt: 'desc' },
    take: limit * 3,
  })

  const result = []
  for (const dispute of disputes) {
    const inspection = await getCompletedReturnInspection(dispute.id)
    const inspectionStatus = inspection ? 'COMPLETED' : 'PENDING'
    if (status !== 'ALL' && inspectionStatus !== status) continue
    result.push({
      disputeId: dispute.id,
      orderId: dispute.orderId,
      status: inspectionStatus,
      resolutionType: dispute.resolutionType,
      resolvedAt: dispute.resolvedAt,
      buyer: dispute.order.buyer,
      vendor: dispute.order.vendor,
      orderStatus: dispute.order.status,
      fundStatus: dispute.order.funds?.status ?? null,
      shippedAt: dispute.order.shippedAt,
      deliveredAt: dispute.order.deliveredAt,
      itemQuantity: dispute.order.items.reduce((sum, item) => sum + item.qty, 0),
      items: dispute.order.items.map((item) => ({
        productId: item.productId,
        productName: item.product.name,
        quantity: item.qty,
        currentStock: item.product.stock,
      })),
      inspection: inspection
        ? {
            id: inspection.id,
            actorUserId: inspection.actorUserId,
            completedAt: inspection.createdAt,
            metadata: inspection.metadata,
          }
        : null,
    })
    if (result.length >= limit) break
  }

  return result
}

export async function completeReturnInspection(disputeId: string, actorUserId: string, input: {
  outcome: string
  note?: string
}) {
  assertReturnInspectionOutcome(input.outcome)

  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      order: {
        include: {
          items: true,
          funds: true,
        },
      },
    },
  })
  if (!dispute) throw new Error('RESOURCE_NOT_FOUND: return inspection not found')
  if (dispute.status !== 'RESOLVED') {
    throw new Error(`OPS_INVALID_STATE: expected RESOLVED dispute, got ${dispute.status}`)
  }
  if (dispute.resolutionType !== 'BUYER_FAVOR_FULL_REFUND' && dispute.resolutionType !== 'BUYER_FAVOR_PARTIAL_REFUND') {
    throw new Error(`OPS_INVALID_STATE: expected buyer-favor refund dispute, got ${dispute.resolutionType}`)
  }
  if (!dispute.order.shippedAt) {
    throw new Error('OPS_INVALID_STATE: return inspection requires a shipped order')
  }

  const existing = await getCompletedReturnInspection(dispute.id)
  if (existing) throw new Error('OPS_INVALID_STATE: return inspection already completed')

  const restocks = input.outcome === 'RESTOCK'
    ? dispute.order.items.map((item) => ({
        productId: item.productId,
        quantity: item.qty,
      }))
    : []
  const restockedQuantity = restocks.reduce((sum, item) => sum + item.quantity, 0)

  return prisma.$transaction(async (tx) => {
    for (const restock of restocks) {
      await tx.product.update({
        where: { id: restock.productId },
        data: { stock: { increment: restock.quantity } },
      })
    }

    const audit = await tx.auditEvent.create({
      data: {
        actorUserId,
        action: 'RETURN_INSPECTION_COMPLETED',
        resourceType: 'dispute',
        resourceId: dispute.id,
        metadata: {
          orderId: dispute.orderId,
          outcome: input.outcome,
          note: input.note ?? null,
          restockedQuantity,
          productRestocks: restocks,
          orderStatus: dispute.order.status,
          fundStatus: dispute.order.funds?.status ?? null,
          resolutionType: dispute.resolutionType,
        },
      },
    })

    return {
      disputeId: dispute.id,
      orderId: dispute.orderId,
      status: 'COMPLETED',
      outcome: input.outcome,
      restockedQuantity,
      auditEventId: audit.id,
      completedAt: audit.createdAt,
    }
  })
}
