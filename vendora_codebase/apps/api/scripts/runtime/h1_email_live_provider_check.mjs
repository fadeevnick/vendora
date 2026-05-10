import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  assert,
  disconnect,
  evidence,
  prisma,
  record,
  runtimeSuffix,
} from './runtime_helpers.mjs'

const execFileAsync = promisify(execFile)

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for live email provider proof`)
  return value
}

function assertLiveProviderBaseUrl() {
  const baseUrl = process.env.RESEND_API_BASE_URL || 'https://api.resend.com'
  const parsed = new URL(baseUrl)
  const blockedHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])
  assert(!blockedHosts.has(parsed.hostname), `RESEND_API_BASE_URL must not point to local mock host: ${parsed.hostname}`)
  assert(parsed.protocol === 'https:', `RESEND_API_BASE_URL must use https for live proof, got ${parsed.protocol}`)
  return baseUrl.replace(/\/$/, '')
}

async function drain(referenceId) {
  const { stdout } = await execFileAsync('npm', [
    'run',
    'notifications:drain',
    '--',
    '--limit=10',
    '--max-attempts=1',
    '--event-type=H1_EMAIL_LIVE_PROVIDER_TEST',
    `--reference-id=${referenceId}`,
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: requiredEnv('RESEND_API_KEY'),
      EMAIL_FROM: requiredEnv('EMAIL_FROM'),
      RESEND_API_BASE_URL: assertLiveProviderBaseUrl(),
    },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })
  const jsonStart = stdout.indexOf('{')
  assert(jsonStart >= 0, `drain output did not include JSON: ${stdout}`)
  return JSON.parse(stdout.slice(jsonStart))
}

async function main() {
  const recipientEmail = requiredEnv('EMAIL_LIVE_TEST_RECIPIENT')
  const suffix = runtimeSuffix()
  const referenceId = `${suffix}-live`

  const notification = await prisma.notificationOutbox.create({
    data: {
      eventType: 'H1_EMAIL_LIVE_PROVIDER_TEST',
      recipientEmail,
      subject: 'Vendora live email provider runtime proof',
      templateKey: 'runtime.h1_email_live_provider',
      payload: {
        referenceId,
        proof: 'live_external_email_provider',
        createdAt: new Date().toISOString(),
      },
      referenceType: 'runtime_check',
      referenceId,
      status: 'PENDING',
    },
  })

  const summary = await drain(referenceId)
  assert(summary.ok === true, 'live provider drain should return ok')
  assert(summary.providerName === 'resend', `expected resend provider, got ${summary.providerName}`)
  assert(summary.selected === 1, `expected one selected live notification, got ${summary.selected}`)
  assert(summary.sent === 1, `expected one sent live notification, got ${summary.sent}`)
  assert(summary.failed === 0, `expected zero failed live notifications, got ${summary.failed}`)

  const sent = await prisma.notificationOutbox.findUnique({ where: { id: notification.id } })
  assert(sent?.status === 'SENT', `expected live notification SENT, got ${sent?.status}`)
  assert(sent?.providerName === 'resend', `expected live provider resend, got ${sent?.providerName}`)
  assert(typeof sent?.providerMessageId === 'string' && sent.providerMessageId.length > 0, 'live provider message id should be stored')
  assert(!sent.providerMessageId.startsWith('dev_'), 'live provider message id must not be a dev provider id')
  assert(sent.sentAt, 'live sent notification should store sentAt')

  record('H1-EMAIL-LIVE-PROVIDER-01', 'live Resend provider accepted a transactional email request')
  record('H1-EMAIL-LIVE-PROVIDER-02', 'notification outbox stored live provider name, message id and sent timestamp')
  record('H1-EMAIL-LIVE-PROVIDER-03', 'live proof used https provider endpoint and rejected local mock endpoints')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    notificationId: sent.id,
    providerName: sent.providerName,
    providerMessageId: sent.providerMessageId,
    recipientEmail: sent.recipientEmail,
    sentAt: sent.sentAt,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
