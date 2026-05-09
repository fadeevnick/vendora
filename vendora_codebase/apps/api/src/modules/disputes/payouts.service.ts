import { prisma } from '../../shared/db.js'
import { createPayoutProvider } from './payout-providers.js'

export async function drainPayouts(input: {
  limit?: number
  vendorId?: string
} = {}) {
  const limit = input.limit ?? 25
  const provider = createPayoutProvider()
  const funds = await prisma.orderFund.findMany({
    where: {
      status: 'RELEASABLE',
      vendorId: input.vendorId,
      payoutExecution: null,
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  })

  const summary = {
    providerName: provider.name,
    selected: funds.length,
    paidOut: 0,
    skipped: 0,
    failed: 0,
    ids: [] as string[],
  }

  function providerFailureId(fundId: string) {
    return `${provider.name}_payout_failed_${fundId}`
  }

  for (const fund of funds) {
    const payoutAmountMinor = Math.max(0, fund.amountMinor - fund.refundedAmountMinor)
    if (payoutAmountMinor <= 0) {
      summary.skipped += 1
      continue
    }

    try {
      const payout = await provider.createPayout({
        vendorId: fund.vendorId,
        orderFundId: fund.id,
        orderId: fund.orderId,
        amountMinor: payoutAmountMinor,
        currency: fund.currency,
      })

      await prisma.$transaction(async (tx) => {
        const current = await tx.orderFund.findUnique({ where: { id: fund.id } })
        if (!current || current.status !== 'RELEASABLE') {
          summary.skipped += 1
          return
        }

        const execution = await tx.payoutProviderExecution.create({
          data: {
            vendorId: fund.vendorId,
            orderFundId: fund.id,
            orderId: fund.orderId,
            providerName: payout.providerName,
            providerPayoutId: payout.providerPayoutId,
            amountMinor: payoutAmountMinor,
            currency: fund.currency,
            status: payout.status,
          },
        })
        await tx.orderFund.update({
          where: { id: fund.id },
          data: { status: 'PAID_OUT' },
        })
        await tx.vendorBalanceLedger.create({
          data: {
            vendorId: fund.vendorId,
            orderId: fund.orderId,
            entryType: 'PAID_OUT',
            amountMinor: payoutAmountMinor,
            currency: fund.currency,
            referenceType: 'payout_provider_execution',
            referenceId: execution.id,
          },
        })
        summary.paidOut += 1
        summary.ids.push(execution.id)
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      await prisma.$transaction(async (tx) => {
        const current = await tx.orderFund.findUnique({ where: { id: fund.id } })
        if (!current || current.status !== 'RELEASABLE') {
          summary.skipped += 1
          return
        }

        const execution = await tx.payoutProviderExecution.upsert({
          where: { orderFundId: fund.id },
          update: {
            providerName: provider.name,
            providerPayoutId: providerFailureId(fund.id),
            amountMinor: payoutAmountMinor,
            currency: fund.currency,
            status: 'FAILED',
            errorMessage: message,
          },
          create: {
            vendorId: fund.vendorId,
            orderFundId: fund.id,
            orderId: fund.orderId,
            providerName: provider.name,
            providerPayoutId: providerFailureId(fund.id),
            amountMinor: payoutAmountMinor,
            currency: fund.currency,
            status: 'FAILED',
            errorMessage: message,
          },
        })
        await tx.orderFund.update({
          where: { id: fund.id },
          data: { status: 'PAYOUT_FAILED_REVIEW' },
        })
        await tx.auditEvent.create({
          data: {
            actorUserId: null,
            action: 'PAYOUT_PROVIDER_FAILED',
            resourceType: 'payout_provider_execution',
            resourceId: execution.id,
            metadata: {
              vendorId: fund.vendorId,
              orderId: fund.orderId,
              orderFundId: fund.id,
              providerName: provider.name,
              amountMinor: payoutAmountMinor,
              errorMessage: message,
              fundStatus: 'PAYOUT_FAILED_REVIEW',
            },
          },
        })
      })
      summary.failed += 1
    }
  }

  return summary
}
