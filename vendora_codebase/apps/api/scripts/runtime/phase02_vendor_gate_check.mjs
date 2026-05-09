import {
  PASSWORD,
  assert,
  disconnect,
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

async function registerAndVerifyVendor(email) {
  const registration = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ accountType: 'VENDOR_OWNER', email, password: PASSWORD }),
  })
  const verification = await request('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token: registration.data.devVerificationToken }),
  })
  return verification.data.token
}

async function submitApplication(token, suffix, label) {
  const createdVendor = await request('/vendors', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `${label} Vendor ${suffix}`, inn: routeInn(label, suffix) }),
  })
  const vendorToken = createdVendor.token
  const initial = await request('/vendor/application', { headers: { Authorization: `Bearer ${vendorToken}` } })
  const updated = await request('/vendor/application', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({
      businessName: `${label} Runtime Business`,
      legalEntityName: `${label} Runtime LLC`,
      taxId: `${label}TAX${suffix}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 32),
      country: 'RU',
      address: { line1: '2 Runtime Gate', city: 'Moscow', postalCode: '101002' },
      salesCategory: 'electronics',
    }),
  })
  const presign = await request('/vendor/application/documents/presign', {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({
      documentType: 'company_registration',
      fileName: `${label.toLowerCase()}-registration.pdf`,
      contentType: 'application/pdf',
      sizeBytes: 2048,
    }),
  })
  const completedDocument = await request(`/vendor/application/documents/${presign.data.documentId}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({}),
  })
  const vendorView = await request('/vendor/application', { headers: { Authorization: `Bearer ${vendorToken}` } })
  const submitted = await request('/vendor/application/submit', {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({}),
  })

  return {
    vendorToken,
    vendorId: createdVendor.vendor.id,
    applicationId: submitted.data.id,
    initial: initial.data,
    updated: updated.data,
    presign: presign.data,
    completedDocument: completedDocument.data,
    vendorView: vendorView.data,
    submitted: submitted.data,
  }
}

async function main() {
  const suffix = runtimeSuffix()
  await upsertVerifiedUser('admin@vendora.com', 'BUYER', { isPlatformAdmin: true })
  const buyer = await upsertVerifiedUser(`phase02-buyer-${suffix}@vendora.local`, 'BUYER')
  const buyerToken = await login(buyer.email)
  const adminToken = await login('admin@vendora.com', true)

  const vendorToken = await registerAndVerifyVendor(`phase02-vendor-${suffix}@vendora.local`)
  const primary = await submitApplication(vendorToken, suffix, 'P02A')
  assert(primary.initial.status === 'DRAFT', 'initial vendor application should be DRAFT')
  assert(primary.updated.businessProfile.legalEntityName === 'P02A Runtime LLC', 'business profile should update')
  record('R1-KYC-01', 'vendor owner creates workspace, receives DRAFT application and saves business profile')

  assert(primary.presign.uploadUrl.includes('/dev-storage/'), 'presign should return dev upload URL')
  assert(primary.completedDocument.status === 'UPLOADED', 'document should complete to UPLOADED')
  assert(!JSON.stringify(primary.vendorView).includes('storageKey'), 'vendor application response should not expose storageKey')
  record('R1-KYC-02', 'KYC document metadata is protected and vendor view omits storageKey')

  assert(primary.submitted.status === 'PENDING_REVIEW', 'application should submit into PENDING_REVIEW')
  record('R1-KYC-03', 'DRAFT application submits after profile and uploaded document exist')

  await expectHttpError('/admin/kyc/applications', buyerToken, 403, 'FORBIDDEN')
  await expectHttpError(`/admin/kyc/applications/${primary.applicationId}`, primary.vendorToken, 403, 'FORBIDDEN')
  const adminDetail = await request(`/admin/kyc/applications/${primary.applicationId}`, { headers: { Authorization: `Bearer ${adminToken}` } })
  assert(adminDetail.data.documents.some((document) => document.storageKey), 'admin detail should include protected document metadata')
  record('R1-KYC-04', 'admin KYC queue/detail is admin-only and includes protected document metadata')

  const approved = await request(`/admin/kyc/applications/${primary.applicationId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ note: 'runtime approve' }),
  })
  assert(approved.data.status === 'APPROVED', 'application should be approved')
  const approvedVendor = await prisma.vendor.findUnique({ where: { id: primary.vendorId } })
  assert(approvedVendor?.status === 'APPROVED', 'vendor should become APPROVED')
  const product = await request('/products', {
    method: 'POST',
    headers: { Authorization: `Bearer ${primary.vendorToken}` },
    body: JSON.stringify({ name: `Phase 02 Approved Product ${suffix}`, description: 'approved product', category: 'electronics', price: 19.5, stock: 5 }),
  })
  const published = await request(`/products/${product.id}/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${primary.vendorToken}` },
    body: JSON.stringify({}),
  })
  assert(published.published === true, 'approved vendor should publish product')
  record('R1-KYC-05', 'admin approval moves vendor/application to APPROVED and unlocks selling')

  const rejectedVendorToken = await registerAndVerifyVendor(`phase02-rejected-${suffix}@vendora.local`)
  const rejected = await submitApplication(rejectedVendorToken, suffix, 'P02B')
  const rejectedReview = await request(`/admin/kyc/applications/${rejected.applicationId}/reject`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ note: 'runtime reject', reasonCode: 'RUNTIME_CHECK' }),
  })
  assert(rejectedReview.data.status === 'REJECTED', 'application should be rejected')
  await expectHttpError('/products', rejected.vendorToken, 403, 'FORBIDDEN', {
    method: 'POST',
    body: JSON.stringify({ name: 'Rejected Product', description: 'denied', category: 'electronics', price: 20, stock: 2 }),
  })
  record('R1-KYC-06', 'admin rejection moves vendor/application to REJECTED and keeps seller outside product creation')

  const pendingVendorToken = await registerAndVerifyVendor(`phase02-pending-${suffix}@vendora.local`)
  const pendingVendor = await request('/vendors', {
    method: 'POST',
    headers: { Authorization: `Bearer ${pendingVendorToken}` },
    body: JSON.stringify({ name: `Phase 02 Pending Vendor ${suffix}`, inn: routeInn('P02P', suffix) }),
  })
  await expectHttpError('/products', pendingVendor.token, 403, 'FORBIDDEN', {
    method: 'POST',
    body: JSON.stringify({ name: 'Pending Product', description: 'denied', category: 'electronics', price: 20, stock: 2 }),
  })
  const forcedProduct = await prisma.product.create({
    data: {
      vendorId: rejected.vendorId,
      name: `Phase 02 Rejected Forced Product ${suffix}`,
      description: 'forced rejected vendor listing',
      category: 'electronics',
      price: 20,
      currency: 'RUB',
      stock: 2,
      published: true,
      publishedAt: new Date(),
    },
  })
  await expectHttpError(`/catalog/products/${forcedProduct.id}`, null, 404, 'RESOURCE_NOT_FOUND')
  record('R1-KYC-07', 'unapproved/rejected vendors cannot sell and public reads filter non-approved vendors')

  const auditCount = await prisma.auditEvent.count({
    where: {
      resourceId: { in: [primary.applicationId, rejected.applicationId] },
      action: {
        in: [
          'KYC_APPLICATION_READ',
          'KYC_APPLICATION_UPDATED',
          'KYC_APPLICATION_SUBMITTED',
          'KYC_APPLICATION_APPROVED',
          'KYC_APPLICATION_REJECTED',
        ],
      },
    },
  })
  assert(auditCount >= 5, `expected at least 5 KYC audit events, got ${auditCount}`)
  record('R1-KYC-08', 'KYC read/update/submit/approve/reject audit events are persisted')

  console.log(JSON.stringify({ ok: true, evidence }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
