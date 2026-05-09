import type { Prisma } from '@prisma/client'
import { prisma } from '../../shared/db.js'
import { createEmailProvider, type EmailProvider } from './email-providers.js'

type DbClient = Prisma.TransactionClient | typeof prisma

interface EnqueueNotificationInput {
  eventType: string
  recipientUserId?: string | null
  recipientEmail: string
  subject: string
  templateKey: string
  payload: Prisma.InputJsonValue
  referenceType?: string | null
  referenceId?: string | null
}

export async function enqueueNotification(input: EnqueueNotificationInput, db: DbClient = prisma) {
  return db.notificationOutbox.create({
    data: {
      eventType: input.eventType,
      recipientUserId: input.recipientUserId ?? null,
      recipientEmail: input.recipientEmail,
      subject: input.subject,
      templateKey: input.templateKey,
      payload: input.payload,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      status: 'PENDING',
    },
  })
}

export async function enqueueForVendorOwners(input: {
  vendorId: string
  eventType: string
  subject: string
  templateKey: string
  payload: Prisma.InputJsonValue
  referenceType?: string | null
  referenceId?: string | null
}, db: DbClient = prisma) {
  const owners = await db.vendorMember.findMany({
    where: {
      vendorId: input.vendorId,
      role: { in: ['OWNER', 'ADMIN'] },
    },
    include: { user: { select: { id: true, email: true } } },
  })

  for (const owner of owners) {
    await enqueueNotification({
      eventType: input.eventType,
      recipientUserId: owner.user.id,
      recipientEmail: owner.user.email,
      subject: input.subject,
      templateKey: input.templateKey,
      payload: input.payload,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    }, db)
  }
}

export async function enqueueForPlatformAdmins(input: {
  eventType: string
  subject: string
  templateKey: string
  payload: Prisma.InputJsonValue
  referenceType?: string | null
  referenceId?: string | null
}, db: DbClient = prisma) {
  const admins = await db.user.findMany({
    where: {
      isPlatformAdmin: true,
      emailVerifiedAt: { not: null },
    },
    select: { id: true, email: true },
  })

  for (const admin of admins) {
    await enqueueNotification({
      eventType: input.eventType,
      recipientUserId: admin.id,
      recipientEmail: admin.email,
      subject: input.subject,
      templateKey: input.templateKey,
      payload: input.payload,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    }, db)
  }
}

export async function drainNotificationOutbox(input: {
  limit?: number
  maxAttempts?: number
  eventType?: string
  referenceId?: string
  provider?: EmailProvider
} = {}) {
  const limit = input.limit ?? 25
  const maxAttempts = input.maxAttempts ?? 3
  const provider = input.provider ?? createEmailProvider()

  const pending = await prisma.notificationOutbox.findMany({
    where: {
      status: 'PENDING',
      attempts: { lt: maxAttempts },
      eventType: input.eventType,
      referenceId: input.referenceId,
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  const summary = {
    providerName: provider.name,
    selected: pending.length,
    sent: 0,
    failed: 0,
    pending: 0,
    ids: [] as string[],
  }

  for (const notification of pending) {
    try {
      const result = await provider.send(notification)
      await prisma.notificationOutbox.update({
        where: { id: notification.id },
        data: {
          status: 'SENT',
          providerName: result.providerName,
          providerMessageId: result.providerMessageId,
          attempts: { increment: 1 },
          lastError: null,
          sentAt: new Date(),
        },
      })
      summary.sent += 1
    } catch (err: unknown) {
      const nextAttempts = notification.attempts + 1
      const exhausted = nextAttempts >= maxAttempts
      await prisma.notificationOutbox.update({
        where: { id: notification.id },
        data: {
          status: exhausted ? 'FAILED' : 'PENDING',
          providerName: provider.name,
          attempts: { increment: 1 },
          lastError: err instanceof Error ? err.message : 'Unknown email provider error',
        },
      })
      if (exhausted) summary.failed += 1
      else summary.pending += 1
    }
    summary.ids.push(notification.id)
  }

  return summary
}
