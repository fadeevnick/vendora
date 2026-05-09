import Link from 'next/link'
import { api } from '../../../lib/api'
import { ProductCard } from './ProductCard'

export const dynamic = 'force-dynamic'

interface Product {
  id: string
  name: string
  description: string | null
  price: string
  stock: number
  media?: { id: string; assetUrl: string; altText: string | null }[]
  vendor: { id: string; name: string }
}

export default async function ProductsPage() {
  const products = await api.get<Product[]>('/products')

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Каталог товаров</h1>
        <Link href="/buyer/cart" className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
          🛒 Корзина
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="text-slate-500">Товаров пока нет</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </main>
  )
}
