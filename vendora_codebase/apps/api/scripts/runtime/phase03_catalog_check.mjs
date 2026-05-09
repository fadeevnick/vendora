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
  runtimeSuffix,
  upsertVerifiedUser,
} from './runtime_helpers.mjs'

async function main() {
  const suffix = runtimeSuffix()
  const mediaBytes = Buffer.from(`phase03-media-${suffix}`)
  const mediaBase64 = mediaBytes.toString('base64')
  const vendorUser = await upsertVerifiedUser(`phase03-vendor-${suffix}@vendora.local`, 'VENDOR_OWNER')
  const vendor = await ensureVendorFixture({
    user: vendorUser,
    inn: `PHASE03APPROVED${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `Phase 03 Approved Vendor ${suffix}`,
  })
  const vendorToken = await login(vendorUser.email)

  const draft = await request('/vendor/listings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({
      title: `Phase 03 Runtime Draft ${suffix}`,
      description: 'Runtime catalog draft listing',
      category: 'runtime-catalog',
      priceMinor: 123400,
      currency: 'RUB',
      stockQty: 7,
      media: [{
        fileName: `phase03-media-${suffix}.png`,
        contentType: 'image/png',
        sizeBytes: mediaBytes.byteLength,
        contentBase64: mediaBase64,
        altText: `Phase 03 Runtime Draft ${suffix}`,
      }],
    }),
  })
  assert(draft.data.media.length === 1, 'draft listing should return product media metadata')
  const vendorListings = await request('/vendor/listings', { headers: { Authorization: `Bearer ${vendorToken}` } })
  assert(vendorListings.data.some((listing) => listing.id === draft.data.id), 'draft listing should appear in vendor listing list')
  const publicDraft = await request('/catalog/products?q=Phase%2003%20Runtime%20Draft')
  assert(!publicDraft.data.some((listing) => listing.id === draft.data.id), 'draft listing should not appear in public catalog')
  record('R1-CAT-01', 'approved vendor creates draft listing; draft is vendor-visible and public-hidden')

  const patched = await request(`/vendor/listings/${draft.data.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({ title: `Phase 03 Runtime Patched ${suffix}`, stockQty: 9 }),
  })
  assert(patched.data.title === `Phase 03 Runtime Patched ${suffix}`, 'patched listing title should be returned')
  assert(patched.data.stockQty === 9, 'patched listing stock should be returned')
  record('R1-CAT-02', 'approved vendor patches draft listing')

  const published = await request(`/vendor/listings/${draft.data.id}/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({}),
  })
  assert(published.data.status === 'PUBLISHED', 'publish should move listing to PUBLISHED')
  const publicSearch = await request(`/catalog/products?q=${encodeURIComponent('Runtime Patched')}&category=runtime-catalog&inStock=true`)
  assert(publicSearch.data.some((listing) => listing.id === draft.data.id), 'published listing should be discoverable by public filters')
  const publicDetail = await request(`/catalog/products/${draft.data.id}`)
  assert(publicDetail.data.availability.inStock === true, 'public detail should expose in-stock availability')
  assert(publicDetail.data.media.length === 1, 'public detail should expose product media')
  assert(publicDetail.data.media[0].assetUrl === `data:image/png;base64,${mediaBase64}`, 'public detail should expose local inline media URL')
  record('R1-CAT-03', 'published listing is discoverable through public query/category/in-stock filters')
  record('R1-CAT-08', 'listing media metadata is stored and exposed on vendor/public catalog views')

  const outOfStock = await request('/vendor/listings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({
      title: `Phase 03 Out Of Stock ${suffix}`,
      description: 'Runtime out of stock listing',
      category: 'runtime-catalog',
      priceMinor: 222200,
      currency: 'RUB',
      stockQty: 0,
    }),
  })
  await request(`/vendor/listings/${outOfStock.data.id}/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({}),
  })
  const outOfStockDetail = await request(`/catalog/products/${outOfStock.data.id}`)
  assert(outOfStockDetail.data.availability.inStock === false, 'out-of-stock detail should expose inStock=false')
  const inStockOnly = await request(`/catalog/products?q=${encodeURIComponent('Out Of Stock')}&category=runtime-catalog&inStock=true`)
  assert(!inStockOnly.data.some((listing) => listing.id === outOfStock.data.id), 'inStock filter should exclude out-of-stock listing')
  record('R1-CAT-04', 'out-of-stock published listing is readable but excluded by inStock=true')

  const unpublished = await request(`/vendor/listings/${draft.data.id}/unpublish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({ reason: 'runtime_check' }),
  })
  assert(unpublished.data.status === 'DRAFT', 'unpublish should remove published state')
  await expectHttpError(`/catalog/products/${draft.data.id}`, null, 404, 'RESOURCE_NOT_FOUND')
  record('R1-CAT-05', 'vendor unpublish removes listing from public discovery')

  const unapprovedUser = await upsertVerifiedUser(`phase03-unapproved-${suffix}@vendora.local`, 'VENDOR_OWNER')
  await ensureVendorFixture({
    user: unapprovedUser,
    inn: `PHASE03UNAPPROVED${suffix}`.replace(/[^A-Z0-9]/g, '').slice(0, 32),
    name: `Phase 03 Unapproved Vendor ${suffix}`,
    status: 'ONBOARDING',
  })
  const unapprovedToken = await login(unapprovedUser.email)
  await expectHttpError('/vendor/listings', unapprovedToken, 403, 'FORBIDDEN', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Denied Listing',
      description: 'Denied unapproved listing',
      category: 'runtime-catalog',
      priceMinor: 1000,
      currency: 'RUB',
      stockQty: 1,
    }),
  })
  record('R1-CAT-06', 'unapproved vendor is denied listing creation')

  const blockedProduct = await ensureProductFixture({
    id: `phase03-blocked-product-${suffix}`,
    vendorId: vendor.id,
    name: `Phase 03 Blocked Product ${suffix}`,
    category: 'runtime-catalog',
    price: 33,
    stock: 4,
    published: true,
  })
  await prisma.vendor.update({ where: { id: vendor.id }, data: { status: 'BLOCKED' } })
  await expectHttpError(`/catalog/products/${blockedProduct.id}`, null, 404, 'RESOURCE_NOT_FOUND')
  const blockedSearch = await request(`/catalog/products?q=${encodeURIComponent('Blocked Product')}&category=runtime-catalog`)
  assert(!blockedSearch.data.some((listing) => listing.id === blockedProduct.id), 'blocked vendor listing should not appear in public search')
  await prisma.vendor.update({ where: { id: vendor.id }, data: { status: 'APPROVED' } })
  record('R1-CAT-07', 'blocked vendor listings disappear from public search/detail')

  console.log(JSON.stringify({ ok: true, evidence }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
