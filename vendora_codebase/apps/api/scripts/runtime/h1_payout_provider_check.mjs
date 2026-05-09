import { execFileSync } from 'node:child_process'
import {
  assert,
  clearBuyerCart,
  disconnect,
  ensureProductFixture,
  ensureVendorFixture,
  evidence,
  login,
  prisma,
  record,
  request,
  runtimeSuffix,
  shippingAddress,
  upsertVerifiedUser,
} from './runtime_helpers.mjs'

function drainPayouts(vendorId) {
  const output = execFileSync('npm', ['run', 'payouts:drain', '--', '--limit=10', `--vendor-id=${vendorId}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PAYOUT_PROVIDER: 'dev_mock',
    },
    encoding: 'utf8',
  })
  const jsonStart = output.indexOf('{')
  assert(jsonStart >= 0, `payout drain output did not include JSON: ${output}`)
  return JSON.parse(output.slice(jsonStart))
}

async function setupFixtures(suffix) {
  const buyer = await upsertVerifiedUser(`h1-payout-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h1-payout-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `H1PAYOUT${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `H1 Payout Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h1-payout-product-${suffix}`,
    vendorId: vendor.id,
    name: `H1 Payout Product ${suffix}`,
    price: 43,
    stock: 8,
  })
  await clearBuyerCart(buyer.id)
  return { buyer, vendorUser, vendor, product }
}

async function createReleasableOrder({ buyerToken, vendorToken, productId, suffix }) {
  const cart = await request('/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ listingId: productId, quantity: 1 }),
  })

  const checkout = await request('/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${buyerToken}`,
      'Idempotency-Key': `h1-payout-${suffix}`,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: shippingAddress('H1 Payout Buyer'),
    }),
  })

  const webhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `h1-payout-payment-${checkout.data.checkoutSessionId}`,
      checkoutSessionId: checkout.data.checkoutSessionId,
      eventType: 'PAYMENT_SUCCEEDED',
    }),
  })
  assert(webhook.data.orderIds.length === 1, 'payout fixture should create one order')
  const orderId = webhook.data.orderIds[0]

  await request(`/vendor/orders/${orderId}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({}),
  })
  await request(`/vendor/orders/${orderId}/ship`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({}),
  })
  await request(`/buyer/orders/${orderId}/confirm-receipt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({}),
  })

  return orderId
}

async function main() {
  const suffix = runtimeSuffix()
  const { buyer, vendorUser, vendor, product } = await setupFixtures(suffix)
  const buyerToken = await login(buyer.email)
  const vendorToken = await login(vendorUser.email)

  const orderId = await createReleasableOrder({
    buyerToken,
    vendorToken,
    productId: product.id,
    suffix,
  })
  const releasableFund = await prisma.orderFund.findUnique({ where: { orderId } })
  assert(releasableFund?.status === 'RELEASABLE', `expected RELEASABLE fund before payout, got ${releasableFund?.status}`)
  record('H1-PAYOUT-PROVIDER-01', 'runtime order reaches RELEASABLE fund state before payout execution')

  const drain = drainPayouts(vendor.id)
  assert(drain.ok === true, 'payout drain should return ok')
  assert(drain.paidOut === 1, `expected one paid-out fund, got ${drain.paidOut}`)
  assert(drain.providerName === 'dev_mock', `expected dev_mock payout provider, got ${drain.providerName}`)

  const payoutExecution = await prisma.payoutProviderExecution.findUnique({
    where: { orderFundId: releasableFund.id },
  })
  assert(payoutExecution?.providerName === 'dev_mock', `expected dev_mock payout execution, got ${payoutExecution?.providerName}`)
  assert(payoutExecution?.status === 'SUCCEEDED', `expected payout SUCCEEDED, got ${payoutExecution?.status}`)
  assert(payoutExecution?.providerPayoutId?.startsWith('dev_mock_payout_'), 'payout should store provider payout id')
  const paidFund = await prisma.orderFund.findUnique({ where: { id: releasableFund.id } })
  assert(paidFund?.status === 'PAID_OUT', `expected PAID_OUT fund, got ${paidFund?.status}`)
  const paidLedger = await prisma.vendorBalanceLedger.findFirst({
    where: {
      referenceType: 'payout_provider_execution',
      referenceId: payoutExecution.id,
      entryType: 'PAID_OUT',
    },
  })
  assert(Boolean(paidLedger), 'payout should create PAID_OUT vendor ledger entry')
  record('H1-PAYOUT-PROVIDER-02', 'dev_mock payout execution marks fund PAID_OUT and stores provider payout evidence')

  const replay = drainPayouts(vendor.id)
  assert(replay.paidOut === 0, `expected replay to pay out zero funds, got ${replay.paidOut}`)
  const payoutCount = await prisma.payoutProviderExecution.count({
    where: { orderFundId: releasableFund.id },
  })
  assert(payoutCount === 1, `expected one payout execution after replay, got ${payoutCount}`)
  record('H1-PAYOUT-PROVIDER-03', 'payout drain replay does not duplicate provider payout execution')

  const balance = await request('/vendor/balance', { headers: { Authorization: `Bearer ${vendorToken}` } })
  assert(balance.data.totals.paidOutMinor >= releasableFund.amountMinor, 'vendor balance should expose paid-out total')
  record('H1-PAYOUT-PROVIDER-04', 'vendor balance exposes paid-out payout state separately from releasable funds')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    orderId,
    orderFundId: releasableFund.id,
    payoutProviderExecutionId: payoutExecution.id,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
