import { execFile } from 'node:child_process'
import http from 'node:http'
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

async function drain(referenceId, baseUrl) {
  const { stdout } = await execFileAsync('npm', ['run', 'notifications:drain', '--', '--limit=10', '--max-attempts=1', '--event-type=H1_EMAIL_PROVIDER_TEST', `--reference-id=${referenceId}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 'runtime_resend_key',
      EMAIL_FROM: 'Vendora <no-reply@vendora.local>',
      RESEND_API_BASE_URL: baseUrl,
    },
    encoding: 'utf8',
  })
  const jsonStart = stdout.indexOf('{')
  assert(jsonStart >= 0, `drain output did not include JSON: ${stdout}`)
  return JSON.parse(stdout.slice(jsonStart))
}

async function withMockResend(handler, fn) {
  const requests = []
  const server = http.createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const parsedBody = body ? JSON.parse(body) : {}
    requests.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      body: parsedBody,
    })

    const response = await handler({ req, body: parsedBody })
    res.writeHead(response.status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(response.body))
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
    return await fn({ baseUrl, requests })
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  }
}

async function createNotification(email, referenceId) {
  return prisma.notificationOutbox.create({
    data: {
      eventType: 'H1_EMAIL_PROVIDER_TEST',
      recipientEmail: email,
      subject: 'H1 Resend provider runtime check',
      templateKey: 'runtime.h1_email_provider',
      payload: { referenceId },
      referenceType: 'runtime_check',
      referenceId,
      status: 'PENDING',
    },
  })
}

async function main() {
  const suffix = runtimeSuffix()
  const successRef = `${suffix}-success`
  const failureRef = `${suffix}-failure`
  const successEmail = `h1-provider-success-${suffix}@vendora.local`
  const failureEmail = `h1-provider-failure-${suffix}@vendora.local`

  const success = await createNotification(successEmail, successRef)

  await withMockResend(
    () => ({ status: 200, body: { id: `resend_${suffix}` } }),
    async ({ baseUrl, requests }) => {
      const summary = await drain(successRef, baseUrl)
      assert(summary.ok === true, 'provider drain should return ok')
      assert(summary.sent === 1, `expected one sent provider notification, got ${summary.sent}`)
      assert(requests.length === 1, `expected one provider API request, got ${requests.length}`)

      const request = requests[0]
      assert(request.method === 'POST', `expected provider POST, got ${request.method}`)
      assert(request.url === '/emails', `expected /emails request, got ${request.url}`)
      assert(request.authorization === 'Bearer runtime_resend_key', 'provider request should include bearer token')
      assert(request.body.from === 'Vendora <no-reply@vendora.local>', 'provider request should include from address')
      assert(Array.isArray(request.body.to) && request.body.to[0] === successEmail, 'provider request should include recipient')
      assert(request.body.subject === 'H1 Resend provider runtime check', 'provider request should include subject')
      assert(String(request.body.text).includes('runtime.h1_email_provider'), 'provider request should include text content')
      assert(String(request.body.html).includes('runtime.h1_email_provider'), 'provider request should include html content')
    },
  )

  const sent = await prisma.notificationOutbox.findUnique({ where: { id: success.id } })
  assert(sent?.status === 'SENT', `expected success SENT, got ${sent?.status}`)
  assert(sent?.providerName === 'resend', `expected resend provider, got ${sent?.providerName}`)
  assert(sent?.providerMessageId === `resend_${suffix}`, `expected provider message id, got ${sent?.providerMessageId}`)
  assert(sent?.sentAt, 'sent notification should store sentAt')
  record('H1-EMAIL-PROVIDER-01', 'resend provider adapter sends pending outbox rows to provider HTTP API')
  record('H1-EMAIL-PROVIDER-02', 'resend provider adapter stores provider message id and sent timestamp')

  const failure = await createNotification(failureEmail, failureRef)

  await withMockResend(
    () => ({ status: 500, body: { message: 'runtime provider failure' } }),
    async ({ baseUrl, requests }) => {
      const summary = await drain(failureRef, baseUrl)
      assert(summary.failed === 1, `expected one failed provider notification, got ${summary.failed}`)
      assert(requests.length === 1, `expected one failed provider API request, got ${requests.length}`)
    },
  )

  const failed = await prisma.notificationOutbox.findUnique({ where: { id: failure.id } })
  assert(failed?.status === 'FAILED', `expected provider failure FAILED, got ${failed?.status}`)
  assert(failed?.providerName === 'resend', `expected failure provider resend, got ${failed?.providerName}`)
  assert(failed?.lastError?.includes('runtime provider failure'), 'provider failure should store provider error')
  record('H1-EMAIL-PROVIDER-03', 'resend provider adapter records provider failures through outbox failure path')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    sentNotificationId: success.id,
    failedNotificationId: failure.id,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
