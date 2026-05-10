import http from 'node:http'
import { createRefundProvider } from '../../src/modules/disputes/refund-providers.js'

const evidence: Array<{ id: string; detail: string }> = []

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function record(id: string, detail: string) {
  evidence.push({ id, detail })
  console.log(`${id}: ${detail}`)
}

async function withMockStripe<T>(fn: (input: {
  baseUrl: string
  requests: Array<{ method?: string; url?: string; authorization?: string; body: URLSearchParams }>
}) => Promise<T>) {
  const requests: Array<{ method?: string; url?: string; authorization?: string; body: URLSearchParams }> = []
  const server = http.createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    requests.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      body: new URLSearchParams(body),
    })

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ id: 're_runtime_stripe', status: 'succeeded' }))
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
  await withMockStripe(async ({ baseUrl, requests }) => {
    process.env.REFUND_PROVIDER = 'stripe'
    process.env.STRIPE_SECRET_KEY = 'sk_test_runtime'
    process.env.STRIPE_API_BASE_URL = baseUrl

    const provider = createRefundProvider()
    const refund = await provider.createRefund({
      disputeId: 'dispute-runtime-stripe',
      orderId: 'order-runtime-stripe',
      providerPaymentIntentId: 'pi_runtime_stripe',
      amountMinor: 4321,
      currency: 'RUB',
      reason: 'runtime stripe refund proof',
    })

    assert(refund.providerName === 'stripe', `expected stripe provider, got ${refund.providerName}`)
    assert(refund.providerRefundId === 're_runtime_stripe', `expected Stripe refund id, got ${refund.providerRefundId}`)
    assert(refund.status === 'SUCCEEDED', `expected refund succeeded, got ${refund.status}`)
    assert(requests.length === 1, `expected one Stripe refund request, got ${requests.length}`)

    const request = requests[0]
    assert(request.method === 'POST', `expected POST, got ${request.method}`)
    assert(request.url === '/v1/refunds', `expected refunds endpoint, got ${request.url}`)
    assert(request.authorization === 'Bearer sk_test_runtime', 'expected Stripe bearer auth')
    assert(request.body.get('payment_intent') === 'pi_runtime_stripe', 'expected payment intent reference')
    assert(request.body.get('amount') === '4321', 'expected refund amount minor')
    assert(request.body.get('metadata[disputeId]') === 'dispute-runtime-stripe', 'expected dispute metadata')
    assert(request.body.get('metadata[orderId]') === 'order-runtime-stripe', 'expected order metadata')
    record('H1-STRIPE-REFUND-PROVIDER-01', 'stripe refund adapter creates refund requests with payment intent, amount and metadata')

    try {
      await provider.createRefund({
        disputeId: 'dispute-runtime-missing-payment-intent',
        orderId: 'order-runtime-missing-payment-intent',
        amountMinor: 100,
        currency: 'RUB',
        reason: 'runtime missing payment intent proof',
      })
    } catch (err) {
      assert(err instanceof Error && err.message.includes('payment intent'), 'expected missing payment intent error')
      record('H1-STRIPE-REFUND-PROVIDER-02', 'stripe refund adapter refuses refunds without provider payment intent evidence')
      return
    }
    throw new Error('expected missing payment intent refund to fail')
  })

  console.log(JSON.stringify({ ok: true, evidence }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
