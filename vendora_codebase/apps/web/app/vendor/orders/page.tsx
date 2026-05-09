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
  buyer: { id: string; email: string }
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
  DISPUTED: 'Спор',
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

const NEXT_ACTION: Record<string, { label: string; path: string }> = {
  PAYMENT_HELD: { label: 'Подтвердить', path: 'confirm' },
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

export default function VendorOrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const [shipDrafts, setShipDrafts] = useState<Record<string, { carrier: string; trackingNumber: string }>>({})
  const [disputeResponses, setDisputeResponses] = useState<Record<string, string>>({})
  const [disputeEvidenceFiles, setDisputeEvidenceFiles] = useState<Record<string, File | null>>({})

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/auth/login'); return }

    api.get<{ data: Order[] }>('/vendor/orders', token)
      .then((response) => setOrders(response.data))
      .finally(() => setLoading(false))
  }, [router])

  async function loadOrderDetail(orderId: string) {
    const token = localStorage.getItem('token')
    if (!token) return
    const response = await api.get<{ data: Order }>(`/vendor/orders/${orderId}`, token)
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, ...response.data } : o))
    setExpandedOrderId((prev) => prev === orderId ? null : orderId)
  }

  async function runAction(orderId: string, actionPath: string, body: Record<string, unknown> = {}) {
    const token = localStorage.getItem('token')
    if (!token) return
    setUpdating(orderId)
    try {
      const response = await api.post<{ data: Order }>(`/vendor/orders/${orderId}/${actionPath}`, body, token)
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, ...response.data } : o))
    } finally {
      setUpdating(null)
    }
  }

  function updateShipDraft(orderId: string, field: 'carrier' | 'trackingNumber', value: string) {
    setShipDrafts((prev) => ({
      ...prev,
      [orderId]: {
        carrier: prev[orderId]?.carrier ?? '',
        trackingNumber: prev[orderId]?.trackingNumber ?? '',
        [field]: value,
      },
    }))
  }

  function shipOrder(orderId: string) {
    const draft = shipDrafts[orderId]
    return runAction(orderId, 'ship', {
      carrier: draft?.carrier || undefined,
      trackingNumber: draft?.trackingNumber || undefined,
    })
  }

  async function respondToDispute(order: Order) {
    const token = localStorage.getItem('token')
    if (!token || !order.dispute) return
    const message = disputeResponses[order.dispute.id]?.trim()
    if (!message) return

    setUpdating(order.id)
    try {
      const evidenceFile = disputeEvidenceFiles[order.dispute.id]
      const evidence = evidenceFile ? [{
        fileName: evidenceFile.name,
        contentType: evidenceFile.type || 'application/octet-stream',
        sizeBytes: evidenceFile.size,
        contentBase64: await fileToBase64(evidenceFile),
        description: 'Vendor dispute response evidence',
      }] : undefined
      await api.post(`/vendor/disputes/${order.dispute.id}/respond`, { message, evidence }, token)
      const response = await api.get<{ data: Order }>(`/vendor/orders/${order.id}`, token)
      setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, ...response.data } : o))
      setDisputeResponses((prev) => ({ ...prev, [order.dispute!.id]: '' }))
      setDisputeEvidenceFiles((prev) => ({ ...prev, [order.dispute!.id]: null }))
    } finally {
      setUpdating(null)
    }
  }

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-8 text-slate-400">Загрузка...</div>

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Входящие заказы</h1>

      {orders.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-400">Заказов пока нет</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const next = NEXT_ACTION[order.status]
            return (
              <div key={order.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{order.buyer.email}</p>
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

                {order.status === 'CONFIRMED' && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <input
                        value={shipDrafts[order.id]?.carrier ?? ''}
                        onChange={(e) => updateShipDraft(order.id, 'carrier', e.target.value)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                        placeholder="Carrier"
                      />
                      <input
                        value={shipDrafts[order.id]?.trackingNumber ?? ''}
                        onChange={(e) => updateShipDraft(order.id, 'trackingNumber', e.target.value)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                        placeholder="Tracking number"
                      />
                      <button
                        onClick={() => void shipOrder(order.id)}
                        disabled={updating === order.id}
                        className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-all disabled:opacity-50"
                        style={{ background: '#2455e8' }}
                      >
                        {updating === order.id ? 'Обновление...' : 'Отправить'}
                      </button>
                    </div>
                  </div>
                )}

                {(next || order.status === 'PAYMENT_HELD') && (
                  <div className="px-4 pb-3 flex gap-2">
                    {next && (
                    <button
                      onClick={() => void runAction(order.id, next.path)}
                      disabled={updating === order.id}
                      className="px-4 py-2 rounded-xl text-white text-sm font-medium transition-all disabled:opacity-50"
                      style={{ background: '#2455e8' }}
                    >
                      {updating === order.id ? 'Обновление...' : next.label}
                    </button>
                    )}
                    {order.status === 'PAYMENT_HELD' && (
                      <button
                        onClick={() => void runAction(order.id, 'cancel')}
                        disabled={updating === order.id}
                        className="px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        Отменить и вернуть
                      </button>
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
                          {order.dispute.vendorResponse ? (
                            <div className="mt-3 rounded-lg bg-white px-3 py-2">
                              <p className="text-xs font-semibold text-slate-500">Ваш ответ</p>
                              <p className="mt-1 text-sm text-slate-700">{order.dispute.vendorResponse}</p>
                            </div>
                          ) : order.dispute.status === 'VENDOR_RESPONSE' ? (
                            <div className="mt-3 space-y-2">
                              <textarea
                                value={disputeResponses[order.dispute.id] ?? ''}
                                onChange={(event) => setDisputeResponses((prev) => ({ ...prev, [order.dispute!.id]: event.target.value }))}
                                rows={3}
                                className="w-full rounded-lg border border-red-100 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-red-300"
                                placeholder="Ответ покупателю и платформе"
                              />
                              <input
                                type="file"
                                onChange={(event) => setDisputeEvidenceFiles((prev) => ({ ...prev, [order.dispute!.id]: event.target.files?.[0] ?? null }))}
                                className="w-full rounded-lg border border-red-100 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-red-50 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-red-700"
                              />
                              <button
                                type="button"
                                onClick={() => void respondToDispute(order)}
                                disabled={updating === order.id || !disputeResponses[order.dispute.id]?.trim()}
                                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                              >
                                {updating === order.id ? 'Отправка...' : 'Ответить на спор'}
                              </button>
                            </div>
                          ) : null}
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
