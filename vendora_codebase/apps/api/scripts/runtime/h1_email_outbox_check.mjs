import {
  assert,
  clearBuyerCart,
  disconnect,
  evidence,
  login,
  prisma,
  record,
  request,
  routeInn,
  runtimeSuffix,
  shippingAddress,
} from './runtime_helpers.mjs'

async function findNotification(where) {
  const notification = await prisma.notificationOutbox.findFirst({
    where,
    orderBy: { createdAt: 'desc' },
  })
  assert(notification, `missing notification outbox row for ${JSON.stringify(where)}`)
  assert(notification.status === 'PENDING', `expected PENDING notification, got ${notification.status}`)
  return notification
}

async function registerAndVerify(accountType, email) {
  const registration = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ accountType, email, password: 'password123' }),
  })

  await findNotification({
    eventType: 'AUTH_EMAIL_VERIFICATION_REQUESTED',
    recipientEmail: email,
    referenceType: 'user',
    referenceId: registration.data.userId,
  })

  const verification = await request('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token: registration.data.devVerificationToken }),
  })

  await findNotification({
    eventType: 'AUTH_EMAIL_VERIFIED',
    recipientEmail: email,
    referenceType: 'user',
    referenceId: registration.data.userId,
  })

  return {
    userId: registration.data.userId,
    token: verification.data.token,
  }
}

async function submitAndApproveVendor(adminToken, suffix) {
  const vendorEmail = `h1-email-vendor-${suffix}@vendora.local`
  const uniqueInn = routeInn('H1EM', suffix.split('-').at(-1) ?? suffix)
  const uniqueTaxId = routeInn('H1KY', suffix.split('-').at(-1) ?? suffix)
  const vendor = await registerAndVerify('VENDOR_OWNER', vendorEmail)

  await request('/vendors', {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendor.token}` },
    body: JSON.stringify({ name: `H1 Email Vendor ${suffix}`, inn: uniqueInn }),
  })
  vendor.token = await login(vendorEmail)

  const application = await request('/vendor/application', { headers: { Authorization: `Bearer ${vendor.token}` } })

  await request('/vendor/application', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${vendor.token}` },
    body: JSON.stringify({
      businessName: `H1 Email Vendor ${suffix}`,
      legalEntityName: `H1 Email Vendor ${suffix} LLC`,
      taxId: uniqueTaxId,
      country: 'RU',
      address: { line1: 'H1 Email Street 1', city: 'Moscow', postalCode: '101009' },
      salesCategory: 'electronics',
    }),
  })

  const presign = await request('/vendor/application/documents/presign', {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendor.token}` },
    body: JSON.stringify({
      documentType: 'business_registration',
      fileName: 'registration.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
    }),
  })

  await request(`/vendor/application/documents/${presign.data.documentId}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendor.token}` },
    body: JSON.stringify({}),
  })

  const submitted = await request('/vendor/application/submit', {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendor.token}` },
    body: JSON.stringify({}),
  })

  await findNotification({
    eventType: 'KYC_APPLICATION_SUBMITTED',
    referenceType: 'vendor_application',
    referenceId: application.data.id,
  })

  await request(`/admin/kyc/applications/${submitted.data.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ note: 'H1 email outbox check approval' }),
  })

  await findNotification({
    eventType: 'KYC_APPLICATION_APPROVED',
    recipientEmail: vendorEmail,
    referenceType: 'vendor_application',
    referenceId: application.data.id,
  })

  return vendor
}

async function createShippedOrder(buyerToken, vendorToken, buyerId) {
  const product = await prisma.product.findFirst({
    where: { published: true, vendor: { status: 'APPROVED', inn: '7700000001' } },
    orderBy: { createdAt: 'asc' },
  })
  assert(product, 'seed product for H1 email check is missing')
  await clearBuyerCart(buyerId)

  const cart = await request('/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ listingId: product.id, quantity: 1 }),
  })

  const checkout = await request('/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${buyerToken}`,
      'Idempotency-Key': `h1-email-${Date.now()}`,
    },
    body: JSON.stringify({
      cartVersion: cart.data.version,
      shippingAddress: shippingAddress('H1 Email Buyer'),
    }),
  })

  const webhook = await request('/payments/provider/webhook', {
    method: 'POST',
    headers: { 'x-vendora-provider-secret': 'dev-payment-secret' },
    body: JSON.stringify({
      providerEventId: `h1-email-${checkout.data.checkoutSessionId}`,
      checkoutSessionId: checkout.data.checkoutSessionId,
      eventType: 'PAYMENT_SUCCEEDED',
    }),
  })

  assert(webhook.data.orderIds.length === 1, 'H1 email check expected one order')
  const orderId = webhook.data.orderIds[0]

  await findNotification({
    eventType: 'ORDER_PAYMENT_HELD_BUYER',
    referenceType: 'order',
    referenceId: orderId,
  })
  await findNotification({
    eventType: 'ORDER_PAYMENT_HELD_VENDOR',
    referenceType: 'order',
    referenceId: orderId,
  })

  await request(`/vendor/orders/${orderId}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({}),
  })
  await findNotification({
    eventType: 'ORDER_CONFIRMED_BUYER',
    referenceType: 'order',
    referenceId: orderId,
  })

  await request(`/vendor/orders/${orderId}/ship`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({}),
  })
  await findNotification({
    eventType: 'ORDER_SHIPPED_BUYER',
    referenceType: 'order',
    referenceId: orderId,
  })

  return orderId
}

async function main() {
  const suffix = runtimeSuffix()
  const adminToken = await login('admin@vendora.com', true)

  const authEmail = `h1-email-buyer-${suffix}@vendora.local`
  await registerAndVerify('BUYER', authEmail)
  record('H1-EMAIL-01', 'auth registration and verification create durable notification outbox rows')

  await submitAndApproveVendor(adminToken, suffix)
  record('H1-EMAIL-02', 'KYC submit and approval create admin/vendor notification outbox rows')

  const buyer = await prisma.user.findUnique({ where: { email: 'buyer@vendora.com' } })
  assert(buyer, 'seed buyer is missing')
  const buyerToken = await login('buyer@vendora.com')
  const vendorToken = await login('vendor@vendora.com')
  const orderId = await createShippedOrder(buyerToken, vendorToken, buyer.id)
  record('H1-EMAIL-03', 'checkout payment and order transitions create buyer/vendor notification outbox rows')

  const dispute = await request(`/buyer/orders/${orderId}/disputes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: JSON.stringify({ reason: 'H1 email outbox dispute evidence' }),
  })
  await findNotification({ eventType: 'DISPUTE_OPENED_BUYER', referenceType: 'dispute', referenceId: dispute.data.id })
  await findNotification({ eventType: 'DISPUTE_OPENED_VENDOR', referenceType: 'dispute', referenceId: dispute.data.id })
  await findNotification({ eventType: 'DISPUTE_OPENED_ADMIN', referenceType: 'dispute', referenceId: dispute.data.id })

  await request(`/vendor/disputes/${dispute.data.id}/respond`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({ message: 'H1 email outbox vendor response' }),
  })
  await findNotification({ eventType: 'DISPUTE_VENDOR_RESPONDED_BUYER', referenceType: 'dispute', referenceId: dispute.data.id })
  await findNotification({ eventType: 'DISPUTE_VENDOR_RESPONDED_ADMIN', referenceType: 'dispute', referenceId: dispute.data.id })

  await request(`/admin/disputes/${dispute.data.id}/resolve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ resolutionType: 'VENDOR_FAVOR_RELEASE' }),
  })
  await findNotification({ eventType: 'DISPUTE_RESOLVED_BUYER', referenceType: 'dispute', referenceId: dispute.data.id })
  await findNotification({ eventType: 'DISPUTE_RESOLVED_VENDOR', referenceType: 'dispute', referenceId: dispute.data.id })
  record('H1-EMAIL-04', 'dispute open/respond/resolve create buyer/vendor/admin notification outbox rows')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    orderId,
    disputeId: dispute.data.id,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
