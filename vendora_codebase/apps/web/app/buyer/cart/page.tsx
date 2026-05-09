'use client'

import { useCart } from '../../../lib/cart'
import { api } from '../../../lib/api'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'

export default function CartPage() {
  const { items, remove, clear, total } = useCart()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCheckout() {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/auth/login')
      return
    }

    setLoading(true)
    setError('')
    try {
      let serverCart = await api.get<{
        data: {
          version: number
        }
      }>('/cart', token)

      for (const item of items) {
        serverCart = await api.post<{
          data: {
            version: number
          }
        }>('/cart/items', { listingId: item.productId, quantity: item.qty }, token)
      }

      const checkout = await api.post<{
        data: {
          checkoutSessionId: string
        }
      }>(
        '/checkout/sessions',
        {
          cartVersion: serverCart.data.version,
          shippingAddress: {
            fullName: 'Vendora Buyer',
            line1: '10 Market St',
            city: 'Austin',
            postalCode: '78701',
            country: 'US',
          },
        },
        token,
        { 'Idempotency-Key': `web-checkout-${Date.now()}` },
      )

      await api.post(
        '/payments/provider/webhook',
        {
          providerEventId: `web-dev-${checkout.data.checkoutSessionId}`,
          checkoutSessionId: checkout.data.checkoutSessionId,
          eventType: 'PAYMENT_SUCCEEDED',
        },
        undefined,
        { 'x-vendora-provider-secret': 'dev-payment-secret' },
      )
      clear()
      router.push('/buyer/orders')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка оформления заказа')
    } finally {
      setLoading(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-4xl mb-4">🛒</p>
        <p className="text-lg font-semibold text-slate-700 mb-2">Корзина пуста</p>
        <p className="text-slate-400 text-sm mb-6">Добавьте товары из каталога</p>
        <Link href="/buyer/products" className="inline-block px-6 py-2.5 rounded-xl text-white text-sm font-medium" style={{ background: '#2455e8' }}>
          Перейти в каталог
        </Link>
      </div>
    )
  }

  // Группируем по vendor для отображения
  const byVendor = items.reduce<Record<string, typeof items>>((acc, item) => {
    const group = acc[item.vendorName] ?? []
    group.push(item)
    acc[item.vendorName] = group
    return acc
  }, {})

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Корзина</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {Object.entries(byVendor).map(([vendorName, vendorItems]) => (
            <div key={vendorName} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-700">{vendorName}</p>
              </div>
              <div className="divide-y divide-slate-50">
                {vendorItems.map((item) => (
                  <div key={item.productId} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{item.qty} шт. × {item.price.toLocaleString('ru-RU')} ₽</p>
                    </div>
                    <p className="text-sm font-bold text-slate-900 flex-shrink-0">
                      {(item.price * item.qty).toLocaleString('ru-RU')} ₽
                    </p>
                    <button
                      onClick={() => remove(item.productId)}
                      className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0 text-lg"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white border border-slate-200 rounded-xl p-5 sticky top-4">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Итог</h2>
            <div className="flex justify-between text-sm text-slate-600 mb-2">
              <span>Товары ({items.length})</span>
              <span className="font-medium text-slate-900">{total.toLocaleString('ru-RU')} ₽</span>
            </div>
            <div className="border-t border-slate-100 pt-3 mb-4">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-800">Итого</span>
                <span className="text-xl font-bold text-slate-900">{total.toLocaleString('ru-RU')} ₽</span>
              </div>
            </div>

            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

            <button
              onClick={handleCheckout}
              disabled={loading}
              className="w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50"
              style={{ background: '#2455e8' }}
            >
              {loading ? 'Оформление...' : 'Оформить заказ →'}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
