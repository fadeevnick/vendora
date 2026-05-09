import {
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

async function main() {
  const suffix = runtimeSuffix()
  const buyer = await upsertVerifiedUser(`h3-catalog-mod-buyer-${suffix}@vendora.local`, 'BUYER')
  const vendorUser = await upsertVerifiedUser(`h3-catalog-mod-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: routeInn('HMOD', suffix),
    name: `H3 Catalog Moderation Vendor ${suffix}`,
  })
  const product = await ensureProductFixture({
    id: `h3-catalog-mod-product-${suffix}`,
    vendorId: vendor.id,
    name: `H3 Catalog Moderation Lens ${suffix}`,
    description: 'Dedicated catalog moderation fixture',
    category: `h3-catalog-mod-${suffix}`,
    price: 123,
    stock: 3,
    published: true,
  })

  const buyerToken = await login(buyer.email)
  const adminToken = await login('admin@vendora.com', true)

  const visibleBefore = await request(`/catalog/products/${product.id}`)
  assert(visibleBefore.data.id === product.id, 'published approved product should be visible before moderation')

  await expectHttpError(`/admin/catalog/listings/${product.id}/moderate`, buyerToken, 403, 'FORBIDDEN', {
    method: 'POST',
    body: JSON.stringify({ action: 'SUSPEND', reason: 'buyer should not moderate' }),
  })
  record('H3-CATALOG-MOD-01', 'catalog moderation endpoints are admin-only')

  const queue = await request('/admin/catalog/listings', {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert(queue.data.some((item) => item.id === product.id), 'admin catalog listings should include moderation fixture')
  record('H3-CATALOG-MOD-02', 'admin catalog listing queue exposes moderation state')

  const suspended = await request(`/admin/catalog/listings/${product.id}/moderate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ action: 'SUSPEND', reason: 'runtime moderation suspend' }),
  })
  assert(suspended.data.moderationStatus === 'SUSPENDED', `expected SUSPENDED, got ${suspended.data.moderationStatus}`)
  await expectHttpError(`/catalog/products/${product.id}`, undefined, 404, 'RESOURCE_NOT_FOUND')
  const publicAfterSuspend = await request(`/catalog/products?category=${encodeURIComponent(product.category)}`)
  assert(!publicAfterSuspend.data.some((item) => item.id === product.id), 'suspended product should be hidden from public catalog')
  record('H3-CATALOG-MOD-03', 'admin suspend hides listing from public catalog and detail')

  const suspendAudit = await prisma.auditEvent.findFirst({
    where: {
      action: 'CATALOG_LISTING_SUSPENDED',
      resourceType: 'product',
      resourceId: product.id,
    },
  })
  assert(suspendAudit?.metadata?.to === 'SUSPENDED', 'suspend should write moderation audit evidence')
  record('H3-CATALOG-MOD-04', 'catalog suspend writes durable audit evidence')

  const approved = await request(`/admin/catalog/listings/${product.id}/moderate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ action: 'APPROVE', reason: 'runtime moderation approve' }),
  })
  assert(approved.data.moderationStatus === 'APPROVED', `expected APPROVED, got ${approved.data.moderationStatus}`)
  const visibleAfterApprove = await request(`/catalog/products/${product.id}`)
  assert(visibleAfterApprove.data.id === product.id, 'approved product should be visible again')
  const approveAudit = await prisma.auditEvent.findFirst({
    where: {
      action: 'CATALOG_LISTING_APPROVED',
      resourceType: 'product',
      resourceId: product.id,
    },
  })
  assert(approveAudit?.metadata?.to === 'APPROVED', 'approve should write moderation audit evidence')
  record('H3-CATALOG-MOD-05', 'admin approve restores listing visibility and writes audit evidence')

  console.log(JSON.stringify({ ok: true, evidence, productId: product.id }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
