import 'dotenv/config'
import { prisma } from '../../shared/db.js'
import { runOrderMaintenanceJobs } from './maintenance.service.js'

function numberArg(name: string, fallback: number) {
  const prefix = `--${name}=`
  const arg = process.argv.find((item) => item.startsWith(prefix))
  if (!arg) return fallback
  const parsed = Number(arg.slice(prefix.length))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function dateArg(name: string) {
  const prefix = `--${name}=`
  const arg = process.argv.find((item) => item.startsWith(prefix))
  if (!arg) return undefined
  const parsed = new Date(arg.slice(prefix.length))
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

const limit = numberArg('limit', 50)
const confirmationOlderThanHours = numberArg('confirmation-older-than-hours', 48)
const deliveryOlderThanHours = numberArg('delivery-older-than-hours', 72)
const now = dateArg('now')

async function main() {
  const summary = await runOrderMaintenanceJobs({
    limit,
    now,
    confirmationOlderThanHours,
    deliveryOlderThanHours,
  })

  return {
    ok: true,
    ...summary,
  }
}

main()
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2))
  })
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
