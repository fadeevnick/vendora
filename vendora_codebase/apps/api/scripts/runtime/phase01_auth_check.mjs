import {
  PASSWORD,
  assert,
  disconnect,
  ensureProductFixture,
  ensureVendorFixture,
  evidence,
  expectHttpError,
  login,
  prisma,
  record,
  request,
  routeInn,
  runtimeSuffix,
  upsertVerifiedUser,
} from './runtime_helpers.mjs'

async function register(accountType, email) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ accountType, email, password: PASSWORD }),
  })
}

async function verify(token) {
  return request('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}

async function setupScopedOrders(suffix) {
  const buyer = await upsertVerifiedUser(`phase01-scope-buyer-${suffix}@vendora.local`, 'BUYER')
  const otherBuyer = await upsertVerifiedUser(`phase01-scope-other-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`phase01-scope-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const otherVendorUser = await upsertVerifiedUser(`phase01-scope-other-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `PHASE01SCOPEA${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `Phase 01 Scope Vendor A ${suffix}`,
  })
  const otherVendor = await ensureVendorFixture({
    user: otherVendorUser,
    inn: `PHASE01SCOPEB${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `Phase 01 Scope Vendor B ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `phase01-scope-product-${suffix}`,
    vendorId: vendor.id,
    name: `Phase 01 Scope Product ${suffix}`,
  })

  const order = await prisma.order.create({
    data: {
      buyerId: buyer.id,
      vendorId: vendor.id,
      total: 10,
      buyerEmailSnapshot: buyer.email,
      items: {
        create: {
          productId: product.id,
          qty: 1,
          price: 10,
          listingTitleSnapshot: product.name,
          unitPriceMinor: 1000,
          lineTotalMinor: 1000,
        },
      },
    },
  })

  return { buyer, otherBuyer, vendorUser, otherVendorUser, otherVendor, order }
}

async function main() {
  const suffix = runtimeSuffix()

  const buyerEmail = `phase01-buyer-${suffix}@vendora.local`
  const buyerRegistration = await register('BUYER', buyerEmail)
  assert(buyerRegistration.data.emailVerificationRequired === true, 'buyer registration should require email verification')
  assert(Boolean(buyerRegistration.data.devVerificationToken), 'dev verification token should be present outside production')
  await expectHttpError('/auth/login', null, 403, 'EMAIL_NOT_VERIFIED', {
    method: 'POST',
    body: JSON.stringify({ email: buyerEmail, password: PASSWORD }),
  })
  record('R1-AUTH-01', 'buyer registration requires email verification before full login')

  const vendorEmail = `phase01-vendor-${suffix}@vendora.local`
  const vendorRegistration = await register('VENDOR_OWNER', vendorEmail)
  const verifiedVendor = await verify(vendorRegistration.data.devVerificationToken)
  assert(verifiedVendor.data.verified === true, 'vendor email verification should succeed')
  const vendorToken = verifiedVendor.data.token
  const createdVendor = await request('/vendors', {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({ name: `Phase 01 Vendor ${suffix}`, inn: routeInn('P01', suffix) }),
  })
  const vendorMe = await request('/vendors/me', { headers: { Authorization: `Bearer ${createdVendor.token}` } })
  assert(vendorMe.id === createdVendor.vendor.id, 'vendor owner should read own vendor workspace')
  record('R1-AUTH-02', 'verified vendor owner can create and read vendor workspace')

  const buyerVerification = await verify(buyerRegistration.data.devVerificationToken)
  assert(buyerVerification.data.session.user.email === buyerEmail, 'email verification should return authenticated session')
  assert(buyerVerification.data.session.user.emailVerified === true, 'verified session should expose emailVerified=true')
  record('R1-AUTH-03', 'email verification returns a full authenticated session')

  const lockEmail = `phase01-lock-${suffix}@vendora.local`
  await register('BUYER', lockEmail)
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await expectHttpError('/auth/login', null, 401, 'INVALID_CREDENTIALS', {
      method: 'POST',
      body: JSON.stringify({ email: lockEmail, password: 'wrong-password' }),
    })
  }
  await expectHttpError('/auth/login', null, 423, 'AUTH_LOCKED', {
    method: 'POST',
    body: JSON.stringify({ email: lockEmail, password: 'wrong-password' }),
  })
  await expectHttpError('/auth/login', null, 423, 'AUTH_LOCKED', {
    method: 'POST',
    body: JSON.stringify({ email: lockEmail, password: PASSWORD }),
  })
  record('R1-AUTH-04', 'five failed login attempts lock the account and reject a later correct password')

  await upsertVerifiedUser('admin@vendora.com', 'BUYER', { isPlatformAdmin: true })
  const adminToken = await login('admin@vendora.com', true)
  const adminSession = await request('/auth/session', { headers: { Authorization: `Bearer ${adminToken}` } })
  assert(adminSession.data.user.isPlatformAdmin === true, 'admin session should expose platform admin signal')
  record('R1-AUTH-05', 'platform admin signs in through separate admin login path')

  const { buyer, otherBuyer, vendorUser, otherVendorUser, otherVendor, order } = await setupScopedOrders(suffix)
  const buyerToken = await login(buyer.email)
  const otherBuyerToken = await login(otherBuyer.email)
  const buyerOrders = await request('/buyer/orders', { headers: { Authorization: `Bearer ${buyerToken}` } })
  const otherBuyerOrders = await request('/buyer/orders', { headers: { Authorization: `Bearer ${otherBuyerToken}` } })
  assert(buyerOrders.data.some((item) => item.id === order.id), 'buyer should see own order')
  assert(!otherBuyerOrders.data.some((item) => item.id === order.id), 'other buyer should not see scoped order')
  record('R1-AUTH-06', 'buyer order read is self-scoped')

  const vendorTokenScoped = await login(vendorUser.email)
  const otherVendorToken = await login(otherVendorUser.email)
  const vendorOrders = await request('/vendor/orders', { headers: { Authorization: `Bearer ${vendorTokenScoped}` } })
  const otherVendorOrders = await request('/vendor/orders', { headers: { Authorization: `Bearer ${otherVendorToken}` } })
  assert(vendorOrders.data.some((item) => item.id === order.id), 'vendor should see own order')
  assert(!otherVendorOrders.data.some((item) => item.id === order.id), 'other vendor should not see scoped order')
  assert(otherVendor.id !== order.vendorId, 'scoped fixture should use two different vendors')
  record('R1-AUTH-07', 'vendor order read is tenant-scoped')

  await expectHttpError('/admin/disputes/not-a-real-dispute/resolve', buyerToken, 403, 'FORBIDDEN', {
    method: 'POST',
    body: JSON.stringify({ resolutionType: 'VENDOR_FAVOR_RELEASE' }),
  })
  await expectHttpError('/admin/disputes/not-a-real-dispute/resolve', vendorTokenScoped, 403, 'FORBIDDEN', {
    method: 'POST',
    body: JSON.stringify({ resolutionType: 'VENDOR_FAVOR_RELEASE' }),
  })
  record('R1-AUTH-08', 'buyer and vendor are denied on admin dispute resolve endpoint')

  console.log(JSON.stringify({ ok: true, evidence }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
