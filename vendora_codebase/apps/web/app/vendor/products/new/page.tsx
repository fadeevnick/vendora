'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '../../../../lib/api'

interface Product {
  id: string
  name: string
  status: string
}

export default function NewProductPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(andPublish: boolean) {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/auth/login'); return }

    setLoading(true)
    setError('')
    try {
      const product = await api.post<Product>('/products', {
        name,
        description: description || undefined,
        price: Number(price),
        stock: stock ? Number(stock) : undefined,
      }, token)

      if (andPublish) {
        await api.post(`/products/${product.id}/publish`, {}, token)
      }

      router.push('/vendor/products')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка создания товара')
    } finally {
      setLoading(false)
    }
  }

  const isValid = name.trim().length >= 2 && Number(price) > 0

  return (
    <div className="px-6 py-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/vendor/products"
          className="text-slate-400 hover:text-slate-600 transition-colors text-sm"
        >
          ← Назад
        </Link>
        <h1 className="text-xl font-bold text-slate-900">Новый товар</h1>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(false) }} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
            Название <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Ноутбук Dell Latitude 5540"
            required
            minLength={2}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Описание</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Краткое описание товара..."
            rows={3}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-colors resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Цена, ₽ <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              required
              min="0"
              step="0.01"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Остаток, шт.</label>
            <input
              type="number"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder="0"
              min="0"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-colors"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-500 bg-red-50 px-3 py-2.5 rounded-xl">{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={loading || !isValid}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
          >
            {loading ? 'Сохранение...' : 'Сохранить как черновик'}
          </button>
          <button
            type="button"
            disabled={loading || !isValid}
            onClick={() => handleSubmit(true)}
            className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: '#2455e8' }}
          >
            {loading ? 'Публикация...' : 'Создать и опубликовать'}
          </button>
        </div>
      </form>
    </div>
  )
}
