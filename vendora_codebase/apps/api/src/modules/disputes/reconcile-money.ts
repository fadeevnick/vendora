import 'dotenv/config'
import { prisma } from '../../shared/db.js'
import { runMoneyReconciliation } from './reconciliation.service.js'

function numberArg(name: string, fallback: number) {
  const prefix = `--${name}=`
  const arg = process.argv.find((item) => item.startsWith(prefix))
  if (!arg) return fallback
  const parsed = Number(arg.slice(prefix.length))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const limit = numberArg('limit', 100)

runMoneyReconciliation({ limit })
  .then((run) => {
    console.log(JSON.stringify({
      ok: run.status === 'SUCCEEDED',
      runId: run.id,
      status: run.status,
      checkedPayments: run.checkedPayments,
      checkedRefunds: run.checkedRefunds,
      checkedPayouts: run.checkedPayouts,
      mismatches: run.mismatches,
      itemCount: run.items.length,
    }, null, 2))
  })
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
