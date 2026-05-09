import type { Prisma } from '@prisma/client'
import { prisma } from '../../shared/db.js'

type ReconciliationItemInput = {
  itemType: 'PAYMENT_EVENT' | 'REFUND_EXECUTION' | 'PAYOUT_EXECUTION'
  resourceId: string
  matched: boolean
  detail: Prisma.InputJsonValue
}

function itemStatus(matched: boolean) {
  return matched ? 'MATCHED' : 'MISMATCHED'
}

export async function runMoneyReconciliation(input: { limit?: number } = {}) {
  const limit = input.limit ?? 100
  const items: ReconciliationItemInput[] = []

  const paymentEvents = await prisma.paymentProviderEvent.findMany({
    where: { processedAt: { not: null } },
    include: {
      checkoutSession: {
        include: { orders: { select: { id: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  for (const event of paymentEvents) {
    const session = event.checkoutSession
    const lateEventAfterExpiry = session?.status === 'EXPIRED' && session.orders.length === 0
    const matched = Boolean(session) && (
      event.eventType === 'PAYMENT_SUCCEEDED'
        ? session?.status === 'SUCCEEDED' && session.orders.length > 0
          || lateEventAfterExpiry
        : event.eventType === 'PAYMENT_FAILED'
          ? session?.status === 'FAILED' && session.orders.length === 0
            || lateEventAfterExpiry
          : true
    )
    items.push({
      itemType: 'PAYMENT_EVENT',
      resourceId: event.id,
      matched,
      detail: {
        providerName: event.providerName,
        providerEventId: event.providerEventId,
        eventType: event.eventType,
        checkoutSessionId: event.checkoutSessionId,
        checkoutStatus: session?.status ?? null,
        orderCount: session?.orders.length ?? 0,
        lateEventAfterExpiry,
      },
    })
  }

  const refunds = await prisma.refundProviderExecution.findMany({
    include: {
      dispute: {
        include: {
          order: { include: { funds: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  for (const refund of refunds) {
    const refundedLedger = await prisma.vendorBalanceLedger.findFirst({
      where: {
        referenceType: 'dispute',
        referenceId: refund.disputeId,
        entryType: 'REFUNDED',
      },
    })
    const releasedLedger = await prisma.vendorBalanceLedger.findFirst({
      where: {
        referenceType: 'dispute',
        referenceId: refund.disputeId,
        entryType: 'RELEASED',
      },
    })
    const fund = refund.dispute.order.funds
    const expectedVendorRelease = fund ? fund.amountMinor - refund.amountMinor : null
    const matched = refund.status === 'SUCCEEDED'
      ? refund.dispute.resolutionType === 'BUYER_FAVOR_FULL_REFUND'
        ? fund?.status === 'RETURNED_TO_BUYER'
          && (fund.refundedAmountMinor === 0 || fund.refundedAmountMinor === refund.amountMinor)
          && refund.amountMinor === fund.amountMinor
          && refundedLedger?.amountMinor === refund.amountMinor
        : refund.dispute.resolutionType === 'BUYER_FAVOR_PARTIAL_REFUND'
          && (fund?.status === 'RELEASABLE' || fund?.status === 'PAID_OUT')
          && fund.refundedAmountMinor === refund.amountMinor
          && refund.amountMinor > 0
          && refund.amountMinor < fund.amountMinor
          && refundedLedger?.amountMinor === refund.amountMinor
          && releasedLedger?.amountMinor === expectedVendorRelease
      : refund.status === 'FAILED'
        && refund.dispute.status === 'PLATFORM_REVIEW'
        && refund.dispute.order.funds?.status === 'FROZEN_DISPUTE'
    items.push({
      itemType: 'REFUND_EXECUTION',
      resourceId: refund.id,
      matched,
      detail: {
        providerName: refund.providerName,
        providerRefundId: refund.providerRefundId,
        disputeId: refund.disputeId,
        orderId: refund.orderId,
        refundStatus: refund.status,
        disputeResolutionType: refund.dispute.resolutionType,
        fundStatus: refund.dispute.order.funds?.status ?? null,
        fundAmountMinor: fund?.amountMinor ?? null,
        refundedAmountMinor: fund?.refundedAmountMinor ?? null,
        expectedVendorRelease,
        hasRefundedLedger: Boolean(refundedLedger),
        refundedLedgerAmountMinor: refundedLedger?.amountMinor ?? null,
        releasedLedgerAmountMinor: releasedLedger?.amountMinor ?? null,
        errorMessage: refund.errorMessage,
      },
    })
  }

  const payouts = await prisma.payoutProviderExecution.findMany({
    include: { orderFund: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  for (const payout of payouts) {
    const ledger = await prisma.vendorBalanceLedger.findFirst({
      where: {
        referenceType: 'payout_provider_execution',
        referenceId: payout.id,
        entryType: 'PAID_OUT',
      },
    })
    const matched = payout.status === 'SUCCEEDED'
      ? payout.orderFund.status === 'PAID_OUT' && Boolean(ledger)
      : payout.status === 'FAILED'
        && payout.orderFund.status === 'PAYOUT_FAILED_REVIEW'
        && !ledger
    items.push({
      itemType: 'PAYOUT_EXECUTION',
      resourceId: payout.id,
      matched,
      detail: {
        providerName: payout.providerName,
        providerPayoutId: payout.providerPayoutId,
        orderFundId: payout.orderFundId,
        orderId: payout.orderId,
        payoutStatus: payout.status,
        fundStatus: payout.orderFund.status,
        hasPaidOutLedger: Boolean(ledger),
        errorMessage: payout.errorMessage,
      },
    })
  }

  const mismatches = items.filter((item) => !item.matched).length
  return prisma.moneyReconciliationRun.create({
    data: {
      status: mismatches === 0 ? 'SUCCEEDED' : 'FAILED',
      checkedPayments: paymentEvents.length,
      checkedRefunds: refunds.length,
      checkedPayouts: payouts.length,
      mismatches,
      completedAt: new Date(),
      items: {
        create: items.map((item) => ({
          itemType: item.itemType,
          resourceId: item.resourceId,
          status: itemStatus(item.matched),
          detail: item.detail,
        })),
      },
    },
    include: { items: true },
  })
}
