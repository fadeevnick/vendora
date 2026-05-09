import crypto from 'node:crypto'

export type PaymentProviderEventType = 'PAYMENT_SUCCEEDED' | 'PAYMENT_FAILED'

export interface CreatePaymentSessionInput {
  checkoutSessionId: string
  buyerUserId: string
  amountMinor: number
  currency: string
}

export interface PaymentSessionResult {
  providerName: string
  providerSessionId: string
  providerSessionSecret: string
}

export interface ParsedPaymentWebhook {
  providerName: string
  providerEventId: string
  checkoutSessionId: string
  eventType: PaymentProviderEventType
  rawPayload: unknown
}

export interface PaymentProvider {
  name: string
  createCheckoutSession(input: CreatePaymentSessionInput): Promise<PaymentSessionResult>
  parseWebhook(input: {
    headers: Record<string, string | string[] | undefined>
    body: unknown
  }): Promise<ParsedPaymentWebhook>
}

function assertWebhookBody(body: unknown): asserts body is {
  providerEventId: string
  checkoutSessionId: string
  eventType: PaymentProviderEventType
} {
  if (!body || typeof body !== 'object') {
    throw new Error('VALIDATION_ERROR: invalid provider payload')
  }

  const payload = body as Record<string, unknown>
  if (typeof payload['providerEventId'] !== 'string' || payload['providerEventId'].length < 2) {
    throw new Error('VALIDATION_ERROR: invalid provider event id')
  }
  if (typeof payload['checkoutSessionId'] !== 'string' || payload['checkoutSessionId'].length < 1) {
    throw new Error('VALIDATION_ERROR: invalid checkout session id')
  }
  if (payload['eventType'] !== 'PAYMENT_SUCCEEDED' && payload['eventType'] !== 'PAYMENT_FAILED') {
    throw new Error('VALIDATION_ERROR: invalid provider event type')
  }
}

class DevMockPaymentProvider implements PaymentProvider {
  name = 'dev_mock'
  private secret = process.env['PAYMENT_WEBHOOK_SECRET'] ?? 'dev-payment-secret'

  async createCheckoutSession(input: CreatePaymentSessionInput): Promise<PaymentSessionResult> {
    const providerSessionId = `dev_mock_checkout_${crypto.randomUUID()}`
    return {
      providerName: this.name,
      providerSessionId,
      providerSessionSecret: providerSessionId,
    }
  }

  async parseWebhook(input: {
    headers: Record<string, string | string[] | undefined>
    body: unknown
  }): Promise<ParsedPaymentWebhook> {
    if (input.headers['x-vendora-provider-secret'] !== this.secret) {
      throw new Error('FORBIDDEN: Invalid provider signature')
    }

    assertWebhookBody(input.body)

    return {
      providerName: this.name,
      providerEventId: input.body.providerEventId,
      checkoutSessionId: input.body.checkoutSessionId,
      eventType: input.body.eventType,
      rawPayload: input.body,
    }
  }
}

export function createPaymentProvider(): PaymentProvider {
  const provider = process.env['PAYMENT_PROVIDER'] ?? 'dev_mock'

  if (provider === 'dev_mock' || provider === 'dev') return new DevMockPaymentProvider()

  throw new Error(`Unsupported PAYMENT_PROVIDER: ${provider}`)
}
