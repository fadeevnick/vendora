import type { NotificationOutbox } from '@prisma/client'

export interface EmailDeliveryResult {
  providerName: string
  providerMessageId: string
}

export interface EmailProvider {
  name: string
  send(notification: NotificationOutbox): Promise<EmailDeliveryResult>
}

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for EMAIL_PROVIDER=resend`)
  return value
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderText(notification: NotificationOutbox) {
  return [
    notification.subject,
    '',
    `Template: ${notification.templateKey}`,
    '',
    JSON.stringify(notification.payload, null, 2),
  ].join('\n')
}

function renderHtml(notification: NotificationOutbox) {
  return [
    `<h1>${escapeHtml(notification.subject)}</h1>`,
    `<p><strong>Template:</strong> ${escapeHtml(notification.templateKey)}</p>`,
    `<pre>${escapeHtml(JSON.stringify(notification.payload, null, 2))}</pre>`,
  ].join('')
}

class DevLogEmailProvider implements EmailProvider {
  name = 'dev_log'
  private failingRecipients: Set<string>

  constructor() {
    this.failingRecipients = new Set(
      (process.env['DEV_EMAIL_FAIL_RECIPIENTS'] ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    )
  }

  async send(notification: NotificationOutbox): Promise<EmailDeliveryResult> {
    if (this.failingRecipients.has(notification.recipientEmail.toLowerCase())) {
      throw new Error(`Dev email provider forced failure for ${notification.recipientEmail}`)
    }

    return {
      providerName: this.name,
      providerMessageId: `dev_${notification.id}_${notification.attempts + 1}`,
    }
  }
}

class ResendEmailProvider implements EmailProvider {
  name = 'resend'
  private apiKey = requiredEnv('RESEND_API_KEY')
  private from = requiredEnv('EMAIL_FROM')
  private baseUrl = (process.env['RESEND_API_BASE_URL'] ?? 'https://api.resend.com').replace(/\/$/, '')

  async send(notification: NotificationOutbox): Promise<EmailDeliveryResult> {
    const response = await fetch(`${this.baseUrl}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [notification.recipientEmail],
        subject: notification.subject,
        text: renderText(notification),
        html: renderHtml(notification),
      }),
    })

    const payload = await response.json().catch(() => ({})) as { id?: unknown; message?: unknown; error?: unknown }

    if (!response.ok) {
      const detail = typeof payload.message === 'string'
        ? payload.message
        : typeof payload.error === 'string'
          ? payload.error
          : `HTTP ${response.status}`
      throw new Error(`Resend email delivery failed: ${detail}`)
    }

    if (typeof payload.id !== 'string' || !payload.id) {
      throw new Error('Resend email delivery failed: missing response id')
    }

    return {
      providerName: this.name,
      providerMessageId: payload.id,
    }
  }
}

export function createEmailProvider(): EmailProvider {
  const provider = process.env['EMAIL_PROVIDER'] ?? 'dev_log'

  if (provider === 'dev_log') return new DevLogEmailProvider()
  if (provider === 'resend') return new ResendEmailProvider()

  throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`)
}
