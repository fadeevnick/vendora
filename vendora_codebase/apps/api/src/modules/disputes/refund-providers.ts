import crypto from 'node:crypto'

export interface CreateRefundInput {
  disputeId: string
  orderId: string
  providerPaymentIntentId?: string | null
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

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for REFUND_PROVIDER=stripe`)
  return value
}

function providerBaseUrl(name: string, fallback: string) {
  return (process.env[name] || fallback).replace(/\/$/, '')
}

class StripeRefundProvider implements RefundProvider {
  name = 'stripe'
  private apiKey = requiredEnv('STRIPE_SECRET_KEY')
  private baseUrl = providerBaseUrl('STRIPE_API_BASE_URL', 'https://api.stripe.com')

  async createRefund(input: CreateRefundInput): Promise<RefundProviderResult> {
    if (!input.providerPaymentIntentId) {
      throw new Error('Stripe refund provider requires provider payment intent id')
    }

    const params = new URLSearchParams()
    params.set('payment_intent', input.providerPaymentIntentId)
    params.set('amount', String(input.amountMinor))
    params.set('metadata[disputeId]', input.disputeId)
    params.set('metadata[orderId]', input.orderId)
    params.set('metadata[reason]', input.reason)

    const response = await fetch(`${this.baseUrl}/v1/refunds`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })
    const payload = await response.json().catch(() => ({})) as { id?: unknown; status?: unknown; error?: { message?: unknown } }

    if (!response.ok) {
      const message = typeof payload.error?.message === 'string' ? payload.error.message : `HTTP ${response.status}`
      throw new Error(`Stripe refund failed: ${message}`)
    }
    if (typeof payload.id !== 'string' || !payload.id) {
      throw new Error('Stripe refund failed: missing refund id')
    }

    return {
      providerName: this.name,
      providerRefundId: payload.id,
      status: 'SUCCEEDED',
    }
  }
}

export function createRefundProvider(): RefundProvider {
  const provider = process.env['REFUND_PROVIDER'] ?? 'dev_mock'

  if (provider === 'dev_mock' || provider === 'dev') return new DevMockRefundProvider()
  if (provider === 'stripe') return new StripeRefundProvider()

  throw new Error(`Unsupported REFUND_PROVIDER: ${provider}`)
}
