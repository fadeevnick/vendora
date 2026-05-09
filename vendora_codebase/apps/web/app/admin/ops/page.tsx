'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../lib/api'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

interface OpsSummary {
  generatedAt: string
  notifications: {
    pending: number
    sent: number
    failed: number
    suppressed: number
    oldestPending: OpsReference | null
  }
  moneyProviderFailures: {
    refunds: { failed: number; unreviewed: number }
    payouts: { failed: number; unreviewed: number }
  }
  latestReconciliation: {
    id: string
    status: string
    mismatches: number
    checkedPayments: number
    checkedRefunds: number
    checkedPayouts: number
    createdAt: string
    completedAt: string | null
  } | null
  orderMaintenanceBacklog: MaintenanceBacklog
}

interface OpsReference {
  id: string
  eventType?: string
  referenceType?: string
  referenceId?: string
  createdAt?: string
  updatedAt?: string
  attempts?: number
  lastError?: string | null
}

interface MaintenanceBacklog {
  checkoutExpiryDue: number
  confirmationTimeoutDue: number
  deliveryTimeoutDue: number
  totalDue: number
}

interface DisputeSlaBacklog {
  vendorResponseDue: number
  totalDue: number
  olderThanHours: number
}

interface QueueOps {
  generatedAt: string
  notifications: {
    pending: number
    sent: number
    failed: number
    suppressed: number
    total: number
    oldestPending: OpsReference | null
    oldestFailed: OpsReference | null
  }
  orderMaintenance: MaintenanceBacklog
  disputeSla: DisputeSlaBacklog
  returnInspections: {
    pending: number
    completed: number
    total: number
    oldestPending: { id: string; orderId: string; resolvedAt: string | null } | null
  }
  moneyFailures: {
    refunds: { failed: number; unreviewed: number }
    payouts: { failed: number; unreviewed: number }
    totalFailed: number
    totalUnreviewed: number
  }
  totals: { actionable: number }
}

interface WorkerOps {
  generatedAt: string
  notificationWorker: WorkerSnapshot
  orderMaintenanceWorker: WorkerSnapshot
  disputeSlaWorker: WorkerSnapshot
  catalogSearchWorker: WorkerSnapshot
  latestActivity: {
    id: string
    action: string
    resourceType: string
    resourceId: string
    actorUserId: string | null
    createdAt: string
  }[]
}

interface WorkerSnapshot {
  status: string
  heartbeat: {
    staleAfterMs: number
    latest: {
      id: string
      instanceId: string
      status: string
      runs: number
      processed: number
      idleRuns: number
      lastStartedAt: string | null
      lastHeartbeatAt: string | null
      lastStoppedAt: string | null
      lastError: string | null
    } | null
  }
  queue?: QueueOps['notifications']
  backlog?: MaintenanceBacklog | DisputeSlaBacklog | { documents: number }
}

interface NotificationRow {
  id: string
  eventType: string
  recipientEmail: string
  subject: string
  status: string
  attempts: number
  lastError: string | null
  referenceType: string
  referenceId: string
  createdAt: string
  updatedAt: string
  sentAt: string | null
}

interface MoneyFailures {
  totals: { refunds: number; payouts: number; all: number }
  refunds: MoneyFailure[]
  payouts: MoneyFailure[]
}

interface MoneyFailure {
  id: string
  type: 'REFUND' | 'PAYOUT'
  providerName: string
  amountMinor: number
  currency: string
  status: string
  errorMessage: string | null
  reviewedAt: string | null
  reviewedByUserId?: string | null
  reviewNote?: string | null
  orderId: string
  fundStatus: string | null
  buyer?: { email: string }
  vendor?: { name: string }
  updatedAt: string
}

interface ReconciliationRun {
  id: string
  scope: string
  status: string
  checkedPayments: number
  checkedRefunds: number
  checkedPayouts: number
  mismatches: number
  createdAt: string
  completedAt: string | null
  items: {
    id: string
    itemType: string
    resourceId: string
    status: string
    createdAt: string
  }[]
}

interface ReturnInspection {
  disputeId: string
  orderId: string
  status: string
  resolutionType: string
  resolvedAt: string | null
  buyer: { email: string }
  vendor: { name: string }
  fundStatus: string | null
  itemQuantity: number
  items: { productName: string; quantity: number; currentStock: number }[]
}

interface MaintenanceResult {
  mode: string
  executed: boolean
  backlog?: MaintenanceBacklog
  backlogBefore?: MaintenanceBacklog
  result?: Record<string, unknown>
  auditEventId?: string
}

interface DisputeSlaResult {
  mode: string
  executed: boolean
  backlog?: DisputeSlaBacklog
  backlogBefore?: DisputeSlaBacklog
  result?: Record<string, unknown>
  auditEventId?: string
}

interface CatalogSearchReindexResult {
  mode: string
  executed: boolean
  backlog?: { documents: number }
  backlogBefore?: { documents: number }
  result?: { index: string; documents: number }
  auditEventId?: string
}

const statusTone: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  FAILED: 'bg-red-50 text-red-700',
  SENT: 'bg-emerald-50 text-emerald-700',
  SUPPRESSED: 'bg-slate-100 text-slate-600',
  RUNNING: 'bg-blue-50 text-blue-700',
  STOPPED: 'bg-slate-100 text-slate-600',
  STALE: 'bg-orange-50 text-orange-700',
  ERROR: 'bg-red-50 text-red-700',
  SUCCEEDED: 'bg-emerald-50 text-emerald-700',
  MATCHED: 'bg-emerald-50 text-emerald-700',
  MISMATCHED: 'bg-red-50 text-red-700',
  PENDING_INSPECTION: 'bg-amber-50 text-amber-700',
  REVIEWED: 'bg-blue-50 text-blue-700',
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100)
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[value] ?? 'bg-slate-100 text-slate-600'}`}>
      {value}
    </span>
  )
}

function Metric({ label, value, tone = 'default' }: { label: string; value: number | string; tone?: 'default' | 'warn' | 'danger' }) {
  const toneClass = tone === 'danger' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700' : 'text-slate-900'
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export default function AdminOpsPage() {
  const router = useRouter()
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<OpsSummary | null>(null)
  const [queues, setQueues] = useState<QueueOps | null>(null)
  const [workers, setWorkers] = useState<WorkerOps | null>(null)
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [moneyFailures, setMoneyFailures] = useState<MoneyFailures | null>(null)
  const [reconciliation, setReconciliation] = useState<ReconciliationRun[]>([])
  const [inspections, setInspections] = useState<ReturnInspection[]>([])
  const [notificationStatus, setNotificationStatus] = useState('FAILED')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [maintenanceResult, setMaintenanceResult] = useState<MaintenanceResult | null>(null)
  const [disputeSlaResult, setDisputeSlaResult] = useState<DisputeSlaResult | null>(null)
  const [catalogSearchResult, setCatalogSearchResult] = useState<CatalogSearchReindexResult | null>(null)
  const [moneyReviewNotes, setMoneyReviewNotes] = useState<Record<string, string>>({})

  const token = useMemo(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('token')
  }, [])

  const load = useCallback(async () => {
    if (!token) {
      router.push('/auth/login')
      return
    }

    setState('loading')
    setError('')

    try {
      const [
        summaryResponse,
        queueResponse,
        workerResponse,
        notificationResponse,
        moneyFailureResponse,
        reconciliationResponse,
        inspectionResponse,
      ] = await Promise.all([
        api.get<{ data: OpsSummary }>('/admin/ops/summary', token),
        api.get<{ data: QueueOps }>('/admin/ops/queues', token),
        api.get<{ data: WorkerOps }>('/admin/ops/workers', token),
        api.get<{ data: NotificationRow[] }>(`/admin/ops/notifications?status=${notificationStatus}&limit=20`, token),
        api.get<{ data: MoneyFailures }>('/admin/ops/money/failures?type=ALL&reviewed=ALL&limit=20', token),
        api.get<{ data: ReconciliationRun[] }>('/admin/ops/money/reconciliation?limit=5', token),
        api.get<{ data: ReturnInspection[] }>('/admin/ops/return-inspections?status=PENDING&limit=20', token),
      ])

      setSummary(summaryResponse.data)
      setQueues(queueResponse.data)
      setWorkers(workerResponse.data)
      setNotifications(notificationResponse.data)
      setMoneyFailures(moneyFailureResponse.data)
      setReconciliation(reconciliationResponse.data)
      setInspections(inspectionResponse.data)
      setState('ready')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Admin ops load failed'
      setError(message)
      setState('error')
      if ((err as Error & { code?: string }).code === 'FORBIDDEN') {
        router.push('/auth/login')
      }
    }
  }, [notificationStatus, router, token])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  async function retryNotification(notificationId: string) {
    if (!token) return
    setBusyAction(notificationId)
    setError('')
    try {
      await api.post(`/admin/ops/notifications/${notificationId}/retry`, {}, token)
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Retry failed')
    } finally {
      setBusyAction(null)
    }
  }

  async function runMaintenance(dryRun: boolean) {
    if (!token) return
    const actionId = dryRun ? 'maintenance-dry-run' : 'maintenance-execute'
    setBusyAction(actionId)
    setError('')
    try {
      const response = await api.post<{ data: MaintenanceResult }>('/admin/ops/order-maintenance/run', {
        dryRun,
        limit: 50,
      }, token)
      setMaintenanceResult(response.data)
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Maintenance run failed')
    } finally {
      setBusyAction(null)
    }
  }

  async function runDisputeSla(dryRun: boolean) {
    if (!token) return
    const actionId = dryRun ? 'dispute-sla-dry-run' : 'dispute-sla-execute'
    setBusyAction(actionId)
    setError('')
    try {
      const response = await api.post<{ data: DisputeSlaResult }>('/admin/ops/dispute-sla/run', {
        dryRun,
        limit: 50,
      }, token)
      setDisputeSlaResult(response.data)
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Dispute SLA run failed')
    } finally {
      setBusyAction(null)
    }
  }

  async function runCatalogSearchReindex(dryRun: boolean) {
    if (!token) return
    const actionId = dryRun ? 'catalog-search-dry-run' : 'catalog-search-execute'
    setBusyAction(actionId)
    setError('')
    try {
      const response = await api.post<{ data: CatalogSearchReindexResult }>('/admin/ops/catalog-search/reindex', {
        dryRun,
      }, token)
      setCatalogSearchResult(response.data)
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Catalog search reindex failed')
    } finally {
      setBusyAction(null)
    }
  }

  async function completeInspection(disputeId: string, outcome: 'RESTOCK' | 'DO_NOT_RESTOCK') {
    if (!token) return
    setBusyAction(`${disputeId}:${outcome}`)
    setError('')
    try {
      await api.post(`/admin/ops/return-inspections/${disputeId}/complete`, {
        outcome,
        note: outcome === 'RESTOCK' ? 'Admin UI restock decision' : 'Admin UI no-restock decision',
      }, token)
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Return inspection failed')
    } finally {
      setBusyAction(null)
    }
  }

  function moneyFailurePath(failure: MoneyFailure, action: 'retry' | 'mark-reviewed') {
    const kind = failure.type === 'REFUND' ? 'refund' : 'payout'
    return `/admin/money/${kind}-failures/${failure.id}/${action}`
  }

  async function retryMoneyFailure(failure: MoneyFailure) {
    if (!token) return
    setBusyAction(`${failure.id}:retry`)
    setError('')

    try {
      await api.post(moneyFailurePath(failure, 'retry'), {}, token)
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Money failure retry failed')
    } finally {
      setBusyAction(null)
    }
  }

  async function markMoneyFailureReviewed(failure: MoneyFailure) {
    if (!token) return
    setBusyAction(`${failure.id}:review`)
    setError('')

    try {
      await api.post(moneyFailurePath(failure, 'mark-reviewed'), {
        note: moneyReviewNotes[failure.id]?.trim() || 'Reviewed from admin ops UI',
      }, token)
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Money failure review failed')
    } finally {
      setBusyAction(null)
    }
  }

  if (state === 'loading' && !summary) {
    return <main className="mx-auto max-w-7xl px-4 py-8 text-sm text-slate-500">Загрузка...</main>
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Operations</h1>
          <p className="mt-1 text-sm text-slate-500">Updated {formatDate(summary?.generatedAt ?? queues?.generatedAt)}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={state === 'loading'}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Actionable queues" value={queues?.totals.actionable ?? 0} tone={(queues?.totals.actionable ?? 0) > 0 ? 'warn' : 'default'} />
        <Metric label="Failed notifications" value={summary?.notifications.failed ?? 0} tone={(summary?.notifications.failed ?? 0) > 0 ? 'danger' : 'default'} />
        <Metric label="Unreviewed money failures" value={(summary?.moneyProviderFailures.refunds.unreviewed ?? 0) + (summary?.moneyProviderFailures.payouts.unreviewed ?? 0)} tone="danger" />
        <Metric label="Maintenance due" value={summary?.orderMaintenanceBacklog.totalDue ?? 0} tone={(summary?.orderMaintenanceBacklog.totalDue ?? 0) > 0 ? 'warn' : 'default'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Panel title="Queue Snapshot">
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Notifications pending" value={queues?.notifications.pending ?? 0} />
            <Metric label="Return inspections" value={queues?.returnInspections.pending ?? 0} tone={(queues?.returnInspections.pending ?? 0) > 0 ? 'warn' : 'default'} />
            <Metric label="Checkout expiries" value={queues?.orderMaintenance.checkoutExpiryDue ?? 0} />
            <Metric label="Confirmation timeouts" value={queues?.orderMaintenance.confirmationTimeoutDue ?? 0} />
            <Metric label="Dispute SLA due" value={queues?.disputeSla.totalDue ?? 0} tone={(queues?.disputeSla.totalDue ?? 0) > 0 ? 'warn' : 'default'} />
          </div>
        </Panel>

        <Panel title="Workers">
          <div className="space-y-3">
            {[
              ['Notification outbox', workers?.notificationWorker],
              ['Order maintenance', workers?.orderMaintenanceWorker],
              ['Dispute SLA', workers?.disputeSlaWorker],
              ['Catalog search', workers?.catalogSearchWorker],
            ].map(([label, worker]) => {
              const snapshot = worker as WorkerSnapshot | undefined
              return (
                <div key={label as string} className="rounded-lg border border-slate-200 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800">{label as string}</p>
                    <StatusBadge value={snapshot?.status ?? 'NO_HEARTBEAT'} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500">
                    <span>Runs {snapshot?.heartbeat.latest?.runs ?? 0}</span>
                    <span>Processed {snapshot?.heartbeat.latest?.processed ?? 0}</span>
                    <span>Heartbeat {formatDate(snapshot?.heartbeat.latest?.lastHeartbeatAt)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>

      <Panel
        title="Order Maintenance"
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void runMaintenance(true)}
              disabled={busyAction !== null}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Dry run
            </button>
            <button
              type="button"
              onClick={() => void runMaintenance(false)}
              disabled={busyAction !== null}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Execute
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Checkout expiry" value={summary?.orderMaintenanceBacklog.checkoutExpiryDue ?? 0} />
          <Metric label="Vendor timeout" value={summary?.orderMaintenanceBacklog.confirmationTimeoutDue ?? 0} />
          <Metric label="Delivery timeout" value={summary?.orderMaintenanceBacklog.deliveryTimeoutDue ?? 0} />
        </div>
        {maintenanceResult && (
          <pre className="mt-4 max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
            {JSON.stringify(maintenanceResult, null, 2)}
          </pre>
        )}
      </Panel>

      <Panel
        title="Dispute SLA"
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void runDisputeSla(true)}
              disabled={busyAction !== null}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Dry run
            </button>
            <button
              type="button"
              onClick={() => void runDisputeSla(false)}
              disabled={busyAction !== null}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Execute
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Vendor response due" value={queues?.disputeSla.vendorResponseDue ?? 0} tone={(queues?.disputeSla.vendorResponseDue ?? 0) > 0 ? 'warn' : 'default'} />
          <Metric label="SLA hours" value={queues?.disputeSla.olderThanHours ?? 48} />
          <Metric label="Total due" value={queues?.disputeSla.totalDue ?? 0} tone={(queues?.disputeSla.totalDue ?? 0) > 0 ? 'warn' : 'default'} />
        </div>
        {disputeSlaResult && (
          <pre className="mt-4 max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
            {JSON.stringify(disputeSlaResult, null, 2)}
          </pre>
        )}
      </Panel>

      <Panel
        title="Catalog Search"
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void runCatalogSearchReindex(true)}
              disabled={busyAction !== null}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Dry run
            </button>
            <button
              type="button"
              onClick={() => void runCatalogSearchReindex(false)}
              disabled={busyAction !== null}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Reindex
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Source documents" value={catalogSearchResult?.backlog?.documents ?? catalogSearchResult?.backlogBefore?.documents ?? '—'} />
          <Metric label="Indexed documents" value={catalogSearchResult?.result?.documents ?? '—'} />
          <Metric label="Index" value={catalogSearchResult?.result?.index ?? '—'} />
        </div>
        {catalogSearchResult && (
          <pre className="mt-4 max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
            {JSON.stringify(catalogSearchResult, null, 2)}
          </pre>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Notifications"
          action={
            <select
              value={notificationStatus}
              onChange={(event) => setNotificationStatus(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700"
            >
              <option value="FAILED">Failed</option>
              <option value="PENDING">Pending</option>
              <option value="SENT">Sent</option>
              <option value="SUPPRESSED">Suppressed</option>
            </select>
          }
        >
          <div className="space-y-3">
            {notifications.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No rows</p>
            ) : notifications.map((row) => (
              <div key={row.id} className="rounded-lg border border-slate-200 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{row.subject}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{row.recipientEmail} · {row.eventType}</p>
                  </div>
                  <StatusBadge value={row.status} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>Attempts {row.attempts} · {formatDate(row.updatedAt)}</span>
                  {row.status === 'FAILED' && (
                    <button
                      type="button"
                      onClick={() => void retryNotification(row.id)}
                      disabled={busyAction !== null}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Retry
                    </button>
                  )}
                </div>
                {row.lastError && <p className="mt-2 line-clamp-2 text-xs text-red-600">{row.lastError}</p>}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Money Failures">
          <div className="space-y-3">
            {[...(moneyFailures?.refunds ?? []), ...(moneyFailures?.payouts ?? [])].length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No failed provider executions</p>
            ) : [...(moneyFailures?.refunds ?? []), ...(moneyFailures?.payouts ?? [])].map((failure) => (
              <div key={failure.id} className="rounded-lg border border-slate-200 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{failure.type} · {formatMoney(failure.amountMinor, failure.currency)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {failure.vendor?.name ?? failure.buyer?.email ?? 'Unknown party'} · order #{failure.orderId.slice(0, 8)} · {failure.providerName}
                    </p>
                  </div>
                  <StatusBadge value={failure.reviewedAt ? 'REVIEWED' : 'FAILED'} />
                </div>
                <p className="mt-2 text-xs text-red-600">{failure.errorMessage ?? 'Provider execution failed'}</p>
                {failure.reviewNote && (
                  <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-600">{failure.reviewNote}</p>
                )}
                <div className="mt-3 flex flex-col gap-2">
                  <input
                    value={moneyReviewNotes[failure.id] ?? ''}
                    onChange={(event) => setMoneyReviewNotes((prev) => ({ ...prev, [failure.id]: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 outline-none transition-colors focus:border-slate-400"
                    placeholder="Review note"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void markMoneyFailureReviewed(failure)}
                      disabled={busyAction !== null}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {busyAction === `${failure.id}:review` ? 'Reviewing...' : 'Mark reviewed'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void retryMoneyFailure(failure)}
                      disabled={busyAction !== null}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      {busyAction === `${failure.id}:retry` ? 'Retrying...' : 'Retry'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Return Inspections">
          <div className="space-y-3">
            {inspections.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No pending inspections</p>
            ) : inspections.map((inspection) => (
              <div key={inspection.disputeId} className="rounded-lg border border-slate-200 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{inspection.vendor.name} · {inspection.itemQuantity} items</p>
                    <p className="mt-1 text-xs text-slate-500">{inspection.buyer.email} · dispute #{inspection.disputeId.slice(0, 8)}</p>
                  </div>
                  <StatusBadge value="PENDING_INSPECTION" />
                </div>
                <div className="mt-3 space-y-1">
                  {inspection.items.map((item) => (
                    <div key={item.productName} className="flex justify-between text-xs text-slate-500">
                      <span>{item.productName}</span>
                      <span>{item.quantity} · stock {item.currentStock}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void completeInspection(inspection.disputeId, 'RESTOCK')}
                    disabled={busyAction !== null}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    Restock
                  </button>
                  <button
                    type="button"
                    onClick={() => void completeInspection(inspection.disputeId, 'DO_NOT_RESTOCK')}
                    disabled={busyAction !== null}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    No restock
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Reconciliation">
          <div className="space-y-3">
            {reconciliation.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No reconciliation runs</p>
            ) : reconciliation.map((run) => (
              <div key={run.id} className="rounded-lg border border-slate-200 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">Run #{run.id.slice(0, 8)}</p>
                  <StatusBadge value={run.status} />
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-slate-500">
                  <span>Pay {run.checkedPayments}</span>
                  <span>Refund {run.checkedRefunds}</span>
                  <span>Payout {run.checkedPayouts}</span>
                  <span>Mismatch {run.mismatches}</span>
                </div>
                {run.items.slice(0, 3).map((item) => (
                  <div key={item.id} className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-2 py-1.5 text-xs">
                    <span className="truncate text-slate-600">{item.itemType} · {item.resourceId}</span>
                    <StatusBadge value={item.status} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {workers?.latestActivity && workers.latestActivity.length > 0 && (
        <Panel title="Latest Activity">
          <div className="divide-y divide-slate-100">
            {workers.latestActivity.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                <span className="font-medium text-slate-800">{activity.action}</span>
                <span className="shrink-0 text-xs text-slate-500">{activity.resourceType} · {formatDate(activity.createdAt)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </main>
  )
}
