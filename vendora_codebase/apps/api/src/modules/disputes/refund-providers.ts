import crypto from 'node:crypto'

export interface CreateRefundInput {
  disputeId: string
  orderId: string
  amountMinor: number
  currency: string
  reason: string
  retry?: boolean
}

export interface RefundProviderResult {
  providerName: string
  providerRefundId: string
  status: 'SUCCEEDED'
}

export interface RefundProvider {
  name: string
  createRefund(input: CreateRefundInput): Promise<RefundProviderResult>
}

class DevMockRefundProvider implements RefundProvider {
  name = 'dev_mock'

  async createRefund(input: CreateRefundInput): Promise<RefundProviderResult> {
    if (process.env['DEV_REFUND_FAIL_DISPUTE_IDS']?.split(',').map((id) => id.trim()).includes(input.disputeId)) {
      throw new Error(`Dev refund provider forced failure for dispute ${input.disputeId}`)
    }
    if (!input.retry && input.reason.includes('force-refund-failure')) {
      throw new Error(`Dev refund provider forced failure for dispute ${input.disputeId}`)
    }

    return {
      providerName: this.name,
      providerRefundId: `dev_mock_refund_${crypto.randomUUID()}`,
      status: 'SUCCEEDED',
    }
  }
}

export function createRefundProvider(): RefundProvider {
  const provider = process.env['REFUND_PROVIDER'] ?? 'dev_mock'

  if (provider === 'dev_mock' || provider === 'dev') return new DevMockRefundProvider()

  throw new Error(`Unsupported REFUND_PROVIDER: ${provider}`)
}
