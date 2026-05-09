'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../lib/api'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

interface VendorBalance {
  vendorId: string
  currency: string
  totals: {
    heldMinor: number
    frozenMinor: number
    releasableMinor: number
    returnedToBuyerMinor: number
    paidOutMinor: number
  }
  ledger: LedgerEntry[]
}

interface LedgerEntry {
  id: string
  vendorId: string
  orderId: string | null
  entryType: string
  amountMinor: number
  currency: string
  referenceType: string
  referenceId: string
  createdAt: string
}

const ENTRY_LABEL: Record<string, string> = {
  FROZEN: 'Заморожено',
  RELEASED: 'Доступно к выплате',
  REFUNDED: 'Возврат покупателю',
  PAID_OUT: 'Выплачено',
}

const ENTRY_TONE: Record<string, string> = {
  FROZEN: 'bg-red-50 text-red-700',
  RELEASED: 'bg-emerald-50 text-emerald-700',
  REFUNDED: 'bg-slate-100 text-slate-600',
  PAID_OUT: 'bg-blue-50 text-blue-700',
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100)
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function SummaryCard({ label, amount, currency, tone = 'default' }: {
  label: string
  amount: number
  currency: string
  tone?: 'default' | 'positive' | 'warn' | 'muted'
}) {
  const toneClass = tone === 'positive'
    ? 'text-emerald-700'
    : tone === 'warn'
      ? 'text-amber-700'
      : tone === 'muted'
        ? 'text-slate-500'
        : 'text-slate-900'

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${toneClass}`}>{formatMoney(amount, currency)}</p>
    </div>
  )
}

function EntryBadge({ value }: { value: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ENTRY_TONE[value] ?? 'bg-slate-100 text-slate-600'}`}>
      {ENTRY_LABEL[value] ?? value}
    </span>
  )
}

export default function VendorBalancePage() {
  const router = useRouter()
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState('')
  const [balance, setBalance] = useState<VendorBalance | null>(null)

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
      const response = await api.get<{ data: VendorBalance }>('/vendor/balance', token)
      setBalance(response.data)
      setState('ready')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить баланс')
      setState('error')
    }
  }, [router, token])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  if (state === 'loading' && !balance) {
    return <div className="px-6 py-8 text-slate-400">Загрузка...</div>
  }

  const currency = balance?.currency ?? 'RUB'

  return (
    <main className="px-6 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Баланс и ledger</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hold, release, refunds and payout evidence for this vendor.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={state === 'loading'}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          Обновить
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Held" amount={balance?.totals.heldMinor ?? 0} currency={currency} />
        <SummaryCard label="Frozen" amount={balance?.totals.frozenMinor ?? 0} currency={currency} tone="warn" />
        <SummaryCard label="Releasable" amount={balance?.totals.releasableMinor ?? 0} currency={currency} tone="positive" />
        <SummaryCard label="Paid out" amount={balance?.totals.paidOutMinor ?? 0} currency={currency} tone="positive" />
        <SummaryCard label="Returned" amount={balance?.totals.returnedToBuyerMinor ?? 0} currency={currency} tone="muted" />
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-900">Последние ledger entries</h2>
        </div>

        {!balance || balance.ledger.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-slate-400">Ledger пока пуст</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {balance.ledger.map((entry) => (
              <div key={entry.id} className="grid gap-3 px-4 py-3.5 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <EntryBadge value={entry.entryType} />
                    <span className="text-sm font-bold text-slate-900">{formatMoney(entry.amountMinor, entry.currency)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {entry.referenceType} #{entry.referenceId.slice(0, 8)}
                    {entry.orderId ? ` · order #${entry.orderId.slice(0, 8)}` : ''}
                  </p>
                </div>
                <span className="text-sm font-semibold text-slate-700">{entry.currency}</span>
                <span className="text-xs text-slate-500">{formatDate(entry.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
