'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../lib/api'

interface Order {
  id: string
  status: string
  total: string
  createdAt: string
  vendor: { id: string; name: string }
  items: { id: string; qty: number; price: string; product: { id: string; name: string } }[]
}

const STATUS_LABEL: Record<string, string> = {
  PAYMENT_HELD: 'Ожидает подтверждения',
  CONFIRMED: 'Подтверждён',
  SHIPPED: 'Отправлен',
  COMPLETED: 'Завершён',
  CANCELLED: 'Отменён',
  DISPUTED: 'Спор открыт',
}

const STATUS_COLOR: Record<string, string> = {
  PAYMENT_HELD: 'bg-amber-50 text-amber-700',
  CONFIRMED: 'bg-blue-50 text-blue-700',
  SHIPPED: 'bg-purple-50 text-purple-700',
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

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [openDisputeId, setOpenDisputeId] = useState<string | null>(null)
  const [disputeReason, setDisputeReason] = useState(DISPUTE_REASONS[0])
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [disputeError, setDisputeError] = useState('')

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
    } else {
      setOpenDisputeId(orderId)
      setDisputeReason(DISPUTE_REASONS[0])
      setDisputeError('')
    }
  }

  async function submitDispute(orderId: string) {
    const token = localStorage.getItem('token')
    if (!token) return
    setSubmitting(orderId)
    setDisputeError('')
    try {
      await api.post(`/buyer/orders/${orderId}/disputes`, { reason: disputeReason }, token)
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: 'DISPUTED' } : o))
      setOpenDisputeId(null)
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
            const canDispute = order.status === 'SHIPPED' || order.status === 'COMPLETED'
            const canConfirmReceipt = order.status === 'SHIPPED'
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

                {(canConfirmReceipt || canDispute) && (
                  <div className="border-t border-slate-100">
                    {canConfirmReceipt && !isOpen && (
                      <div className="px-4 pt-3">
                        <button
                          onClick={() => confirmReceipt(order.id)}
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
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
