'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../lib/api'

interface Order {
  id: string
  status: string
  total: string
  createdAt: string
  shipmentCarrier?: string | null
  shipmentTrackingNumber?: string | null
  shippedAt?: string | null
  deliveredAt?: string | null
  vendor: { id: string; name: string }
  items: { id: string; qty: number; price: string; product: { id: string; name: string } }[]
  timeline?: TimelineEvent[]
  dispute?: Dispute | null
}

interface TimelineEvent {
  id: string
  code: string
  label: string
  status: string
  actor: string
  happenedAt: string
}

interface Dispute {
  id: string
  reason: string
  status: string
  vendorResponse: string | null
  vendorRespondedAt: string | null
  resolutionType: string | null
  resolvedAt: string | null
  messages?: DisputeMessage[]
  evidence?: DisputeEvidence[]
}

interface DisputeMessage {
  id: string
  actorType: string
  message: string
  createdAt: string
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
}

const STATUS_LABEL: Record<string, string> = {
  PAYMENT_HELD: 'Ожидает подтверждения',
  CONFIRMED: 'Подтверждён',
  SHIPPED: 'Отправлен',
  DELIVERED: 'Доставлен',
  COMPLETED: 'Завершён',
  CANCELLED: 'Отменён',
  DISPUTED: 'Спор открыт',
}

const STATUS_COLOR: Record<string, string> = {
  PAYMENT_HELD: 'bg-amber-50 text-amber-700',
  CONFIRMED: 'bg-blue-50 text-blue-700',
  SHIPPED: 'bg-purple-50 text-purple-700',
  DELIVERED: 'bg-cyan-50 text-cyan-700',
  COMPLETED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
  DISPUTED: 'bg-red-50 text-red-600',
}

const DISPUTE_REASONS = [
  'Не получил заказ',
  'Товар не соответствует описанию',
  'Товар повреждён',
  'Другое',
]

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

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [openDisputeId, setOpenDisputeId] = useState<string | null>(null)
  const [disputeReason, setDisputeReason] = useState(DISPUTE_REASONS[0])
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [disputeError, setDisputeError] = useState('')
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const [disputeEvidenceFiles, setDisputeEvidenceFiles] = useState<Record<string, File | null>>({})

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/auth/login'); return }

    api.get<{ data: Order[] }>('/buyer/orders', token)
      .then((response) => setOrders(response.data))
      .finally(() => setLoading(false))
  }, [router])

  function toggleDispute(orderId: string) {
    if (openDisputeId === orderId) {
      setOpenDisputeId(null)
      setDisputeReason(DISPUTE_REASONS[0])
      setDisputeError('')
      setDisputeEvidenceFiles((prev) => ({ ...prev, [orderId]: null }))
    } else {
      setOpenDisputeId(orderId)
      setDisputeReason(DISPUTE_REASONS[0])
      setDisputeError('')
      setDisputeEvidenceFiles((prev) => ({ ...prev, [orderId]: null }))
    }
  }

  async function submitDispute(orderId: string) {
    const token = localStorage.getItem('token')
    if (!token) return
    setSubmitting(orderId)
    setDisputeError('')
    try {
      const evidenceFile = disputeEvidenceFiles[orderId]
      const evidence = evidenceFile ? [{
        fileName: evidenceFile.name,
        contentType: evidenceFile.type || 'application/octet-stream',
        sizeBytes: evidenceFile.size,
        contentBase64: await fileToBase64(evidenceFile),
        description: disputeReason,
      }] : undefined
      await api.post(`/buyer/orders/${orderId}/disputes`, { reason: disputeReason, evidence }, token)
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: 'DISPUTED' } : o))
      setOpenDisputeId(null)
      setDisputeEvidenceFiles((prev) => ({ ...prev, [orderId]: null }))
    } catch (err: unknown) {
      setDisputeError(err instanceof Error ? err.message : 'Ошибка открытия спора')
    } finally {
      setSubmitting(null)
    }
  }

  async function confirmReceipt(orderId: string) {
    const token = localStorage.getItem('token')
    if (!token) return
    setSubmitting(orderId)
    try {
      const response = await api.post<{ data: Order }>(`/buyer/orders/${orderId}/confirm-receipt`, {}, token)
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: response.data.status } : o))
    } finally {
      setSubmitting(null)
    }
  }

  async function markDelivered(orderId: string) {
    const token = localStorage.getItem('token')
    if (!token) return
    setSubmitting(orderId)
    try {
      const response = await api.post<{ data: Order }>(`/buyer/orders/${orderId}/mark-delivered`, {}, token)
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, ...response.data } : o))
    } finally {
      setSubmitting(null)
    }
  }

  async function loadOrderDetail(orderId: string) {
    const token = localStorage.getItem('token')
    if (!token) return
    const response = await api.get<{ data: Order }>(`/buyer/orders/${orderId}`, token)
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, ...response.data } : o))
    setExpandedOrderId((prev) => prev === orderId ? null : orderId)
  }

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-8 text-slate-400">Загрузка...</div>

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Мои заказы</h1>

      {orders.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-400">Заказов пока нет</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const canDispute = order.status === 'SHIPPED' || order.status === 'DELIVERED' || order.status === 'COMPLETED'
            const canMarkDelivered = order.status === 'SHIPPED'
            const canConfirmReceipt = order.status === 'DELIVERED'
            const isOpen = openDisputeId === order.id

            return (
              <div key={order.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{order.vendor.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(order.createdAt).toLocaleDateString('ru-RU')} · #{order.id.slice(0, 8)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[order.status] ?? 'bg-slate-100 text-slate-500'}`}>
                      {STATUS_LABEL[order.status] ?? order.status}
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {Number(order.total).toLocaleString('ru-RU')} ₽
                    </span>
                  </div>
                </div>

                <div className="px-4 py-3 space-y-1">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm text-slate-600">
                      <span>{item.product.name}</span>
                      <span className="text-slate-400">× {item.qty}</span>
                    </div>
                  ))}
                </div>

                {(order.shipmentCarrier || order.shipmentTrackingNumber) && (
                  <div className="px-4 pb-3 text-xs text-slate-500">
                    Shipment: {order.shipmentCarrier ?? 'Carrier not set'} {order.shipmentTrackingNumber ? `· ${order.shipmentTrackingNumber}` : ''}
                  </div>
                )}

                {(canMarkDelivered || canConfirmReceipt || canDispute) && (
                  <div className="border-t border-slate-100">
                    {canMarkDelivered && !isOpen && (
                      <div className="px-4 pt-3">
                        <button
                          onClick={() => void markDelivered(order.id)}
                          disabled={submitting === order.id}
                          className="px-4 py-2 rounded-xl text-white text-sm font-medium bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {submitting === order.id ? 'Обновление...' : 'Отметить доставленным'}
                        </button>
                      </div>
                    )}
                    {canConfirmReceipt && !isOpen && (
                      <div className="px-4 pt-3">
                        <button
                          onClick={() => void confirmReceipt(order.id)}
                          disabled={submitting === order.id}
                          className="px-4 py-2 rounded-xl text-white text-sm font-medium bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          {submitting === order.id ? 'Обновление...' : 'Подтвердить получение'}
                        </button>
                      </div>
                    )}
                    {!isOpen ? (
                      <div className="px-4 py-3">
                        <button
                          onClick={() => toggleDispute(order.id)}
                          className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
                        >
                          Открыть спор
                        </button>
                      </div>
                    ) : (
                      <div className="px-4 py-4 bg-red-50/50 space-y-3">
                        <p className="text-sm font-semibold text-slate-800">Открытие спора</p>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Причина</label>
                          <select
                            value={disputeReason}
                            onChange={(e) => setDisputeReason(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-800 bg-white focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/10 transition-colors"
                          >
                            {DISPUTE_REASONS.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Evidence metadata</label>
                          <input
                            type="file"
                            onChange={(event) => setDisputeEvidenceFiles((prev) => ({ ...prev, [order.id]: event.target.files?.[0] ?? null }))}
                            className="w-full rounded-xl border border-red-100 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-red-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-red-700"
                          />
                        </div>

                        {disputeError && (
                          <p className="text-sm text-red-500">{disputeError}</p>
                        )}

                        <div className="flex gap-2">
                          <button
                            onClick={() => submitDispute(order.id)}
                            disabled={submitting === order.id}
                            className="px-4 py-2 rounded-xl text-white text-sm font-medium bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
                          >
                            {submitting === order.id ? 'Отправка...' : 'Подтвердить'}
                          </button>
                          <button
                            onClick={() => toggleDispute(order.id)}
                            disabled={submitting === order.id}
                            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="border-t border-slate-100 px-4 py-3">
                  <button
                    onClick={() => void loadOrderDetail(order.id)}
                    className="text-sm font-medium text-slate-500 hover:text-slate-800"
                  >
                    {expandedOrderId === order.id ? 'Скрыть timeline' : 'Показать timeline'}
                  </button>
                  {expandedOrderId === order.id && order.timeline && (
                    <div className="mt-3 space-y-3">
                      {order.dispute && (
                        <div className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-red-900">Спор #{order.dispute.id.slice(0, 8)}</p>
                              <p className="mt-1 text-sm text-red-800">{order.dispute.reason}</p>
                            </div>
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-red-700">{order.dispute.status}</span>
                          </div>
                          {order.dispute.vendorResponse && (
                            <div className="mt-3 rounded-lg bg-white px-3 py-2">
                              <p className="text-xs font-semibold text-slate-500">Ответ vendor</p>
                              <p className="mt-1 text-sm text-slate-700">{order.dispute.vendorResponse}</p>
                            </div>
                          )}
                          {order.dispute.resolutionType && (
                            <p className="mt-2 text-xs text-red-700">Resolution: {order.dispute.resolutionType}</p>
                          )}
                          {order.dispute.messages && order.dispute.messages.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {order.dispute.messages.map((message) => (
                                <div key={message.id} className="rounded-lg bg-white px-3 py-2">
                                  <p className="text-xs font-semibold text-slate-500">{message.actorType} · {new Date(message.createdAt).toLocaleString('ru-RU')}</p>
                                  <p className="mt-1 text-sm text-slate-700">{message.message}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {order.dispute.evidence && order.dispute.evidence.length > 0 && (
                            <div className="mt-3 rounded-lg bg-white px-3 py-2">
                              <p className="text-xs font-semibold text-slate-500">Evidence</p>
                              <div className="mt-2 space-y-1">
                                {order.dispute.evidence.map((item) => (
                                  <p key={item.id} className="text-xs text-slate-600">
                                    {item.submittedByActorType}: {item.fileName} · {Math.ceil(item.sizeBytes / 1024)} KB
                                    {item.storageConfirmedAt ? ' · stored' : ''}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="space-y-2">
                        {order.timeline.map((event) => (
                          <div key={event.id} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                            <div>
                              <p className="text-sm font-medium text-slate-800">{event.label}</p>
                              <p className="text-xs text-slate-500">{event.actor} · {event.status}</p>
                            </div>
                            <span className="shrink-0 text-xs text-slate-400">{new Date(event.happenedAt).toLocaleString('ru-RU')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
