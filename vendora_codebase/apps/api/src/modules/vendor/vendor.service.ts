import type { Prisma } from '@prisma/client'
import { prisma } from '../../shared/db.js'
import { enqueueForPlatformAdmins, enqueueForVendorOwners } from '../notifications/notifications.service.js'
import { getPrivateObject, privateStorageProvider, putPrivateObject } from './private-storage.service.js'

type ApplicationAddress = {
  line1: string
  city: string
  postalCode: string
}

interface CreateVendorInput {
  name: string
  inn: string
  country?: string
  address?: string
  userId: string
}

export interface UpdateVendorApplicationInput {
  vendorId: string
  userId: string
  businessName: string
  legalEntityName: string
  taxId: string
  country: string
  address: ApplicationAddress
  salesCategory: string
}

export interface PresignKycDocumentInput {
  vendorId: string
  userId: string
  documentType: string
  fileName: string
  contentType: string
  sizeBytes: number
}

export interface UploadKycDocumentContentInput {
  vendorId: string
  userId: string
  documentId: string
  contentBase64: string
}

const KYC_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const KYC_ALLOWED_CONTENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])

function sanitizeDocument(document: {
  id: string
  documentType: string
  fileName: string
  contentType: string
  sizeBytes: number
  storedSizeBytes?: number | null
  contentSha256?: string | null
  storageProvider?: string | null
  status: string
  createdAt: Date
  completedAt: Date | null
  storageConfirmedAt?: Date | null
}) {
  return {
    id: document.id,
    documentType: document.documentType,
    fileName: document.fileName,
    contentType: document.contentType,
    sizeBytes: document.sizeBytes,
    storedSizeBytes: document.storedSizeBytes ?? null,
    contentSha256: document.contentSha256 ?? null,
    storageProvider: document.storageProvider ?? null,
    status: document.status,
    createdAt: document.createdAt,
    completedAt: document.completedAt,
    storageConfirmedAt: document.storageConfirmedAt ?? null,
  }
}

function toApplicationView(application: Awaited<ReturnType<typeof getVendorApplicationRecord>>) {
  return {
    id: application.id,
    vendorId: application.vendorId,
    status: application.status,
    businessProfile: {
      businessName: application.businessName,
      legalEntityName: application.legalEntityName,
      taxId: application.taxId,
      country: application.country,
      address: application.addressJson,
      salesCategory: application.salesCategory,
    },
    documents: application.documents.map(sanitizeDocument),
    reviewNote: application.reviewNote,
    rejectionReasonCode: application.rejectionReasonCode,
    submittedAt: application.submittedAt,
    reviewedAt: application.reviewedAt,
  }
}

function toAdminApplicationView(application: Awaited<ReturnType<typeof getAdminApplicationRecord>>) {
  return {
    id: application.id,
    vendorId: application.vendorId,
    vendor: {
      id: application.vendor.id,
      name: application.vendor.name,
      inn: application.vendor.inn,
      status: application.vendor.status,
    },
    status: application.status,
    businessProfile: {
      businessName: application.businessName,
      legalEntityName: application.legalEntityName,
      taxId: application.taxId,
      country: application.country,
      address: application.addressJson,
      salesCategory: application.salesCategory,
    },
    documents: application.documents,
    reviewNote: application.reviewNote,
    rejectionReasonCode: application.rejectionReasonCode,
    submittedAt: application.submittedAt,
    reviewedAt: application.reviewedAt,
  }
}

async function auditEvent(input: {
  actorUserId: string
  action: string
  resourceType: string
  resourceId: string
  metadata?: Prisma.InputJsonValue
}) {
  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata,
    },
  })
}

async function getVendorApplicationRecord(vendorId: string) {
  const existing = await prisma.vendorApplication.findUnique({
    where: { vendorId },
    include: { documents: { orderBy: { createdAt: 'desc' } } },
  })

  if (existing) return existing

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } })
  if (!vendor) throw new Error('Vendor not found')

  return prisma.vendorApplication.create({
    data: {
      vendorId,
      status: vendor.status === 'APPROVED' ? 'APPROVED' : vendor.status === 'REJECTED' ? 'REJECTED' : 'DRAFT',
      businessName: vendor.name,
      taxId: vendor.inn,
    },
    include: { documents: { orderBy: { createdAt: 'desc' } } },
  })
}

async function getAdminApplicationRecord(applicationId: string) {
  const application = await prisma.vendorApplication.findUnique({
    where: { id: applicationId },
    include: {
      vendor: true,
      documents: { orderBy: { createdAt: 'desc' } },
    },
  })

  if (!application) throw new Error('Application not found')
  return application
}

export async function createVendor(input: CreateVendorInput) {
  const existing = await prisma.vendor.findUnique({ where: { inn: input.inn } })
  if (existing) throw new Error('Vendor with this INN already exists')

  const vendor = await prisma.vendor.create({
    data: {
      name: input.name,
      inn: input.inn,
      status: 'ONBOARDING',
      members: {
        create: {
          userId: input.userId,
          role: 'OWNER',
        },
      },
      applications: {
        create: {
          status: 'DRAFT',
          businessName: input.name,
          taxId: input.inn,
        },
      },
    },
  })

  return vendor
}

export async function getVendorById(id: string) {
  return prisma.vendor.findUnique({ where: { id } })
}

export async function getVendorByUserId(userId: string) {
  const member = await prisma.vendorMember.findFirst({
    where: { userId },
    include: { vendor: true },
  })
  return member?.vendor ?? null
}

export async function getVendorApplication(vendorId: string) {
  const application = await getVendorApplicationRecord(vendorId)
  return toApplicationView(application)
}

export async function updateVendorApplication(input: UpdateVendorApplicationInput) {
  const application = await getVendorApplicationRecord(input.vendorId)
  if (application.status !== 'DRAFT') {
    throw new Error('KYC_INVALID_STATE: application can only be edited while DRAFT')
  }

  const updated = await prisma.vendorApplication.update({
    where: { id: application.id },
    data: {
      businessName: input.businessName,
      legalEntityName: input.legalEntityName,
      taxId: input.taxId,
      country: input.country,
      addressJson: input.address,
      salesCategory: input.salesCategory,
    },
    include: { documents: { orderBy: { createdAt: 'desc' } } },
  })

  await auditEvent({
    actorUserId: input.userId,
    action: 'KYC_APPLICATION_UPDATED',
    resourceType: 'VendorApplication',
    resourceId: updated.id,
  })

  return toApplicationView(updated)
}

export async function presignKycDocument(input: PresignKycDocumentInput) {
  const application = await getVendorApplicationRecord(input.vendorId)
  if (application.status !== 'DRAFT') {
    throw new Error('KYC_INVALID_STATE: documents can only be added while DRAFT')
  }

  if (!KYC_ALLOWED_CONTENT_TYPES.has(input.contentType) || input.sizeBytes > KYC_MAX_FILE_SIZE_BYTES) {
    throw new Error('VALIDATION_ERROR: unsupported KYC document')
  }

  const safeFileName = input.fileName.replace(/[^A-Za-z0-9._-]/g, '_')
  const storageKey = `kyc/${input.vendorId}/${application.id}/${Date.now()}-${safeFileName}`
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

  const document = await prisma.vendorApplicationDocument.create({
    data: {
      vendorApplicationId: application.id,
      documentType: input.documentType,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      storageKey,
      storageProvider: privateStorageProvider(),
      uploadedByUserId: input.userId,
    },
  })

  await auditEvent({
    actorUserId: input.userId,
    action: 'KYC_DOCUMENT_SLOT_CREATED',
    resourceType: 'VendorApplicationDocument',
    resourceId: document.id,
    metadata: { documentType: input.documentType },
  })

  return {
    documentId: document.id,
    uploadUrl: `http://localhost:3001/dev-storage/${storageKey}`,
    uploadApiPath: `/vendor/application/documents/${document.id}/upload`,
    expiresAt,
  }
}

export async function uploadKycDocumentContent(input: UploadKycDocumentContentInput) {
  const application = await getVendorApplicationRecord(input.vendorId)
  const document = await prisma.vendorApplicationDocument.findFirst({
    where: {
      id: input.documentId,
      vendorApplicationId: application.id,
    },
  })

  if (!document) throw new Error('RESOURCE_NOT_FOUND: document not found')
  if (application.status !== 'DRAFT' || document.status !== 'UPLOAD_PENDING') {
    throw new Error('KYC_INVALID_STATE: document content cannot be uploaded')
  }

  let content: Buffer
  try {
    content = Buffer.from(input.contentBase64, 'base64')
  } catch {
    throw new Error('VALIDATION_ERROR: invalid base64 content')
  }

  if (content.byteLength === 0) throw new Error('VALIDATION_ERROR: document content is empty')
  if (content.byteLength !== document.sizeBytes) {
    throw new Error('VALIDATION_ERROR: uploaded document size does not match declared size')
  }
  if (content.byteLength > KYC_MAX_FILE_SIZE_BYTES) {
    throw new Error('VALIDATION_ERROR: uploaded document exceeds max size')
  }

  const stored = await putPrivateObject(document.storageKey, content)
  const now = new Date()
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.vendorApplicationDocument.update({
      where: { id: document.id },
      data: {
        status: 'UPLOADED',
        completedAt: now,
        storageConfirmedAt: now,
        storageProvider: stored.provider,
        storedSizeBytes: stored.sizeBytes,
        contentSha256: stored.sha256,
      },
    })

    await tx.auditEvent.create({
      data: {
        actorUserId: input.userId,
        action: 'KYC_DOCUMENT_OBJECT_STORED',
        resourceType: 'VendorApplicationDocument',
        resourceId: document.id,
        metadata: {
          documentType: document.documentType,
          storageProvider: stored.provider,
          storedSizeBytes: stored.sizeBytes,
          contentSha256: stored.sha256,
        },
      },
    })

    return next
  })

  return sanitizeDocument(updated)
}

export async function completeKycDocument(vendorId: string, userId: string, documentId: string) {
  const application = await getVendorApplicationRecord(vendorId)
  const document = await prisma.vendorApplicationDocument.findFirst({
    where: {
      id: documentId,
      vendorApplicationId: application.id,
    },
  })

  if (!document) throw new Error('Document not found')
  if (application.status !== 'DRAFT' || document.status !== 'UPLOAD_PENDING') {
    throw new Error('KYC_INVALID_STATE: document cannot be completed')
  }

  const updated = await prisma.vendorApplicationDocument.update({
    where: { id: document.id },
    data: {
      status: 'UPLOADED',
      completedAt: new Date(),
    },
  })

  await auditEvent({
    actorUserId: userId,
    action: 'KYC_DOCUMENT_COMPLETED',
    resourceType: 'VendorApplicationDocument',
    resourceId: updated.id,
    metadata: { documentType: updated.documentType },
  })

  return sanitizeDocument(updated)
}

export async function readKycDocumentContentForAdmin(documentId: string, adminUserId: string) {
  const document = await prisma.vendorApplicationDocument.findUnique({
    where: { id: documentId },
    include: {
      application: {
        include: {
          vendor: { select: { id: true, name: true, inn: true, status: true } },
        },
      },
    },
  })

  if (!document) throw new Error('RESOURCE_NOT_FOUND: document not found')
  if (document.status !== 'UPLOADED' || !document.storageConfirmedAt || !document.contentSha256) {
    throw new Error('KYC_INVALID_STATE: document object is not available')
  }

  const object = await getPrivateObject(document.storageKey)
  if (object.sha256 !== document.contentSha256 || object.sizeBytes !== document.storedSizeBytes) {
    throw new Error('VALIDATION_ERROR: stored document integrity check failed')
  }

  await prisma.auditEvent.create({
    data: {
      actorUserId: adminUserId,
      action: 'KYC_DOCUMENT_OBJECT_READ',
      resourceType: 'VendorApplicationDocument',
      resourceId: document.id,
      metadata: {
        applicationId: document.vendorApplicationId,
        vendorId: document.application.vendorId,
        storageProvider: object.provider,
        sizeBytes: object.sizeBytes,
        contentSha256: object.sha256,
      },
    },
  })

  return {
    documentId: document.id,
    applicationId: document.vendorApplicationId,
    vendor: document.application.vendor,
    fileName: document.fileName,
    contentType: document.contentType,
    sizeBytes: object.sizeBytes,
    contentSha256: object.sha256,
    storageProvider: object.provider,
    contentBase64: object.content.toString('base64'),
  }
}

export async function submitVendorApplication(vendorId: string, userId: string) {
  const application = await getVendorApplicationRecord(vendorId)
  if (application.status !== 'DRAFT') {
    throw new Error('KYC_INVALID_STATE: only DRAFT applications can be submitted')
  }

  const hasRequiredProfile = Boolean(
    application.businessName &&
      application.legalEntityName &&
      application.taxId &&
      application.country &&
      application.addressJson &&
      application.salesCategory,
  )
  const hasUploadedDocument = application.documents.some((document) => document.status === 'UPLOADED')

  if (!hasRequiredProfile || !hasUploadedDocument) {
    throw new Error('VALIDATION_ERROR: business profile and at least one uploaded KYC document are required')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const nextApplication = await tx.vendorApplication.update({
      where: { id: application.id },
      data: {
        status: 'PENDING_REVIEW',
        submittedByUserId: userId,
        submittedAt: new Date(),
      },
      include: { documents: { orderBy: { createdAt: 'desc' } } },
    })

    await tx.vendor.update({
      where: { id: vendorId },
      data: {
        name: application.businessName ?? undefined,
        inn: application.taxId ?? undefined,
        legalEntityName: application.legalEntityName,
        country: application.country,
        addressJson: application.addressJson === null ? undefined : (application.addressJson as Prisma.InputJsonValue),
        salesCategory: application.salesCategory,
        status: 'PENDING_REVIEW',
      },
    })

    await tx.auditEvent.create({
      data: {
        actorUserId: userId,
        action: 'KYC_APPLICATION_SUBMITTED',
        resourceType: 'VendorApplication',
        resourceId: application.id,
      },
    })

    await enqueueForPlatformAdmins({
      eventType: 'KYC_APPLICATION_SUBMITTED',
      subject: 'KYC application submitted',
      templateKey: 'kyc.application_submitted.admin',
      payload: {
        applicationId: application.id,
        vendorId,
        businessName: application.businessName,
      },
      referenceType: 'vendor_application',
      referenceId: application.id,
    }, tx)

    return nextApplication
  })

  return toApplicationView(updated)
}

export async function listKycApplications(adminUserId: string) {
  const applications = await prisma.vendorApplication.findMany({
    where: { status: 'PENDING_REVIEW' },
    include: {
      vendor: true,
      documents: { orderBy: { createdAt: 'desc' } },
    },
    orderBy: { submittedAt: 'asc' },
  })

  await auditEvent({
    actorUserId: adminUserId,
    action: 'KYC_APPLICATION_QUEUE_READ',
    resourceType: 'VendorApplication',
    resourceId: 'queue',
    metadata: { count: applications.length },
  })

  return applications.map(toAdminApplicationView)
}

export async function getKycApplicationForAdmin(applicationId: string, adminUserId: string) {
  const application = await getAdminApplicationRecord(applicationId)

  await auditEvent({
    actorUserId: adminUserId,
    action: 'KYC_APPLICATION_READ',
    resourceType: 'VendorApplication',
    resourceId: application.id,
  })

  return toAdminApplicationView(application)
}

export async function approveKycApplication(applicationId: string, adminUserId: string, note?: string) {
  const application = await getAdminApplicationRecord(applicationId)
  if (application.status !== 'PENDING_REVIEW') {
    throw new Error('KYC_INVALID_STATE: only PENDING_REVIEW applications can be approved')
  }

  const now = new Date()
  const updated = await prisma.$transaction(async (tx) => {
    await tx.vendor.update({
      where: { id: application.vendorId },
      data: {
        status: 'APPROVED',
        approvedAt: now,
        reviewedAt: now,
      },
    })

    const nextApplication = await tx.vendorApplication.update({
      where: { id: application.id },
      data: {
        status: 'APPROVED',
        reviewNote: note,
        reviewedByUserId: adminUserId,
        reviewedAt: now,
      },
      include: {
        vendor: true,
        documents: { orderBy: { createdAt: 'desc' } },
      },
    })

    await tx.auditEvent.create({
      data: {
        actorUserId: adminUserId,
        action: 'KYC_APPLICATION_APPROVED',
        resourceType: 'VendorApplication',
        resourceId: application.id,
        metadata: { note },
      },
    })

    await enqueueForVendorOwners({
      vendorId: application.vendorId,
      eventType: 'KYC_APPLICATION_APPROVED',
      subject: 'Your Vendora seller account is approved',
      templateKey: 'kyc.application_approved.vendor',
      payload: {
        applicationId: application.id,
        vendorId: application.vendorId,
        note: note ?? null,
      },
      referenceType: 'vendor_application',
      referenceId: application.id,
    }, tx)

    return nextApplication
  })

  return toAdminApplicationView(updated)
}

export async function rejectKycApplication(
  applicationId: string,
  adminUserId: string,
  note?: string,
  reasonCode?: string,
) {
  const application = await getAdminApplicationRecord(applicationId)
  if (application.status !== 'PENDING_REVIEW') {
    throw new Error('KYC_INVALID_STATE: only PENDING_REVIEW applications can be rejected')
  }

  const now = new Date()
  const updated = await prisma.$transaction(async (tx) => {
    await tx.vendor.update({
      where: { id: application.vendorId },
      data: {
        status: 'REJECTED',
        reviewedAt: now,
      },
    })

    const nextApplication = await tx.vendorApplication.update({
      where: { id: application.id },
      data: {
        status: 'REJECTED',
        reviewNote: note,
        rejectionReasonCode: reasonCode,
        reviewedByUserId: adminUserId,
        reviewedAt: now,
      },
      include: {
        vendor: true,
        documents: { orderBy: { createdAt: 'desc' } },
      },
    })

    await tx.auditEvent.create({
      data: {
        actorUserId: adminUserId,
        action: 'KYC_APPLICATION_REJECTED',
        resourceType: 'VendorApplication',
        resourceId: application.id,
        metadata: { note, reasonCode },
      },
    })

    await enqueueForVendorOwners({
      vendorId: application.vendorId,
      eventType: 'KYC_APPLICATION_REJECTED',
      subject: 'Your Vendora seller account needs attention',
      templateKey: 'kyc.application_rejected.vendor',
      payload: {
        applicationId: application.id,
        vendorId: application.vendorId,
        note: note ?? null,
        reasonCode: reasonCode ?? null,
      },
      referenceType: 'vendor_application',
      referenceId: application.id,
    }, tx)

    return nextApplication
  })

  return toAdminApplicationView(updated)
}
