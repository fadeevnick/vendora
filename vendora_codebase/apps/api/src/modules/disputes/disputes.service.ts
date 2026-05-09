import type { Prisma } from '@prisma/client'
import { prisma } from '../../shared/db.js'
import {
  enqueueForPlatformAdmins,
  enqueueForVendorOwners,
  enqueueNotification,
} from '../notifications/notifications.service.js'
import { createPayoutProvider } from './payout-providers.js'
import { createRefundProvider, type RefundProviderResult } from './refund-providers.js'

type DisputeResolutionType = 'BUYER_FAVOR_FULL_REFUND' | 'BUYER_FAVOR_PARTIAL_REFUND' | 'VENDOR_FAVOR_RELEASE'

function disputeInclude() {
  return {
    order: {
      include: {
        vendor: { select: { id: true, name: true } },
        buyer: { select: { id: true, email: true } },
        funds: true,
      },
    },
  } as const
}

async function createLedgerEntry(input: {
  vendorId: string
  orderId: string
  entryType: 'FROZEN' | 'RELEASED' | 'REFUNDED'
  amountMinor: number
  currency: string
  referenceType: string
  referenceId: string
}, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  return tx.vendorBalanceLedger.create({
    data: input,
  })
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

async function executeRefundProvider(input: {
  dispute: Awaited<ReturnType<typeof getAdminDispute>>
  fund: NonNullable<Awaited<ReturnType<typeof getAdminDispute>>['order']['funds']>
  actorUserId: string
  resolutionType: DisputeResolutionType
  refundAmountMinor: number
}) {
  const provider = createRefundProvider()
  try {
    return await provider.createRefund({
      disputeId: input.dispute.id,
      orderId: input.dispute.orderId,
      amountMinor: input.refundAmountMinor,
      currency: input.fund.currency,
      reason: `${input.resolutionType}:${input.dispute.reason}`,
    })
  } catch (err: unknown) {
    const message = errorMessage(err)
    await prisma.$transaction(async (tx) => {
      await tx.refundProviderExecution.upsert({
        where: { disputeId: input.dispute.id },
        update: {
          providerName: provider.name,
          providerRefundId: `${provider.name}_refund_failed_${input.dispute.id}`,
          amountMinor: input.refundAmountMinor,
          currency: input.fund.currency,
          status: 'FAILED',
          errorMessage: message,
        },
        create: {
          disputeId: input.dispute.id,
          orderId: input.dispute.orderId,
          providerName: provider.name,
          providerRefundId: `${provider.name}_refund_failed_${input.dispute.id}`,
          amountMinor: input.refundAmountMinor,
          currency: input.fund.currency,
          status: 'FAILED',
          errorMessage: message,
        },
      })
      await tx.auditEvent.create({
        data: {
          actorUserId: input.actorUserId,
          action: 'REFUND_PROVIDER_FAILED',
          resourceType: 'dispute',
          resourceId: input.dispute.id,
          metadata: {
            orderId: input.dispute.orderId,
            vendorId: input.dispute.order.vendorId,
            providerName: provider.name,
            errorMessage: message,
            disputeStatus: input.dispute.status,
            fundStatus: input.fund.status,
            refundAmountMinor: input.refundAmountMinor,
          },
        },
      })
    })
    throw new Error('REFUND_PROVIDER_FAILED: refund provider failed; dispute remains in PLATFORM_REVIEW')
  }
}

export async function createDispute(orderId: string, buyerId: string, reason: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId },
    include: {
      funds: true,
      buyer: { select: { id: true, email: true } },
    },
  })
  if (!order) throw new Error('RESOURCE_NOT_FOUND: order not found')
  if (order.status === 'DISPUTED') throw new Error('DISPUTE_INVALID_STATE: dispute already exists for this order')
  if (order.status !== 'SHIPPED' && order.status !== 'DELIVERED' && order.status !== 'COMPLETED') {
    throw new Error(`ORDER_INVALID_STATE: expected SHIPPED, DELIVERED or COMPLETED, got ${order.status}`)
  }
  const fund = order.funds
  if (!fund) throw new Error('VALIDATION_ERROR: order fund record is missing')

  // 02_user_journeys.md:254 — спор создан → статус VENDOR_RESPONSE; escrow заморожен
  const dispute = await prisma.$transaction(async (tx) => {
    const created = await tx.dispute.create({
      data: { orderId, reason },
    })
    await tx.order.update({
      where: { id: orderId },
      data: { status: 'DISPUTED' },
    })
    await tx.orderFund.update({
      where: { orderId },
      data: { status: 'FROZEN_DISPUTE' },
    })
    await createLedgerEntry({
      vendorId: order.vendorId,
      orderId,
      entryType: 'FROZEN',
      amountMinor: fund.amountMinor,
      currency: fund.currency,
      referenceType: 'dispute',
      referenceId: created.id,
    }, tx)
    await tx.auditEvent.create({
      data: {
        actorUserId: buyerId,
        action: 'DISPUTE_OPENED',
        resourceType: 'dispute',
        resourceId: created.id,
        metadata: {
          orderId,
          vendorId: order.vendorId,
          from: order.status,
          to: 'DISPUTED',
          fundStatus: 'FROZEN_DISPUTE',
        },
      },
    })
    await enqueueNotification({
      eventType: 'DISPUTE_OPENED_BUYER',
      recipientUserId: order.buyer.id,
      recipientEmail: order.buyer.email,
      subject: 'Vendora dispute opened',
      templateKey: 'dispute.opened.buyer',
      payload: {
        disputeId: created.id,
        orderId,
        vendorId: order.vendorId,
        reason,
        fundStatus: 'FROZEN_DISPUTE',
      },
      referenceType: 'dispute',
      referenceId: created.id,
    }, tx)
    await enqueueForVendorOwners({
      vendorId: order.vendorId,
      eventType: 'DISPUTE_OPENED_VENDOR',
      subject: 'Vendora dispute opened',
      templateKey: 'dispute.opened.vendor',
      payload: {
        disputeId: created.id,
        orderId,
        buyerEmail: order.buyer.email,
        reason,
        fundStatus: 'FROZEN_DISPUTE',
      },
      referenceType: 'dispute',
      referenceId: created.id,
    }, tx)
    await enqueueForPlatformAdmins({
      eventType: 'DISPUTE_OPENED_ADMIN',
      subject: 'Vendora dispute opened',
      templateKey: 'dispute.opened.admin',
      payload: {
        disputeId: created.id,
        orderId,
        vendorId: order.vendorId,
        buyerEmail: order.buyer.email,
      },
      referenceType: 'dispute',
      referenceId: created.id,
    }, tx)
    return created
  })

  return dispute
}

export async function getDisputeByOrder(orderId: string) {
  return prisma.dispute.findUnique({
    where: { orderId },
    include: disputeInclude(),
  })
}

export async function listAdminDisputes() {
  return prisma.dispute.findMany({
    include: disputeInclude(),
    orderBy: { createdAt: 'desc' },
  })
}

export async function getAdminDispute(disputeId: string) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: disputeInclude(),
  })
  if (!dispute) throw new Error('RESOURCE_NOT_FOUND: dispute not found')
  return dispute
}

export async function respondToDispute(disputeId: string, vendorId: string, actorUserId: string, message: string) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: disputeInclude(),
  })
  if (!dispute) throw new Error('RESOURCE_NOT_FOUND: dispute not found')
  if (dispute.order.vendorId !== vendorId) throw new Error('RESOURCE_NOT_FOUND: dispute not found')
  if (dispute.status !== 'VENDOR_RESPONSE') {
    throw new Error(`DISPUTE_INVALID_STATE: expected VENDOR_RESPONSE, got ${dispute.status}`)
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.dispute.update({
      where: { id: dispute.id },
      data: {
        status: 'PLATFORM_REVIEW',
        vendorResponse: message,
        vendorRespondedByUserId: actorUserId,
        vendorRespondedAt: new Date(),
      },
      include: disputeInclude(),
    })
    await tx.auditEvent.create({
      data: {
        actorUserId,
        action: 'DISPUTE_VENDOR_RESPONDED',
        resourceType: 'dispute',
        resourceId: dispute.id,
        metadata: {
          orderId: dispute.orderId,
          vendorId,
          from: 'VENDOR_RESPONSE',
          to: 'PLATFORM_REVIEW',
        },
      },
    })
    await enqueueNotification({
      eventType: 'DISPUTE_VENDOR_RESPONDED_BUYER',
      recipientUserId: dispute.order.buyer.id,
      recipientEmail: dispute.order.buyer.email,
      subject: 'Vendora dispute response received',
      templateKey: 'dispute.vendor_responded.buyer',
      payload: {
        disputeId: dispute.id,
        orderId: dispute.orderId,
        vendorId,
        status: 'PLATFORM_REVIEW',
      },
      referenceType: 'dispute',
      referenceId: dispute.id,
    }, tx)
    await enqueueForPlatformAdmins({
      eventType: 'DISPUTE_VENDOR_RESPONDED_ADMIN',
      subject: 'Vendora dispute ready for review',
      templateKey: 'dispute.vendor_responded.admin',
      payload: {
        disputeId: dispute.id,
        orderId: dispute.orderId,
        vendorId,
        status: 'PLATFORM_REVIEW',
      },
      referenceType: 'dispute',
      referenceId: dispute.id,
    }, tx)
    return next
  })

  return updated
}

export async function resolveDisputeById(disputeId: string, actorUserId: string, resolutionType: DisputeResolutionType, options: { refundAmountMinor?: number } = {}) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: disputeInclude(),
  })
  if (!dispute) throw new Error('RESOURCE_NOT_FOUND: dispute not found')
  if (dispute.status !== 'PLATFORM_REVIEW') {
    throw new Error(`DISPUTE_INVALID_STATE: expected PLATFORM_REVIEW, got ${dispute.status}`)
  }
  const fund = dispute.order.funds
  if (!fund) throw new Error('VALIDATION_ERROR: order fund record is missing')
  if (fund.status !== 'FROZEN_DISPUTE') {
    throw new Error(`DISPUTE_INVALID_STATE: expected FROZEN_DISPUTE fund, got ${fund.status}`)
  }

  const requestedPartialRefundMinor = options.refundAmountMinor ?? 0
  const refundAmountMinor = resolutionType === 'BUYER_FAVOR_FULL_REFUND'
    ? fund.amountMinor
    : resolutionType === 'BUYER_FAVOR_PARTIAL_REFUND'
      ? requestedPartialRefundMinor
      : 0
  if (resolutionType === 'BUYER_FAVOR_PARTIAL_REFUND') {
    if (!Number.isInteger(refundAmountMinor) || refundAmountMinor <= 0 || refundAmountMinor >= fund.amountMinor) {
      throw new Error('VALIDATION_ERROR: partial refund amount must be greater than zero and less than the order fund amount')
    }
  }
  const vendorReleaseAmountMinor = fund.amountMinor - (refundAmountMinor ?? 0)
  const orderStatus = resolutionType === 'BUYER_FAVOR_FULL_REFUND' ? 'CANCELLED' : 'COMPLETED'
  const fundStatus = resolutionType === 'BUYER_FAVOR_FULL_REFUND' ? 'RETURNED_TO_BUYER' : 'RELEASABLE'
  const refundAfterShipment = Boolean(refundAmountMinor && refundAmountMinor > 0 && dispute.order.shippedAt)
  const stockPolicy = refundAfterShipment ? 'NO_AUTO_RESTOCK_AFTER_SHIPMENT' : 'NO_STOCK_CHANGE'
  const restockedQuantity = 0
  const returnInspectionRequired = refundAfterShipment
  let refundResult: RefundProviderResult | null = null

  if (resolutionType === 'BUYER_FAVOR_FULL_REFUND' || resolutionType === 'BUYER_FAVOR_PARTIAL_REFUND') {
    refundResult = await executeRefundProvider({ dispute, fund, actorUserId, resolutionType, refundAmountMinor: refundAmountMinor ?? fund.amountMinor })
  }

  // 02_user_journeys.md:259 — Platform Admin принимает решение; escrow разблокируется
  const resolved = await prisma.$transaction(async (tx) => {
    const nextDispute = await tx.dispute.update({
      where: { id: dispute.id },
      data: {
        status: 'RESOLVED',
        resolutionType,
        resolvedByUserId: actorUserId,
        resolvedAt: new Date(),
      },
      include: disputeInclude(),
    })
    await tx.order.update({
      where: { id: dispute.orderId },
      data: { status: orderStatus },
    })
    await tx.orderFund.update({
      where: { orderId: dispute.orderId },
      data: { status: fundStatus, refundedAmountMinor: refundAmountMinor ?? 0 },
    })
    if (refundAmountMinor && refundAmountMinor > 0) {
      await createLedgerEntry({
        vendorId: dispute.order.vendorId,
        orderId: dispute.orderId,
        entryType: 'REFUNDED',
        amountMinor: refundAmountMinor,
        currency: fund.currency,
        referenceType: 'dispute',
        referenceId: dispute.id,
      }, tx)
    }
    if (vendorReleaseAmountMinor > 0) {
      await createLedgerEntry({
        vendorId: dispute.order.vendorId,
        orderId: dispute.orderId,
        entryType: 'RELEASED',
        amountMinor: vendorReleaseAmountMinor,
        currency: fund.currency,
        referenceType: 'dispute',
        referenceId: dispute.id,
      }, tx)
    }
    if (refundResult) {
      await tx.refundProviderExecution.upsert({
        where: { disputeId: dispute.id },
        update: {
          providerName: refundResult.providerName,
          providerRefundId: refundResult.providerRefundId,
          amountMinor: refundAmountMinor ?? fund.amountMinor,
          currency: fund.currency,
          status: refundResult.status,
          errorMessage: null,
        },
        create: {
          disputeId: dispute.id,
          orderId: dispute.orderId,
          providerName: refundResult.providerName,
          providerRefundId: refundResult.providerRefundId,
          amountMinor: refundAmountMinor ?? fund.amountMinor,
          currency: fund.currency,
          status: refundResult.status,
        },
      })
    }
    await tx.auditEvent.create({
      data: {
        actorUserId,
        action: 'DISPUTE_RESOLVED',
        resourceType: 'dispute',
        resourceId: dispute.id,
        metadata: {
          orderId: dispute.orderId,
          vendorId: dispute.order.vendorId,
          resolutionType,
          orderStatus,
          fundStatus,
          refundAmountMinor,
          vendorReleaseAmountMinor,
          refundProviderName: refundResult?.providerName,
          refundProviderId: refundResult?.providerRefundId,
          stockPolicy,
          restockedQuantity,
          returnInspectionRequired,
        },
      },
    })
    await enqueueNotification({
      eventType: 'DISPUTE_RESOLVED_BUYER',
      recipientUserId: dispute.order.buyer.id,
      recipientEmail: dispute.order.buyer.email,
      subject: 'Vendora dispute resolved',
      templateKey: 'dispute.resolved.buyer',
      payload: {
        disputeId: dispute.id,
        orderId: dispute.orderId,
        resolutionType,
        orderStatus,
        fundStatus,
        refundAmountMinor,
        vendorReleaseAmountMinor,
        stockPolicy,
        restockedQuantity,
        returnInspectionRequired,
      },
      referenceType: 'dispute',
      referenceId: dispute.id,
    }, tx)
    await enqueueForVendorOwners({
      vendorId: dispute.order.vendorId,
      eventType: 'DISPUTE_RESOLVED_VENDOR',
      subject: 'Vendora dispute resolved',
      templateKey: 'dispute.resolved.vendor',
      payload: {
        disputeId: dispute.id,
        orderId: dispute.orderId,
        resolutionType,
        orderStatus,
        fundStatus,
        refundAmountMinor,
        vendorReleaseAmountMinor,
        stockPolicy,
        restockedQuantity,
        returnInspectionRequired,
      },
      referenceType: 'dispute',
      referenceId: dispute.id,
    }, tx)
    return nextDispute
  })

  return resolved
}

export async function resolveDispute(orderId: string, actorUserId: string, resolutionType: DisputeResolutionType = 'VENDOR_FAVOR_RELEASE', options: { refundAmountMinor?: number } = {}) {
  const dispute = await prisma.dispute.findUnique({ where: { orderId } })
  if (!dispute) throw new Error('RESOURCE_NOT_FOUND: dispute not found')
  return resolveDisputeById(dispute.id, actorUserId, resolutionType, options)
}

export async function getVendorBalance(vendorId: string) {
  const [funds, ledger] = await Promise.all([
    prisma.orderFund.findMany({
      where: { vendorId },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.vendorBalanceLedger.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
  ])

  const totals = {
    heldMinor: 0,
    frozenMinor: 0,
    releasableMinor: 0,
    returnedToBuyerMinor: 0,
    paidOutMinor: 0,
  }

  for (const fund of funds) {
    const vendorAmountMinor = Math.max(0, fund.amountMinor - fund.refundedAmountMinor)
    if (fund.status === 'HELD') totals.heldMinor += fund.amountMinor
    if (fund.status === 'FROZEN_DISPUTE') totals.frozenMinor += fund.amountMinor
    if (fund.status === 'RELEASABLE') totals.releasableMinor += vendorAmountMinor
    if (fund.status === 'RETURNED_TO_BUYER') totals.returnedToBuyerMinor += fund.amountMinor
    if (fund.status === 'PAID_OUT') totals.paidOutMinor += vendorAmountMinor
  }

  return {
    vendorId,
    currency: funds[0]?.currency ?? 'RUB',
    totals,
    ledger,
  }
}

export async function listProviderFailures() {
  const [refunds, payouts] = await Promise.all([
    prisma.refundProviderExecution.findMany({
      where: { status: 'FAILED' },
      include: {
        dispute: {
          include: {
            order: { include: { funds: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.payoutProviderExecution.findMany({
      where: { status: 'FAILED' },
      include: { orderFund: true, vendor: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  return { refunds, payouts }
}

export async function retryRefundFailure(executionId: string, actorUserId: string) {
  const execution = await prisma.refundProviderExecution.findUnique({
    where: { id: executionId },
    include: {
      dispute: {
        include: {
          order: { include: { funds: true } },
        },
      },
    },
  })
  if (!execution) throw new Error('RESOURCE_NOT_FOUND: refund failure not found')
  if (execution.status !== 'FAILED') {
    throw new Error(`DISPUTE_INVALID_STATE: expected FAILED refund execution, got ${execution.status}`)
  }
  const fund = execution.dispute.order.funds
  if (!fund) throw new Error('VALIDATION_ERROR: order fund record is missing')
  if (execution.dispute.status !== 'PLATFORM_REVIEW' || fund.status !== 'FROZEN_DISPUTE') {
    throw new Error('DISPUTE_INVALID_STATE: failed refund can only be retried while dispute is in review and funds are frozen')
  }
  if (execution.amountMinor <= 0 || execution.amountMinor > fund.amountMinor) {
    throw new Error('VALIDATION_ERROR: refund retry amount is not valid for the order fund')
  }

  const provider = createRefundProvider()
  const refund = await provider.createRefund({
    disputeId: execution.disputeId,
    orderId: execution.orderId,
    amountMinor: execution.amountMinor,
    currency: execution.currency,
    reason: 'provider-remediation-retry',
    retry: true,
  })
  const resolutionType: DisputeResolutionType = execution.amountMinor === fund.amountMinor
    ? 'BUYER_FAVOR_FULL_REFUND'
    : 'BUYER_FAVOR_PARTIAL_REFUND'
  const orderStatus = resolutionType === 'BUYER_FAVOR_FULL_REFUND' ? 'CANCELLED' : 'COMPLETED'
  const fundStatus = resolutionType === 'BUYER_FAVOR_FULL_REFUND' ? 'RETURNED_TO_BUYER' : 'RELEASABLE'
  const vendorReleaseAmountMinor = fund.amountMinor - execution.amountMinor

  return prisma.$transaction(async (tx) => {
    const updated = await tx.refundProviderExecution.update({
      where: { id: execution.id },
      data: {
        providerName: refund.providerName,
        providerRefundId: refund.providerRefundId,
        status: refund.status,
        errorMessage: null,
        reviewedAt: null,
        reviewedByUserId: null,
        reviewNote: null,
      },
    })
    await tx.dispute.update({
      where: { id: execution.disputeId },
      data: {
        status: 'RESOLVED',
        resolutionType,
        resolvedByUserId: actorUserId,
        resolvedAt: new Date(),
      },
    })
    await tx.order.update({
      where: { id: execution.orderId },
      data: { status: orderStatus },
    })
    await tx.orderFund.update({
      where: { id: fund.id },
      data: {
        status: fundStatus,
        refundedAmountMinor: execution.amountMinor,
      },
    })
    await createLedgerEntry({
      vendorId: fund.vendorId,
      orderId: execution.orderId,
      entryType: 'REFUNDED',
      amountMinor: execution.amountMinor,
      currency: execution.currency,
      referenceType: 'dispute',
      referenceId: execution.disputeId,
    }, tx)
    if (vendorReleaseAmountMinor > 0) {
      await createLedgerEntry({
        vendorId: fund.vendorId,
        orderId: execution.orderId,
        entryType: 'RELEASED',
        amountMinor: vendorReleaseAmountMinor,
        currency: execution.currency,
        referenceType: 'dispute',
        referenceId: execution.disputeId,
      }, tx)
    }
    await tx.auditEvent.create({
      data: {
        actorUserId,
        action: 'REFUND_PROVIDER_RETRY_SUCCEEDED',
        resourceType: 'refund_provider_execution',
        resourceId: execution.id,
        metadata: {
          disputeId: execution.disputeId,
          orderId: execution.orderId,
          resolutionType,
          refundAmountMinor: execution.amountMinor,
          vendorReleaseAmountMinor,
          providerName: refund.providerName,
          providerRefundId: refund.providerRefundId,
          fundStatus,
          orderStatus,
        },
      },
    })
    return updated
  })
}

export async function retryPayoutFailure(executionId: string, actorUserId: string) {
  const execution = await prisma.payoutProviderExecution.findUnique({
    where: { id: executionId },
    include: { orderFund: true },
  })
  if (!execution) throw new Error('RESOURCE_NOT_FOUND: payout failure not found')
  if (execution.status !== 'FAILED') {
    throw new Error(`DISPUTE_INVALID_STATE: expected FAILED payout execution, got ${execution.status}`)
  }
  if (execution.orderFund.status !== 'PAYOUT_FAILED_REVIEW') {
    throw new Error(`DISPUTE_INVALID_STATE: expected PAYOUT_FAILED_REVIEW fund, got ${execution.orderFund.status}`)
  }

  const provider = createPayoutProvider()
  const payout = await provider.createPayout({
    vendorId: execution.vendorId,
    orderFundId: execution.orderFundId,
    orderId: execution.orderId,
    amountMinor: execution.amountMinor,
    currency: execution.currency,
    retry: true,
  })

  return prisma.$transaction(async (tx) => {
    const updated = await tx.payoutProviderExecution.update({
      where: { id: execution.id },
      data: {
        providerName: payout.providerName,
        providerPayoutId: payout.providerPayoutId,
        status: payout.status,
        errorMessage: null,
        reviewedAt: null,
        reviewedByUserId: null,
        reviewNote: null,
      },
    })
    await tx.orderFund.update({
      where: { id: execution.orderFundId },
      data: { status: 'PAID_OUT' },
    })
    await tx.vendorBalanceLedger.create({
      data: {
        vendorId: execution.vendorId,
        orderId: execution.orderId,
        entryType: 'PAID_OUT',
        amountMinor: execution.amountMinor,
        currency: execution.currency,
        referenceType: 'payout_provider_execution',
        referenceId: execution.id,
      },
    })
    await tx.auditEvent.create({
      data: {
        actorUserId,
        action: 'PAYOUT_PROVIDER_RETRY_SUCCEEDED',
        resourceType: 'payout_provider_execution',
        resourceId: execution.id,
        metadata: {
          vendorId: execution.vendorId,
          orderId: execution.orderId,
          orderFundId: execution.orderFundId,
          payoutAmountMinor: execution.amountMinor,
          providerName: payout.providerName,
          providerPayoutId: payout.providerPayoutId,
          fundStatus: 'PAID_OUT',
        },
      },
    })
    return updated
  })
}

export async function markRefundFailureReviewed(executionId: string, actorUserId: string, note?: string) {
  const execution = await prisma.refundProviderExecution.findUnique({ where: { id: executionId } })
  if (!execution) throw new Error('RESOURCE_NOT_FOUND: refund failure not found')
  if (execution.status !== 'FAILED') {
    throw new Error(`DISPUTE_INVALID_STATE: expected FAILED refund execution, got ${execution.status}`)
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.refundProviderExecution.update({
      where: { id: execution.id },
      data: {
        reviewedAt: new Date(),
        reviewedByUserId: actorUserId,
        reviewNote: note ?? null,
      },
    })
    await tx.auditEvent.create({
      data: {
        actorUserId,
        action: 'REFUND_PROVIDER_FAILURE_REVIEWED',
        resourceType: 'refund_provider_execution',
        resourceId: execution.id,
        metadata: {
          disputeId: execution.disputeId,
          orderId: execution.orderId,
          note: note ?? null,
        },
      },
    })
    return updated
  })
}

export async function markPayoutFailureReviewed(executionId: string, actorUserId: string, note?: string) {
  const execution = await prisma.payoutProviderExecution.findUnique({ where: { id: executionId } })
  if (!execution) throw new Error('RESOURCE_NOT_FOUND: payout failure not found')
  if (execution.status !== 'FAILED') {
    throw new Error(`DISPUTE_INVALID_STATE: expected FAILED payout execution, got ${execution.status}`)
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.payoutProviderExecution.update({
      where: { id: execution.id },
      data: {
        reviewedAt: new Date(),
        reviewedByUserId: actorUserId,
        reviewNote: note ?? null,
      },
    })
    await tx.auditEvent.create({
      data: {
        actorUserId,
        action: 'PAYOUT_PROVIDER_FAILURE_REVIEWED',
        resourceType: 'payout_provider_execution',
        resourceId: execution.id,
        metadata: {
          vendorId: execution.vendorId,
          orderId: execution.orderId,
          orderFundId: execution.orderFundId,
          note: note ?? null,
        },
      },
    })
    return updated
  })
}
