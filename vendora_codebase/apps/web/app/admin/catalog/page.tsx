'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../lib/api'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'
type ModerationAction = 'APPROVE' | 'SUSPEND'

interface CatalogListing {
  id: string
  title: string
  category: string
  priceMinor: number
  currency: string
  stockQty: number
  status: string
  published: boolean
  publishedAt: string | null
  moderationStatus: string
  moderationReason: string | null
  moderatedAt: string | null
  vendor: { id: string; name: string; status: string }
  updatedAt: string
}

const statusTone: Record<string, string> = {
  APPROVED: 'bg-emerald-50 text-emerald-700',
  SUSPENDED: 'bg-red-50 text-red-700',
  PUBLISHED: 'bg-blue-50 text-blue-700',
  DRAFT: 'bg-slate-100 text-slate-600',
}

function formatDate(value?: string | null) {
  if (!value) return '-'
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

export default function AdminCatalogPage() {
  const router = useRouter()
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState('')
  const [listings, setListings] = useState<CatalogListing[]>([])
  const [busyAction, setBusyAction] = useState<string | null>(null)

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
      const response = await api.get<{ data: CatalogListing[] }>('/admin/catalog/listings', token)
      setListings(response.data)
      setState('ready')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Catalog moderation load failed')
      setState('error')
      if ((err as Error & { code?: string }).code === 'FORBIDDEN') {
        router.push('/auth/login')
      }
    }
  }, [router, token])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  async function moderate(listing: CatalogListing, action: ModerationAction) {
    if (!token) return
    const actionId = `${listing.id}:${action}`
    setBusyAction(actionId)
    setError('')
    try {
      await api.post(`/admin/catalog/listings/${listing.id}/moderate`, {
        action,
        reason: action === 'SUSPEND' ? 'Admin catalog moderation' : 'Admin catalog approval',
      }, token)
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Catalog moderation failed')
    } finally {
      setBusyAction(null)
    }
  }

  if (state === 'loading' && listings.length === 0) {
    return <main className="mx-auto max-w-7xl px-4 py-8 text-sm text-slate-500">Loading...</main>
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Catalog</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">Listing Moderation</h1>
          <p className="mt-1 text-sm text-slate-500">Updated {formatDate(new Date().toISOString())}</p>
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

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="grid grid-cols-[1.3fr_0.7fr_0.7fr_0.7fr_0.6fr] gap-4 border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          <span>Listing</span>
          <span>Vendor</span>
          <span>Status</span>
          <span>Moderation</span>
          <span className="text-right">Action</span>
        </div>
        <div className="divide-y divide-slate-100">
          {listings.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">No listings</p>
          ) : listings.map((listing) => (
            <div key={listing.id} className="grid grid-cols-[1.3fr_0.7fr_0.7fr_0.7fr_0.6fr] items-center gap-4 px-4 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{listing.title}</p>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {listing.category} · {formatMoney(listing.priceMinor, listing.currency)} · stock {listing.stockQty}
                </p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{listing.vendor.name}</p>
                <p className="mt-1 text-xs text-slate-500">{listing.vendor.status}</p>
              </div>
              <StatusBadge value={listing.status} />
              <div className="min-w-0">
                <StatusBadge value={listing.moderationStatus} />
                {listing.moderationReason && <p className="mt-1 truncate text-xs text-slate-500">{listing.moderationReason}</p>}
              </div>
              <div className="flex justify-end">
                {listing.moderationStatus === 'SUSPENDED' ? (
                  <button
                    type="button"
                    onClick={() => void moderate(listing, 'APPROVE')}
                    disabled={busyAction !== null}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Approve
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void moderate(listing, 'SUSPEND')}
                    disabled={busyAction !== null}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    Suspend
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
