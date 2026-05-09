import {
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
} from './runtime_helpers.mjs'

async function registerAndVerifyVendor(email) {
  const registration = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ accountType: 'VENDOR_OWNER', email, password: 'password123' }),
  })

  const verification = await request('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token: registration.data.devVerificationToken }),
  })

  return verification.data.token
}

async function main() {
  const suffix = runtimeSuffix()
  const vendorEmail = `h1-storage-vendor-${suffix}@vendora.local`
  const vendorInn = routeInn('H1ST', suffix.split('-').at(-1) ?? suffix)
  const taxId = routeInn('H1KY', suffix.split('-').at(-1) ?? suffix)

  let vendorToken = await registerAndVerifyVendor(vendorEmail)
  const createdVendor = await request('/vendors', {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({ name: `H1 Storage Vendor ${suffix}`, inn: vendorInn }),
  })
  vendorToken = createdVendor.token

  await request('/vendor/application', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({
      businessName: `H1 Storage Vendor ${suffix}`,
      legalEntityName: `H1 Storage Vendor ${suffix} LLC`,
      taxId,
      country: 'RU',
      address: { line1: 'H1 Storage Street 1', city: 'Moscow', postalCode: '101010' },
      salesCategory: 'electronics',
    }),
  })

  const content = Buffer.from('%PDF-1.4\nH1 protected KYC storage evidence\n%%EOF\n', 'utf8')
  const presign = await request('/vendor/application/documents/presign', {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({
      documentType: 'business_registration',
      fileName: 'h1-storage-registration.pdf',
      contentType: 'application/pdf',
      sizeBytes: content.byteLength,
    }),
  })
  assert(presign.data.uploadApiPath.includes(presign.data.documentId), 'presign should expose API upload path for private storage')

  const uploaded = await request(`/vendor/application/documents/${presign.data.documentId}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vendorToken}` },
    body: JSON.stringify({ contentBase64: content.toString('base64') }),
  })
  assert(uploaded.data.status === 'UPLOADED', 'uploaded KYC document should be UPLOADED')
  assert(uploaded.data.storedSizeBytes === content.byteLength, 'stored size should match uploaded bytes')
  assert(uploaded.data.storageProvider === 'local_private', 'storage provider should be local_private')
  record('H1-KYC-STORAGE-01', 'vendor uploads raw KYC document bytes into protected private storage')

  const vendorView = await request('/vendor/application', { headers: { Authorization: `Bearer ${vendorToken}` } })
  assert(!JSON.stringify(vendorView).includes('storageKey'), 'vendor application response must not expose storageKey')
  assert(!JSON.stringify(vendorView).includes('contentBase64'), 'vendor application response must not expose raw document content')
  record('H1-KYC-STORAGE-02', 'vendor KYC document view hides raw storage references and content')

  const buyerToken = await login('buyer@vendora.com')
  await expectHttpError(`/admin/kyc/documents/${presign.data.documentId}/content`, buyerToken, 403, 'FORBIDDEN')

  const adminToken = await login('admin@vendora.com', true)
  const adminRead = await request(`/admin/kyc/documents/${presign.data.documentId}/content`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  assert(adminRead.data.contentBase64 === content.toString('base64'), 'admin read should return exact stored content')
  assert(adminRead.data.contentSha256 === uploaded.data.contentSha256, 'admin read should return stored checksum')
  record('H1-KYC-STORAGE-03', 'admin-only KYC raw document read returns integrity-checked content')

  const audit = await prisma.auditEvent.findFirst({
    where: {
      action: 'KYC_DOCUMENT_OBJECT_READ',
      resourceType: 'VendorApplicationDocument',
      resourceId: presign.data.documentId,
    },
  })
  assert(audit, 'admin KYC document object read should create audit event')
  record('H1-KYC-STORAGE-04', 'admin KYC raw document read creates durable audit evidence')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    documentId: presign.data.documentId,
    contentSha256: uploaded.data.contentSha256,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
