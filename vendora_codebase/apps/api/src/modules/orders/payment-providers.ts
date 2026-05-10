import crypto from 'node:crypto'

export type PaymentProviderEventType = 'PAYMENT_SUCCEEDED' | 'PAYMENT_FAILED'

export interface CreatePaymentSessionInput {
  checkoutSessionId: string
  buyerUserId: string
  amountMinor: number
  currency: string
  successUrl?: string
  cancelUrl?: string
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
    rawBody?: string
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

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for PAYMENT_PROVIDER=stripe`)
  return value
}

function optionalProviderBaseUrl(name: string, fallback: string) {
  return (process.env[name] || fallback).replace(/\/$/, '')
}

function headerValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]
  return value
}

function timingSafeEqualHex(a: string, b: string) {
  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function parseStripeSignature(header: string) {
  const parts = header.split(',').map((part) => part.trim())
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2)
  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3))
    .filter(Boolean)
  if (!timestamp || signatures.length === 0) {
    throw new Error('FORBIDDEN: Invalid Stripe signature header')
  }
  return { timestamp, signatures }
}

function assertStripeEventBody(body: unknown): asserts body is {
  id: string
  type: string
  data: { object?: { client_reference_id?: unknown; metadata?: Record<string, unknown> } }
} {
  if (!body || typeof body !== 'object') throw new Error('VALIDATION_ERROR: invalid Stripe event payload')
  const payload = body as Record<string, unknown>
  if (typeof payload['id'] !== 'string' || payload['id'].length < 2) {
    throw new Error('VALIDATION_ERROR: invalid Stripe event id')
  }
  if (typeof payload['type'] !== 'string' || payload['type'].length < 2) {
    throw new Error('VALIDATION_ERROR: invalid Stripe event type')
  }
  const data = payload['data']
  if (!data || typeof data !== 'object') throw new Error('VALIDATION_ERROR: invalid Stripe event data')
}

class StripePaymentProvider implements PaymentProvider {
  name = 'stripe'
  private apiKey = requiredEnv('STRIPE_SECRET_KEY')
  private webhookSecret = requiredEnv('STRIPE_WEBHOOK_SECRET')
  private baseUrl = optionalProviderBaseUrl('STRIPE_API_BASE_URL', 'https://api.stripe.com')
  private successUrl = process.env['STRIPE_SUCCESS_URL'] ?? 'http://localhost:3000/buyer/orders?checkout=success'
  private cancelUrl = process.env['STRIPE_CANCEL_URL'] ?? 'http://localhost:3000/buyer/cart?checkout=cancel'
  private toleranceSeconds = Number(process.env['STRIPE_WEBHOOK_TOLERANCE_SECONDS'] ?? 300)

  async createCheckoutSession(input: CreatePaymentSessionInput): Promise<PaymentSessionResult> {
    const params = new URLSearchParams()
    params.set('mode', 'payment')
    params.set('success_url', input.successUrl ?? this.successUrl)
    params.set('cancel_url', input.cancelUrl ?? this.cancelUrl)
    params.set('client_reference_id', input.checkoutSessionId)
    params.set('metadata[checkoutSessionId]', input.checkoutSessionId)
    params.set('metadata[buyerUserId]', input.buyerUserId)
    params.set('line_items[0][quantity]', '1')
    params.set('line_items[0][price_data][currency]', input.currency.toLowerCase())
    params.set('line_items[0][price_data][unit_amount]', String(input.amountMinor))
    params.set('line_items[0][price_data][product_data][name]', `Vendora checkout ${input.checkoutSessionId}`)

    const response = await fetch(`${this.baseUrl}/v1/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })
    const payload = await response.json().catch(() => ({})) as { id?: unknown; url?: unknown; error?: { message?: unknown } }

    if (!response.ok) {
      const message = typeof payload.error?.message === 'string' ? payload.error.message : `HTTP ${response.status}`
      throw new Error(`Stripe checkout session failed: ${message}`)
    }
    if (typeof payload.id !== 'string' || !payload.id) {
      throw new Error('Stripe checkout session failed: missing session id')
    }

    return {
      providerName: this.name,
      providerSessionId: payload.id,
      providerSessionSecret: typeof payload.url === 'string' && payload.url ? payload.url : payload.id,
    }
  }

  async parseWebhook(input: {
    headers: Record<string, string | string[] | undefined>
    body: unknown
    rawBody?: string
  }): Promise<ParsedPaymentWebhook> {
    const signatureHeader = headerValue(input.headers['stripe-signature'])
    if (!signatureHeader) throw new Error('FORBIDDEN: Missing Stripe signature')
    if (!input.rawBody) throw new Error('FORBIDDEN: Missing raw Stripe webhook body')

    const { timestamp, signatures } = parseStripeSignature(signatureHeader)
    const timestampSeconds = Number(timestamp)
    if (!Number.isFinite(timestampSeconds)) throw new Error('FORBIDDEN: Invalid Stripe signature timestamp')
    if (this.toleranceSeconds > 0 && Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > this.toleranceSeconds) {
      throw new Error('FORBIDDEN: Expired Stripe signature timestamp')
    }

    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(`${timestamp}.${input.rawBody}`)
      .digest('hex')
    if (!signatures.some((signature) => timingSafeEqualHex(signature, expected))) {
      throw new Error('FORBIDDEN: Invalid Stripe signature')
    }

    assertStripeEventBody(input.body)
    const session = input.body.data.object ?? {}
    const checkoutSessionId = typeof session.metadata?.checkoutSessionId === 'string'
      ? session.metadata.checkoutSessionId
      : typeof session.client_reference_id === 'string'
        ? session.client_reference_id
        : null
    if (!checkoutSessionId) throw new Error('VALIDATION_ERROR: missing checkout session reference')

    const eventType = input.body.type === 'checkout.session.completed'
      ? 'PAYMENT_SUCCEEDED'
      : input.body.type === 'checkout.session.async_payment_failed' || input.body.type === 'checkout.session.expired'
        ? 'PAYMENT_FAILED'
        : null
    if (!eventType) throw new Error(`VALIDATION_ERROR: unsupported Stripe event type ${input.body.type}`)

    return {
      providerName: this.name,
      providerEventId: input.body.id,
      checkoutSessionId,
      eventType,
      rawPayload: input.body,
    }
  }
}

export function createPaymentProvider(): PaymentProvider {
  const provider = process.env['PAYMENT_PROVIDER'] ?? 'dev_mock'

  if (provider === 'dev_mock' || provider === 'dev') return new DevMockPaymentProvider()
  if (provider === 'stripe') return new StripePaymentProvider()

  throw new Error(`Unsupported PAYMENT_PROVIDER: ${provider}`)
}
