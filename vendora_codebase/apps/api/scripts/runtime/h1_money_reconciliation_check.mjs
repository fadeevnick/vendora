import { execFileSync } from 'node:child_process'
import {
  assert,
  disconnect,
  evidence,
  prisma,
  record,
} from './runtime_helpers.mjs'

function runNpm(script, args = []) {
  return execFileSync('npm', ['run', script, '--workspace', 'apps/api', ...args], {
    cwd: new URL('../../../..', import.meta.url).pathname,
    env: process.env,
    encoding: 'utf8',
  })
}

function parseJson(output, label) {
  const jsonStart = output.indexOf('{')
  assert(jsonStart >= 0, `${label} output did not include JSON: ${output}`)
  return JSON.parse(output.slice(jsonStart))
}

async function main() {
  parseJson(runNpm('runtime:h1-refund-provider'), 'refund provider check')
  parseJson(runNpm('runtime:h1-payout-provider'), 'payout provider check')

  const reconciliation = parseJson(runNpm('money:reconcile', ['--', '--limit=250']), 'money reconciliation')
  assert(reconciliation.ok === true, 'money reconciliation should return ok')
  assert(reconciliation.status === 'SUCCEEDED', `expected reconciliation SUCCEEDED, got ${reconciliation.status}`)
  assert(reconciliation.checkedPayments > 0, 'reconciliation should check payment provider events')
  assert(reconciliation.checkedRefunds > 0, 'reconciliation should check refund provider executions')
  assert(reconciliation.checkedPayouts > 0, 'reconciliation should check payout provider executions')
  assert(reconciliation.mismatches === 0, `expected zero mismatches, got ${reconciliation.mismatches}`)
  record('H1-MONEY-RECON-01', 'money reconciliation run checks payment, refund and payout provider artifacts')
  record('H1-MONEY-RECON-02', 'money reconciliation run completes with zero mismatches')

  const run = await prisma.moneyReconciliationRun.findUnique({
    where: { id: reconciliation.runId },
    include: { items: true },
  })
  assert(run?.status === 'SUCCEEDED', `expected persisted run SUCCEEDED, got ${run?.status}`)
  assert(run.items.length === reconciliation.itemCount, 'persisted reconciliation item count should match command output')
  assert(run.items.every((item) => item.status === 'MATCHED'), 'all persisted reconciliation items should be MATCHED')
  assert(run.items.some((item) => item.itemType === 'PAYMENT_EVENT'), 'run should include payment items')
  assert(run.items.some((item) => item.itemType === 'REFUND_EXECUTION'), 'run should include refund items')
  assert(run.items.some((item) => item.itemType === 'PAYOUT_EXECUTION'), 'run should include payout items')
  record('H1-MONEY-RECON-03', 'money reconciliation persists matched item evidence for all provider artifact types')

  console.log(JSON.stringify({
    ok: true,
    evidence,
    reconciliationRunId: run.id,
    checkedPayments: run.checkedPayments,
    checkedRefunds: run.checkedRefunds,
    checkedPayouts: run.checkedPayouts,
    itemCount: run.items.length,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
