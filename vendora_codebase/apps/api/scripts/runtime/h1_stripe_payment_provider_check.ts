import crypto from 'node:crypto'
import http from 'node:http'
import { createPaymentProvider } from '../../src/modules/orders/payment-providers.js'

const evidence: Array<{ id: string; detail: string }> = []

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function record(id: string, detail: string) {
  evidence.push({ id, detail })
  console.log(`${id}: ${detail}`)
}

function stripeSignature(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')
  return `t=${timestamp},v1=${signature}`
}

async function withMockStripe<T>(fn: (input: {
  baseUrl: string
  requests: Array<{ method?: string; url?: string; authorization?: string; body: URLSearchParams }>
}) => Promise<T>) {
  const requests: Array<{ method?: string; url?: string; authorization?: string; body: URLSearchParams }> = []
  const server = http.createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const parsedBody = new URLSearchParams(body)
    requests.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      body: parsedBody,
    })

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      id: 'cs_test_runtime_stripe',
      url: 'https://checkout.stripe.com/c/pay/cs_test_runtime_stripe',
    }))
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert(address && typeof address === 'object', 'mock Stripe server address should be available')
  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
    return await fn({ baseUrl, requests })
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  }
}

async function main() {
  const webhookSecret = 'whsec_runtime_stripe'

  await withMockStripe(async ({ baseUrl, requests }) => {
    process.env.PAYMENT_PROVIDER = 'stripe'
    process.env.STRIPE_SECRET_KEY = 'sk_test_runtime'
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret
    process.env.STRIPE_API_BASE_URL = baseUrl
    process.env.STRIPE_SUCCESS_URL = 'https://vendora.local/success'
    process.env.STRIPE_CANCEL_URL = 'https://vendora.local/cancel'

    const provider = createPaymentProvider()
    const session = await provider.createCheckoutSession({
      checkoutSessionId: 'checkout-runtime-stripe',
      buyerUserId: 'buyer-runtime-stripe',
      amountMinor: 12345,
      currency: 'RUB',
    })

    assert(session.providerName === 'stripe', `expected stripe provider, got ${session.providerName}`)
    assert(session.providerSessionId === 'cs_test_runtime_stripe', `expected Stripe session id, got ${session.providerSessionId}`)
    assert(session.providerSessionSecret === 'https://checkout.stripe.com/c/pay/cs_test_runtime_stripe', 'expected Stripe checkout URL as session secret')
    assert(requests.length === 1, `expected one Stripe API request, got ${requests.length}`)

    const request = requests[0]
    assert(request.method === 'POST', `expected POST, got ${request.method}`)
    assert(request.url === '/v1/checkout/sessions', `expected checkout sessions endpoint, got ${request.url}`)
    assert(request.authorization === 'Bearer sk_test_runtime', 'expected Stripe bearer auth')
    assert(request.body.get('mode') === 'payment', 'expected payment mode')
    assert(request.body.get('client_reference_id') === 'checkout-runtime-stripe', 'expected checkout client reference')
    assert(request.body.get('metadata[checkoutSessionId]') === 'checkout-runtime-stripe', 'expected checkout metadata')
    assert(request.body.get('metadata[buyerUserId]') === 'buyer-runtime-stripe', 'expected buyer metadata')
    assert(request.body.get('line_items[0][price_data][currency]') === 'rub', 'expected lower-case currency')
    assert(request.body.get('line_items[0][price_data][unit_amount]') === '12345', 'expected amount minor')
    record('H1-STRIPE-PAYMENT-PROVIDER-01', 'stripe adapter creates Checkout Session requests with amount, currency and metadata')

    const rawBody = JSON.stringify({
      id: 'evt_runtime_stripe_success',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_runtime_stripe',
          payment_intent: 'pi_runtime_stripe',
          client_reference_id: 'checkout-runtime-stripe',
          metadata: { checkoutSessionId: 'checkout-runtime-stripe' },
        },
      },
    })
    const parsed = JSON.parse(rawBody)
    const event = await provider.parseWebhook({
      headers: { 'stripe-signature': stripeSignature(rawBody, webhookSecret) },
      body: parsed,
      rawBody,
    })
    assert(event.providerName === 'stripe', `expected stripe webhook provider, got ${event.providerName}`)
    assert(event.providerEventId === 'evt_runtime_stripe_success', 'expected Stripe event id')
    assert(event.providerPaymentIntentId === 'pi_runtime_stripe', 'expected Stripe payment intent id')
    assert(event.checkoutSessionId === 'checkout-runtime-stripe', 'expected checkout session id from Stripe metadata')
    assert(event.eventType === 'PAYMENT_SUCCEEDED', `expected payment success, got ${event.eventType}`)
    record('H1-STRIPE-PAYMENT-PROVIDER-02', 'stripe adapter verifies signed raw webhook body and maps checkout completion to payment success')

    try {
      await provider.parseWebhook({
        headers: { 'stripe-signature': stripeSignature(rawBody, 'wrong-secret') },
        body: parsed,
        rawBody,
      })
    } catch (err) {
      assert(err instanceof Error && err.message.includes('Invalid Stripe signature'), 'expected invalid signature error')
      record('H1-STRIPE-PAYMENT-PROVIDER-03', 'stripe adapter rejects invalid webhook signatures')
      return
    }
    throw new Error('expected invalid Stripe signature to fail')
  })

  console.log(JSON.stringify({ ok: true, evidence }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
