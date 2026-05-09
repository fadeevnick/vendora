import 'dotenv/config'
import { prisma } from '../../shared/db.js'
import { drainNotificationOutbox } from './notifications.service.js'

function numberArg(name: string, fallback: number) {
  const prefix = `--${name}=`
  const arg = process.argv.find((item) => item.startsWith(prefix))
  if (!arg) return fallback
  const parsed = Number(arg.slice(prefix.length))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function stringArg(name: string) {
  const prefix = `--${name}=`
  const arg = process.argv.find((item) => item.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : undefined
}

const limit = numberArg('limit', 25)
const maxAttempts = numberArg('max-attempts', 3)
const eventType = stringArg('event-type')
const referenceId = stringArg('reference-id')

drainNotificationOutbox({ limit, maxAttempts, eventType, referenceId })
  .then((summary) => {
    console.log(JSON.stringify({ ok: true, ...summary }, null, 2))
  })
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
