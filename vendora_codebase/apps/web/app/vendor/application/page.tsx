'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../lib/api'

type LoadState = 'idle' | 'loading' | 'ready' | 'workspace-required' | 'error'

interface ApplicationAddress {
  line1: string
  city: string
  postalCode: string
}

interface BusinessProfile {
  businessName: string | null
  legalEntityName: string | null
  taxId: string | null
  country: string | null
  address: ApplicationAddress | null
  salesCategory: string | null
}

interface KycDocument {
  id: string
  documentType: string
  fileName: string
  contentType: string
  sizeBytes: number
  storedSizeBytes: number | null
  contentSha256: string | null
  storageProvider: string | null
  status: string
  createdAt: string
  completedAt: string | null
  storageConfirmedAt: string | null
}

interface VendorApplication {
  id: string
  vendorId: string
  status: string
  businessProfile: BusinessProfile
  documents: KycDocument[]
  reviewNote: string | null
  rejectionReasonCode: string | null
  submittedAt: string | null
  reviewedAt: string | null
}

interface CreateVendorResponse {
  vendor: {
    id: string
    name: string
    inn: string
    status: string
  }
  token: string
}

interface PresignDocumentResponse {
  data: {
    documentId: string
    uploadApiPath: string
  }
}

const EMPTY_ADDRESS: ApplicationAddress = {
  line1: '',
  city: '',
  postalCode: '',
}

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING_REVIEW: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
  UPLOAD_PENDING: 'bg-amber-50 text-amber-700',
  UPLOADED: 'bg-emerald-50 text-emerald-700',
}

function getErrorCode(err: unknown) {
  return err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : ''
}

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve(result.includes(',') ? result.split(',')[1] ?? '' : result)
    }
    reader.readAsDataURL(file)
  })
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[value] ?? 'bg-slate-100 text-slate-600'}`}>
      {value}
    </span>
  )
}

export default function VendorApplicationPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [application, setApplication] = useState<VendorApplication | null>(null)

  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceInn, setWorkspaceInn] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [legalEntityName, setLegalEntityName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [country, setCountry] = useState('RU')
  const [line1, setLine1] = useState('')
  const [city, setCity] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [salesCategory, setSalesCategory] = useState('')
  const [documentType, setDocumentType] = useState('BUSINESS_REGISTRATION')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const isDraft = application?.status === 'DRAFT'
  const hasUploadedDocument = useMemo(
    () => application?.documents.some((document) => document.status === 'UPLOADED') ?? false,
    [application],
  )
  const profileValid = businessName.trim().length >= 2 &&
    legalEntityName.trim().length >= 2 &&
    taxId.trim().length >= 4 &&
    country.trim().length === 2 &&
    line1.trim().length >= 2 &&
    city.trim().length >= 2 &&
    postalCode.trim().length >= 2 &&
    salesCategory.trim().length >= 2
  const workspaceValid = workspaceName.trim().length >= 2 && workspaceInn.trim().length >= 10

  const applyApplication = useCallback((next: VendorApplication) => {
    const profile = next.businessProfile
    const address = profile.address ?? EMPTY_ADDRESS

    setApplication(next)
    setBusinessName(profile.businessName ?? '')
    setLegalEntityName(profile.legalEntityName ?? '')
    setTaxId(profile.taxId ?? '')
    setCountry((profile.country ?? 'RU').toUpperCase())
    setLine1(address.line1 ?? '')
    setCity(address.city ?? '')
    setPostalCode(address.postalCode ?? '')
    setSalesCategory(profile.salesCategory ?? '')
  }, [])

  const loadApplication = useCallback(async (nextToken: string) => {
    setState('loading')
    setError('')
    setNotice('')

    try {
      const response = await api.get<{ data: VendorApplication }>('/vendor/application', nextToken)
      applyApplication(response.data)
      setState('ready')
    } catch (err: unknown) {
      if (getErrorCode(err) === 'TENANT_SCOPE_REQUIRED') {
        setState('workspace-required')
        return
      }

      setError(getErrorMessage(err, 'Не удалось загрузить KYC application'))
      setState('error')
    }
  }, [applyApplication])

  useEffect(() => {
    const savedToken = localStorage.getItem('token')
    if (!savedToken) {
      router.push('/auth/login')
      return
    }

    queueMicrotask(() => {
      setToken(savedToken)
      void loadApplication(savedToken)
    })
  }, [loadApplication, router])

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      const response = await api.post<CreateVendorResponse>('/vendors', {
        name: workspaceName.trim(),
        inn: workspaceInn.trim(),
      }, token)
      localStorage.setItem('token', response.token)
      setToken(response.token)
      setNotice(`Workspace ${response.vendor.name} создан`)
      await loadApplication(response.token)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Не удалось создать vendor workspace'))
    } finally {
      setBusy(false)
    }
  }

  async function persistProfile(nextToken = token) {
    if (!nextToken) throw new Error('Auth token is missing')

    const response = await api.put<{ data: VendorApplication }>('/vendor/application', {
      businessName: businessName.trim(),
      legalEntityName: legalEntityName.trim(),
      taxId: taxId.trim(),
      country: country.trim().toUpperCase(),
      address: {
        line1: line1.trim(),
        city: city.trim(),
        postalCode: postalCode.trim(),
      },
      salesCategory: salesCategory.trim(),
    }, nextToken)
    applyApplication(response.data)
    return response.data
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!profileValid || !token) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      await persistProfile(token)
      setNotice('Business profile сохранён')
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Не удалось сохранить профиль'))
    } finally {
      setBusy(false)
    }
  }

  async function handleUploadDocument(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !token || !isDraft) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      const presign = await api.post<PresignDocumentResponse>('/vendor/application/documents/presign', {
        documentType,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      }, token)
      const contentBase64 = await fileToBase64(file)
      await api.post(presign.data.uploadApiPath, { contentBase64 }, token)
      await loadApplication(token)
      setFile(null)
      setNotice('Документ загружен в protected storage')
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Не удалось загрузить документ'))
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmitApplication() {
    if (!token || !profileValid || !hasUploadedDocument || !isDraft) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      await persistProfile(token)
      const response = await api.post<{ data: VendorApplication }>('/vendor/application/submit', {}, token)
      applyApplication(response.data)
      setNotice('Application отправлена на review')
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Не удалось отправить application'))
    } finally {
      setBusy(false)
    }
  }

  if ((state === 'idle' || state === 'loading') && !application) {
    return <div className="px-6 py-8 text-slate-400">Загрузка...</div>
  }

  return (
    <main className="px-6 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Vendor KYC</h1>
          <p className="mt-0.5 text-sm text-slate-500">Workspace, business profile, protected document upload and review submission.</p>
        </div>
        {application && <StatusBadge value={application.status} />}
      </div>

      {notice && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {state === 'workspace-required' ? (
        <section className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-bold text-slate-900">Создать vendor workspace</h2>
          <form onSubmit={handleCreateWorkspace} className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Название</label>
              <input
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                minLength={2}
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                placeholder="Vendora Trading"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">ИНН</label>
              <input
                value={workspaceInn}
                onChange={(e) => setWorkspaceInn(e.target.value)}
                minLength={10}
                maxLength={12}
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                placeholder="7700000000"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !workspaceValid}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: '#2455e8' }}
            >
              {busy ? 'Создание...' : 'Создать workspace'}
            </button>
          </form>
        </section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-900">Business profile</h2>
            </div>
            <form onSubmit={handleSaveProfile} className="grid gap-4 p-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Business name</label>
                <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} disabled={!isDraft} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:bg-slate-50" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Legal entity</label>
                <input value={legalEntityName} onChange={(e) => setLegalEntityName(e.target.value)} disabled={!isDraft} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:bg-slate-50" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Tax ID</label>
                <input value={taxId} onChange={(e) => setTaxId(e.target.value)} disabled={!isDraft} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:bg-slate-50" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Country</label>
                <input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} disabled={!isDraft} maxLength={2} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:bg-slate-50" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Address line</label>
                <input value={line1} onChange={(e) => setLine1(e.target.value)} disabled={!isDraft} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:bg-slate-50" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">City</label>
                <input value={city} onChange={(e) => setCity(e.target.value)} disabled={!isDraft} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:bg-slate-50" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Postal code</label>
                <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} disabled={!isDraft} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:bg-slate-50" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Sales category</label>
                <input value={salesCategory} onChange={(e) => setSalesCategory(e.target.value)} disabled={!isDraft} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:bg-slate-50" />
              </div>
              <div className="flex flex-wrap gap-3 md:col-span-2">
                <button
                  type="submit"
                  disabled={busy || !isDraft || !profileValid}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  {busy ? 'Сохранение...' : 'Сохранить профиль'}
                </button>
                <button
                  type="button"
                  onClick={handleSubmitApplication}
                  disabled={busy || !isDraft || !profileValid || !hasUploadedDocument}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-50"
                  style={{ background: '#2455e8' }}
                >
                  Отправить на review
                </button>
              </div>
            </form>
          </section>

          <div className="space-y-6">
            <section className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                <h2 className="text-sm font-bold text-slate-900">Document upload</h2>
              </div>
              <form onSubmit={handleUploadDocument} className="space-y-4 p-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Type</label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    disabled={!isDraft}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:bg-slate-50"
                  >
                    <option value="BUSINESS_REGISTRATION">Business registration</option>
                    <option value="TAX_CERTIFICATE">Tax certificate</option>
                    <option value="OWNER_ID">Owner ID</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">File</label>
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    disabled={!isDraft}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 disabled:bg-slate-50"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || !isDraft || !file}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  {busy ? 'Загрузка...' : 'Загрузить документ'}
                </button>
              </form>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                <h2 className="text-sm font-bold text-slate-900">Documents</h2>
              </div>
              {!application || application.documents.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-400">Документы пока не загружены</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {application.documents.map((document) => (
                    <div key={document.id} className="px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{document.fileName}</p>
                          <p className="mt-1 text-xs text-slate-500">{document.documentType} · {formatSize(document.sizeBytes)}</p>
                        </div>
                        <StatusBadge value={document.status} />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">Uploaded: {formatDate(document.completedAt)}</p>
                      {document.contentSha256 && (
                        <p className="mt-1 truncate text-xs text-slate-400">sha256 {document.contentSha256}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </main>
  )
}
