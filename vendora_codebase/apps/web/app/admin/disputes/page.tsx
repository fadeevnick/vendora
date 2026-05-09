'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { api } from '../../../lib/api'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'
type ResolutionType = 'VENDOR_FAVOR_RELEASE' | 'BUYER_FAVOR_FULL_REFUND' | 'BUYER_FAVOR_PARTIAL_REFUND'

interface OrderFund {
  id: string
  status: string
  amountMinor: number
  refundedAmountMinor: number
  currency: string
}

interface AdminDispute {
  id: string
  orderId: string
  reason: string
  status: string
  vendorResponse: string | null
  vendorRespondedAt: string | null
  resolutionType: ResolutionType | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  messages?: DisputeMessage[]
  evidence?: DisputeEvidence[]
  order: {
    id: string
    orderNumber: string
    status: string
    total: string
    vendorId: string
    buyerId: string
    createdAt: string
    vendor: { id: string; name: string }
    buyer: { id: string; email: string }
    funds: OrderFund | null
  }
}

interface DisputeMessage {
  id: string
  actorType: string
  message: string
  createdAt: string
  actor?: { id: string; email: string } | null
}

interface DisputeEvidence {
  id: string
  submittedByActorType: string
  fileName: string
  contentType: string
  sizeBytes: number
  storageConfirmedAt?: string | null
  contentSha256?: string | null
  description: string | null
  createdAt: string
  submittedBy?: { id: string; email: string } | null
}

interface DisputeEvidenceContent {
  evidenceId: string
  fileName: string
  contentType: string
  sizeBytes: number
  contentSha256: string
  storageProvider: string
  contentBase64: string
}

const statusTone: Record<string, string> = {
  VENDOR_RESPONSE: 'bg-amber-50 text-amber-700',
  PLATFORM_REVIEW: 'bg-blue-50 text-blue-700',
  RESOLVED: 'bg-emerald-50 text-emerald-700',
  DISPUTED: 'bg-red-50 text-red-700',
  FROZEN_DISPUTE: 'bg-red-50 text-red-700',
  RELEASABLE: 'bg-emerald-50 text-emerald-700',
  RETURNED_TO_BUYER: 'bg-slate-100 text-slate-600',
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

function formatMinor(amountMinor?: number | null, currency = 'RUB') {
  if (amountMinor === undefined || amountMinor === null) return '-'
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

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="mt-1 text-sm font-bold text-slate-900">{value || '-'}</div>
    </div>
  )
}

function resolutionLabel(value: ResolutionType) {
  if (value === 'VENDOR_FAVOR_RELEASE') return 'Vendor favor: release funds'
  if (value === 'BUYER_FAVOR_FULL_REFUND') return 'Buyer favor: full refund'
  return 'Buyer favor: partial refund'
}

export default function AdminDisputesPage() {
  const router = useRouter()
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState('')
  const [disputes, setDisputes] = useState<AdminDispute[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<AdminDispute | null>(null)
  const [statusFilter, setStatusFilter] = useState('OPEN')
  const [resolutionType, setResolutionType] = useState<ResolutionType>('VENDOR_FAVOR_RELEASE')
  const [partialRefundMajor, setPartialRefundMajor] = useState('')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [evidenceContent, setEvidenceContent] = useState<DisputeEvidenceContent | null>(null)

  const token = useMemo(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('token')
  }, [])

  const visibleDisputes = useMemo(() => {
    if (statusFilter === 'ALL') return disputes
    if (statusFilter === 'OPEN') return disputes.filter((item) => item.status !== 'RESOLVED')
    return disputes.filter((item) => item.status === statusFilter)
  }, [disputes, statusFilter])

  const loadQueue = useCallback(async () => {
    if (!token) {
      router.push('/auth/login')
      return
    }

    setState('loading')
    setError('')

    try {
      const response = await api.get<{ data: AdminDispute[] }>('/admin/disputes', token)
      setDisputes(response.data)
      const nextVisible = statusFilter === 'ALL'
        ? response.data
        : statusFilter === 'OPEN'
          ? response.data.filter((item) => item.status !== 'RESOLVED')
          : response.data.filter((item) => item.status === statusFilter)
      const nextSelectedId = selectedId && response.data.some((item) => item.id === selectedId)
        ? selectedId
        : nextVisible[0]?.id ?? response.data[0]?.id ?? null
      setSelectedId(nextSelectedId)
      setState('ready')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load disputes'
      setError(message)
      setState('error')
      if ((err as Error & { code?: string }).code === 'FORBIDDEN') {
        router.push('/auth/login')
      }
    }
  }, [router, selectedId, statusFilter, token])

  const loadDetail = useCallback(async (disputeId: string | null) => {
    if (!token || !disputeId) {
      setSelected(null)
      return
    }

    try {
      const response = await api.get<{ data: AdminDispute }>(`/admin/disputes/${disputeId}`, token)
      setSelected(response.data)
      setResolutionType(response.data.resolutionType ?? 'VENDOR_FAVOR_RELEASE')
      setPartialRefundMajor('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dispute')
    }
  }, [token])

  useEffect(() => {
    queueMicrotask(() => {
      void loadQueue()
    })
  }, [loadQueue])

  useEffect(() => {
    queueMicrotask(() => {
      void loadDetail(selectedId)
    })
  }, [loadDetail, selectedId])

  async function resolveSelected() {
    if (!token || !selected) return
    setBusyAction('resolve')
    setError('')

    const body: {
      resolutionType: ResolutionType
      refundAmountMinor?: number
    } = { resolutionType }

    if (resolutionType === 'BUYER_FAVOR_PARTIAL_REFUND') {
      const parsedMajor = Number(partialRefundMajor.replace(',', '.'))
      if (!Number.isFinite(parsedMajor) || parsedMajor <= 0) {
        setError('Partial refund amount must be greater than zero')
        setBusyAction(null)
        return
      }
      body.refundAmountMinor = Math.round(parsedMajor * 100)
    }

    try {
      const response = await api.post<{ data: AdminDispute }>(`/admin/disputes/${selected.id}/resolve`, body, token)
      setSelected(response.data)
      await loadQueue()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resolve dispute')
    } finally {
      setBusyAction(null)
    }
  }

  async function readEvidenceContent(evidenceId: string) {
    if (!token) return
    setBusyAction(`evidence:${evidenceId}`)
    setError('')

    try {
      const response = await api.get<{ data: DisputeEvidenceContent }>(`/admin/disputes/evidence/${evidenceId}/content`, token)
      setEvidenceContent(response.data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to read evidence content')
    } finally {
      setBusyAction(null)
    }
  }

  const canResolve = selected?.status === 'PLATFORM_REVIEW'
  const openCount = disputes.filter((item) => item.status !== 'RESOLVED').length
  const platformReviewCount = disputes.filter((item) => item.status === 'PLATFORM_REVIEW').length
  const fund = selected?.order.funds
  const currency = fund?.currency ?? 'RUB'
  const maxPartialMajor = fund ? (fund.amountMinor - 1) / 100 : 0

  if (state === 'loading' && disputes.length === 0) {
    return <main className="mx-auto max-w-7xl px-4 py-8 text-sm text-slate-500">Загрузка...</main>
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Disputes</h1>
          <p className="mt-1 text-sm text-slate-500">{openCount} open · {platformReviewCount} ready for platform review</p>
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="OPEN">Open</option>
            <option value="PLATFORM_REVIEW">Platform review</option>
            <option value="VENDOR_RESPONSE">Vendor response</option>
            <option value="RESOLVED">Resolved</option>
            <option value="ALL">All</option>
          </select>
          <button
            type="button"
            onClick={() => void loadQueue()}
            disabled={state === 'loading'}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-900">Queue</h2>
          </div>
          <div className="max-h-[calc(100vh-220px)] overflow-auto p-2">
            {visibleDisputes.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-slate-400">No disputes</p>
            ) : visibleDisputes.map((dispute) => (
              <button
                key={dispute.id}
                type="button"
                onClick={() => setSelectedId(dispute.id)}
                className={`mb-2 w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                  selectedId === dispute.id
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{dispute.order.vendor.name}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{dispute.order.buyer.email}</p>
                  </div>
                  <StatusBadge value={dispute.status} />
                </div>
                <p className="mt-3 line-clamp-2 text-xs text-slate-600">{dispute.reason}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>{formatMinor(dispute.order.funds?.amountMinor, dispute.order.funds?.currency ?? 'RUB')}</span>
                  <span>{formatDate(dispute.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          {!selected ? (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-400">
              Select a dispute
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-white">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Dispute #{selected.id.slice(0, 8)}</h2>
                    <p className="mt-1 text-sm text-slate-500">Order #{selected.order.orderNumber.slice(0, 8)} · opened {formatDate(selected.createdAt)}</p>
                  </div>
                  <StatusBadge value={selected.status} />
                </div>

                <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric label="Buyer" value={selected.order.buyer.email} />
                  <Metric label="Vendor" value={selected.order.vendor.name} />
                  <Metric label="Order status" value={<StatusBadge value={selected.order.status} />} />
                  <Metric label="Fund status" value={fund ? <StatusBadge value={fund.status} /> : '-'} />
                  <Metric label="Order total" value={Number(selected.order.total).toLocaleString('ru-RU', { style: 'currency', currency })} />
                  <Metric label="Frozen amount" value={formatMinor(fund?.amountMinor, currency)} />
                  <Metric label="Refunded" value={formatMinor(fund?.refundedAmountMinor ?? 0, currency)} />
                  <Metric label="Resolved" value={formatDate(selected.resolvedAt)} />
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <h2 className="text-sm font-bold text-slate-900">Buyer Claim</h2>
                  </div>
                  <div className="p-4">
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.reason}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <h2 className="text-sm font-bold text-slate-900">Vendor Response</h2>
                  </div>
                  <div className="p-4">
                    {selected.vendorResponse ? (
                      <>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.vendorResponse}</p>
                        <p className="mt-3 text-xs text-slate-500">Responded {formatDate(selected.vendorRespondedAt)}</p>
                      </>
                    ) : (
                      <p className="text-sm text-slate-400">Waiting for vendor response</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <h2 className="text-sm font-bold text-slate-900">Messages</h2>
                  </div>
                  <div className="space-y-3 p-4">
                    {selected.messages && selected.messages.length > 0 ? selected.messages.map((message) => (
                      <div key={message.id} className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-xs font-semibold text-slate-500">
                          {message.actorType}
                          {message.actor?.email ? ` · ${message.actor.email}` : ''}
                          {' · '}
                          {formatDate(message.createdAt)}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{message.message}</p>
                      </div>
                    )) : (
                      <p className="text-sm text-slate-400">No messages recorded</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <h2 className="text-sm font-bold text-slate-900">Evidence Metadata</h2>
                  </div>
                  <div className="space-y-3 p-4">
                    {evidenceContent && (
                      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                        <p className="truncate text-sm font-semibold text-blue-900">{evidenceContent.fileName}</p>
                        <p className="mt-1 text-xs text-blue-700">{evidenceContent.storageProvider} · sha256 {evidenceContent.contentSha256.slice(0, 16)}...</p>
                        {evidenceContent.contentType.startsWith('image/') && (
                          <div className="relative mt-2 h-48 overflow-hidden rounded-lg border border-blue-100 bg-white">
                            <Image
                              src={`data:${evidenceContent.contentType};base64,${evidenceContent.contentBase64}`}
                              alt={evidenceContent.fileName}
                              fill
                              sizes="(min-width: 1280px) 40vw, 90vw"
                              className="object-contain"
                              unoptimized
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {selected.evidence && selected.evidence.length > 0 ? selected.evidence.map((item) => (
                      <div key={item.id} className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="truncate text-sm font-semibold text-slate-800">{item.fileName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.submittedByActorType}
                          {item.submittedBy?.email ? ` · ${item.submittedBy.email}` : ''}
                          {' · '}
                          {item.contentType} · {Math.ceil(item.sizeBytes / 1024)} KB · {formatDate(item.createdAt)}
                          {item.storageConfirmedAt ? ' · stored' : ''}
                        </p>
                        {item.description && <p className="mt-1 text-xs text-slate-600">{item.description}</p>}
                        {item.storageConfirmedAt && (
                          <button
                            type="button"
                            onClick={() => void readEvidenceContent(item.id)}
                            disabled={busyAction === `evidence:${item.id}`}
                            className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {busyAction === `evidence:${item.id}` ? 'Reading...' : 'Read content'}
                          </button>
                        )}
                      </div>
                    )) : (
                      <p className="text-sm text-slate-400">No evidence metadata recorded</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h2 className="text-sm font-bold text-slate-900">Resolution</h2>
                </div>
                <div className="space-y-4 p-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-600">Decision</label>
                    <select
                      value={resolutionType}
                      onChange={(event) => setResolutionType(event.target.value as ResolutionType)}
                      disabled={!canResolve}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="VENDOR_FAVOR_RELEASE">{resolutionLabel('VENDOR_FAVOR_RELEASE')}</option>
                      <option value="BUYER_FAVOR_FULL_REFUND">{resolutionLabel('BUYER_FAVOR_FULL_REFUND')}</option>
                      <option value="BUYER_FAVOR_PARTIAL_REFUND">{resolutionLabel('BUYER_FAVOR_PARTIAL_REFUND')}</option>
                    </select>
                  </div>

                  {resolutionType === 'BUYER_FAVOR_PARTIAL_REFUND' && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-600">Partial refund amount</label>
                      <input
                        type="number"
                        min="0.01"
                        max={maxPartialMajor}
                        step="0.01"
                        value={partialRefundMajor}
                        onChange={(event) => setPartialRefundMajor(event.target.value)}
                        disabled={!canResolve}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
                        placeholder="Amount in order currency"
                      />
                      <p className="mt-1 text-xs text-slate-500">Must be less than {formatMinor(fund?.amountMinor, currency)}.</p>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => void resolveSelected()}
                      disabled={!canResolve || busyAction !== null}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      {busyAction === 'resolve' ? 'Resolving...' : 'Resolve dispute'}
                    </button>
                    {selected.resolutionType && (
                      <span className="text-sm text-slate-500">Resolved as {resolutionLabel(selected.resolutionType)}</span>
                    )}
                  </div>

                  {!canResolve && (
                    <p className="text-sm text-slate-500">
                      {selected.status === 'VENDOR_RESPONSE'
                        ? 'Vendor response is required before platform resolution.'
                        : `This dispute is ${selected.status.toLowerCase()}.`}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
