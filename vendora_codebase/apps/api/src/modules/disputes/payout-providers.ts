import crypto from 'node:crypto'

export interface CreatePayoutInput {
  vendorId: string
  orderFundId: string
  orderId: string
  amountMinor: number
  currency: string
  retry?: boolean
}

export interface PayoutProviderResult {
  providerName: string
  providerPayoutId: string
  status: 'SUCCEEDED'
}

export interface PayoutProvider {
  name: string
  createPayout(input: CreatePayoutInput): Promise<PayoutProviderResult>
}

class DevMockPayoutProvider implements PayoutProvider {
  name = 'dev_mock'

  async createPayout(input: CreatePayoutInput): Promise<PayoutProviderResult> {
    if (process.env['DEV_PAYOUT_FAIL_FUND_IDS']?.split(',').map((id) => id.trim()).includes(input.orderFundId)) {
      throw new Error(`Dev payout provider forced failure for order fund ${input.orderFundId}`)
    }
    if (!input.retry && input.amountMinor === 1700) {
      throw new Error(`Dev payout provider forced failure for amount ${input.amountMinor}`)
    }

    return {
      providerName: this.name,
      providerPayoutId: `dev_mock_payout_${crypto.randomUUID()}`,
      status: 'SUCCEEDED',
    }
  }
}

export function createPayoutProvider(): PayoutProvider {
  const provider = process.env['PAYOUT_PROVIDER'] ?? 'dev_mock'

  if (provider === 'dev_mock' || provider === 'dev') return new DevMockPayoutProvider()

  throw new Error(`Unsupported PAYOUT_PROVIDER: ${provider}`)
}
