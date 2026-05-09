'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '../../../lib/api'

interface Product {
  id: string
  name: string
  description: string | null
  price: string
  stock: number
  published: boolean
  media?: { id: string; assetUrl: string; altText: string | null }[]
}

export default function VendorProductsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/auth/login'); return }

    api.get<Product[]>('/products/mine', token)
      .then(setProducts)
      .finally(() => setLoading(false))
  }, [router])

  async function publish(productId: string) {
    const token = localStorage.getItem('token')
    if (!token) return
    setPublishing(productId)
    try {
      await api.post<Product>(`/products/${productId}/publish`, {}, token)
      setProducts((prev) => prev.map((p) => p.id === productId ? { ...p, published: true } : p))
    } finally {
      setPublishing(null)
    }
  }

  if (loading) return <div className="px-6 py-8 text-slate-400">Загрузка...</div>

  return (
    <div className="px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Каталог товаров</h1>
          <p className="text-sm text-slate-500 mt-0.5">{products.length} товаров</p>
        </div>
        <Link
          href="/vendor/products/new"
          className="px-4 py-2 rounded-xl text-white text-sm font-semibold"
          style={{ background: '#2455e8' }}
        >
          + Создать товар
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl py-16 text-center">
          <p className="text-3xl mb-3">🛍️</p>
          <p className="font-semibold text-slate-700 mb-1">Товаров пока нет</p>
          <p className="text-sm text-slate-400 mb-6">Добавьте первый товар, чтобы покупатели могли его найти</p>
          <Link
            href="/vendor/products/new"
            className="inline-block px-5 py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{ background: '#2455e8' }}
          >
            Создать товар
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-3 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <span>Товар</span>
            <span className="text-right">Цена</span>
            <span className="text-right">Остаток</span>
            <span></span>
          </div>

          <div className="divide-y divide-slate-50">
            {products.map((product) => (
              <div key={product.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-4 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="h-12 w-12 shrink-0 rounded-lg bg-slate-100 bg-cover bg-center"
                    style={product.media?.[0] ? { backgroundImage: `url(${product.media[0].assetUrl})` } : undefined}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{product.name}</p>
                    {product.description && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{product.description}</p>
                    )}
                    <span className={`inline-flex mt-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${product.published ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {product.published ? 'Опубликован' : 'Черновик'}
                    </span>
                  </div>
                </div>

                <span className="text-sm font-semibold text-slate-900 text-right">
                  {Number(product.price).toLocaleString('ru-RU')} ₽
                </span>

                <span className="text-sm text-slate-500 text-right">
                  {product.stock ?? 0} шт.
                </span>

                <div>
                  {!product.published && (
                    <button
                      onClick={() => publish(product.id)}
                      disabled={publishing === product.id}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
                    >
                      {publishing === product.id ? '...' : 'Опубликовать'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
