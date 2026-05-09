'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../lib/api'

interface Order {
  id: string
  status: string
  total: string
  createdAt: string
  buyer: { id: string; email: string }
  items: { id: string; qty: number; price: string; product: { id: string; name: string } }[]
}

const STATUS_LABEL: Record<string, string> = {
  PAYMENT_HELD: 'Ожидает подтверждения',
  CONFIRMED: 'Подтверждён',
  SHIPPED: 'Отправлен',
  COMPLETED: 'Завершён',
  CANCELLED: 'Отменён',
  DISPUTED: 'Спор',
}

const STATUS_COLOR: Record<string, string> = {
  PAYMENT_HELD: 'bg-amber-50 text-amber-700',
  CONFIRMED: 'bg-blue-50 text-blue-700',
  SHIPPED: 'bg-purple-50 text-purple-700',
  COMPLETED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
  DISPUTED: 'bg-red-50 text-red-600',
}

const NEXT_ACTION: Record<string, { label: string; path: string }> = {
  PAYMENT_HELD: { label: 'Подтвердить', path: 'confirm' },
  CONFIRMED: { label: 'Отметить отправленным', path: 'ship' },
}

export default function VendorOrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/auth/login'); return }

    api.get<{ data: Order[] }>('/vendor/orders', token)
      .then((response) => setOrders(response.data))
      .finally(() => setLoading(false))
  }, [router])

  async function runAction(orderId: string, actionPath: string) {
    const token = localStorage.getItem('token')
    if (!token) return
    setUpdating(orderId)
    try {
      const response = await api.post<{ data: Order }>(`/vendor/orders/${orderId}/${actionPath}`, {}, token)
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: response.data.status } : o))
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

                {(next || order.status === 'PAYMENT_HELD') && (
                  <div className="px-4 pb-3 flex gap-2">
                    {next && (
                    <button
                      onClick={() => runAction(order.id, next.path)}
                      disabled={updating === order.id}
                      className="px-4 py-2 rounded-xl text-white text-sm font-medium transition-all disabled:opacity-50"
                      style={{ background: '#2455e8' }}
                    >
                      {updating === order.id ? 'Обновление...' : next.label}
                    </button>
                    )}
                    {order.status === 'PAYMENT_HELD' && (
                      <button
                        onClick={() => runAction(order.id, 'cancel')}
                        disabled={updating === order.id}
                        className="px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        Отменить и вернуть
                      </button>
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
