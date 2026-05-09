'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../lib/api'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

interface KycAddress {
  line1?: string
  city?: string
  postalCode?: string
}

interface KycDocument {
  id: string
  documentType: string
  fileName: string
  contentType: string
  sizeBytes: number
  storedSizeBytes?: number | null
  contentSha256?: string | null
  storageProvider?: string | null
  status: string
  createdAt: string
  completedAt: string | null
  storageConfirmedAt?: string | null
}

interface KycApplication {
  id: string
  vendorId: string
  vendor: {
    id: string
    name: string
    inn: string
    status: string
  }
  status: string
  businessProfile: {
    businessName: string | null
    legalEntityName: string | null
    taxId: string | null
    country: string | null
    address: KycAddress | null
    salesCategory: string | null
  }
  documents: KycDocument[]
  reviewNote: string | null
  rejectionReasonCode: string | null
  submittedAt: string | null
  reviewedAt: string | null
}

interface KycDocumentContent {
  documentId: string
  applicationId: string
  fileName: string
  contentType: string
  sizeBytes: number
  contentSha256: string
  storageProvider: string
  contentBase64: string
}

const statusTone: Record<string, string> = {
  PENDING_REVIEW: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
  DRAFT: 'bg-slate-100 text-slate-600',
  UPLOADED: 'bg-emerald-50 text-emerald-700',
  UPLOAD_PENDING: 'bg-amber-50 text-amber-700',
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

function formatBytes(value?: number | null) {
  if (!value) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[value] ?? 'bg-slate-100 text-slate-600'}`}>
      {value}
    </span>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value || '-'}</div>
    </div>
  )
}

function dataUrl(document: KycDocumentContent) {
  return `data:${document.contentType};base64,${document.contentBase64}`
}

export default function AdminKycPage() {
  const router = useRouter()
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState('')
  const [applications, setApplications] = useState<KycApplication[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<KycApplication | null>(null)
  const [note, setNote] = useState('')
  const [reasonCode, setReasonCode] = useState('DOCUMENTS_INSUFFICIENT')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [documentContent, setDocumentContent] = useState<Record<string, KycDocumentContent>>({})

  const token = useMemo(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('token')
  }, [])

  const loadQueue = useCallback(async () => {
    if (!token) {
      router.push('/auth/login')
      return
    }

    setState('loading')
    setError('')

    try {
      const response = await api.get<{ data: KycApplication[] }>('/admin/kyc/applications', token)
      setApplications(response.data)
      const nextSelectedId = selectedId && response.data.some((item) => item.id === selectedId)
        ? selectedId
        : response.data[0]?.id ?? null
      setSelectedId(nextSelectedId)
      setState('ready')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load KYC queue'
      setError(message)
      setState('error')
      if ((err as Error & { code?: string }).code === 'FORBIDDEN') {
        router.push('/auth/login')
      }
    }
  }, [router, selectedId, token])

  const loadDetail = useCallback(async (applicationId: string | null) => {
    if (!token || !applicationId) {
      setSelected(null)
      return
    }

    try {
      const response = await api.get<{ data: KycApplication }>(`/admin/kyc/applications/${applicationId}`, token)
      setSelected(response.data)
      setNote(response.data.reviewNote ?? '')
      setDocumentContent({})
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load KYC application')
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

  async function reviewApplication(action: 'approve' | 'reject') {
    if (!token || !selected) return
    setBusyAction(action)
    setError('')

    try {
      const body = action === 'approve'
        ? { note }
        : { note, reasonCode }
      const response = await api.post<{ data: KycApplication }>(
        `/admin/kyc/applications/${selected.id}/${action}`,
        body,
        token,
      )
      setSelected(response.data)
      await loadQueue()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${action} application`)
    } finally {
      setBusyAction(null)
    }
  }

  async function readDocument(documentId: string) {
    if (!token) return
    setBusyAction(documentId)
    setError('')

    try {
      const response = await api.get<{ data: KycDocumentContent }>(`/admin/kyc/documents/${documentId}/content`, token)
      setDocumentContent((prev) => ({ ...prev, [documentId]: response.data }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to read document object')
    } finally {
      setBusyAction(null)
    }
  }

  const canReview = selected?.status === 'PENDING_REVIEW'
  const profile = selected?.businessProfile
  const address = profile?.address

  if (state === 'loading' && applications.length === 0) {
    return <main className="mx-auto max-w-7xl px-4 py-8 text-sm text-slate-500">Загрузка...</main>
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">KYC Review</h1>
          <p className="mt-1 text-sm text-slate-500">{applications.length} pending applications</p>
        </div>
        <button
          type="button"
          onClick={() => void loadQueue()}
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

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-900">Queue</h2>
          </div>
          <div className="max-h-[calc(100vh-220px)] overflow-auto p-2">
            {applications.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-slate-400">No pending applications</p>
            ) : applications.map((application) => (
              <button
                key={application.id}
                type="button"
                onClick={() => setSelectedId(application.id)}
                className={`mb-2 w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                  selectedId === application.id
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{application.businessProfile.businessName ?? application.vendor.name}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{application.businessProfile.legalEntityName ?? application.vendor.inn}</p>
                  </div>
                  <StatusBadge value={application.status} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>{application.documents.length} docs</span>
                  <span>{formatDate(application.submittedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          {!selected ? (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-400">
              Select an application
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-white">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">{profile?.businessName ?? selected.vendor.name}</h2>
                    <p className="mt-1 text-sm text-slate-500">Application #{selected.id.slice(0, 8)} · submitted {formatDate(selected.submittedAt)}</p>
                  </div>
                  <StatusBadge value={selected.status} />
                </div>

                <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Field label="Legal entity" value={profile?.legalEntityName} />
                  <Field label="Tax ID" value={profile?.taxId ?? selected.vendor.inn} />
                  <Field label="Country" value={profile?.country} />
                  <Field label="Sales category" value={profile?.salesCategory} />
                  <Field label="Vendor status" value={selected.vendor.status} />
                  <Field label="Reviewed" value={formatDate(selected.reviewedAt)} />
                  <div className="sm:col-span-2 xl:col-span-3">
                    <Field
                      label="Address"
                      value={[address?.line1, address?.city, address?.postalCode].filter(Boolean).join(', ')}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h2 className="text-sm font-bold text-slate-900">Documents</h2>
                </div>
                <div className="space-y-3 p-4">
                  {selected.documents.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-400">No documents</p>
                  ) : selected.documents.map((document) => {
                    const content = documentContent[document.id]
                    const isImage = content?.contentType.startsWith('image/')
                    const isPdf = content?.contentType === 'application/pdf'

                    return (
                      <div key={document.id} className="rounded-lg border border-slate-200 px-3 py-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{document.fileName}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {document.documentType} · {document.contentType} · {formatBytes(document.storedSizeBytes ?? document.sizeBytes)}
                            </p>
                            {document.contentSha256 && (
                              <p className="mt-1 truncate text-xs text-slate-400">sha256 {document.contentSha256}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <StatusBadge value={document.status} />
                            <button
                              type="button"
                              onClick={() => void readDocument(document.id)}
                              disabled={busyAction !== null || document.status !== 'UPLOADED'}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              Read object
                            </button>
                          </div>
                        </div>

                        {content && (
                          <div className="mt-3 rounded-lg bg-slate-50 p-3">
                            <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                              <span>Provider {content.storageProvider}</span>
                              <span>Size {formatBytes(content.sizeBytes)}</span>
                              <span>Read audited</span>
                            </div>
                            {isImage && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={dataUrl(content)}
                                alt={content.fileName}
                                className="mt-3 max-h-80 rounded-lg border border-slate-200 bg-white object-contain"
                              />
                            )}
                            {isPdf && (
                              <object
                                data={dataUrl(content)}
                                type="application/pdf"
                                className="mt-3 h-96 w-full rounded-lg border border-slate-200 bg-white"
                              >
                                <p className="p-3 text-sm text-slate-500">PDF preview is unavailable in this browser.</p>
                              </object>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h2 className="text-sm font-bold text-slate-900">Review Decision</h2>
                </div>
                <div className="space-y-4 p-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-600">Review note</label>
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      disabled={!canReview}
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
                      placeholder="Decision note for audit and vendor notification"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-600">Reject reason</label>
                    <select
                      value={reasonCode}
                      onChange={(event) => setReasonCode(event.target.value)}
                      disabled={!canReview}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="DOCUMENTS_INSUFFICIENT">Documents insufficient</option>
                      <option value="BUSINESS_PROFILE_MISMATCH">Business profile mismatch</option>
                      <option value="UNSUPPORTED_CATEGORY">Unsupported category</option>
                      <option value="COMPLIANCE_REVIEW_FAILED">Compliance review failed</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void reviewApplication('approve')}
                      disabled={!canReview || busyAction !== null}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busyAction === 'approve' ? 'Approving...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void reviewApplication('reject')}
                      disabled={!canReview || busyAction !== null}
                      className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {busyAction === 'reject' ? 'Rejecting...' : 'Reject'}
                    </button>
                  </div>

                  {!canReview && (
                    <p className="text-sm text-slate-500">This application is already {selected.status.toLowerCase()}.</p>
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
