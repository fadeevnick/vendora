'use client'

import { useCart } from '../../../lib/cart'

interface Product {
  id: string
  name: string
  description: string | null
  price: string
  stock: number
  vendor: { id: string; name: string }
}

export function ProductCard({ product }: { product: Product }) {
  const { add, items } = useCart()
  const inCart = items.some((i) => i.productId === product.id)

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex flex-col">
      <p className="text-xs text-slate-400 mb-1">{product.vendor.name}</p>
      <h2 className="text-base font-semibold text-slate-800 mb-1">{product.name}</h2>
      {product.description && (
        <p className="text-sm text-slate-500 mb-3 line-clamp-2">{product.description}</p>
      )}
      <div className="flex items-center justify-between mt-auto mb-3">
        <span className="text-lg font-bold text-slate-900">
          {Number(product.price).toLocaleString('ru-RU')} ₽
        </span>
        <span className="text-xs text-slate-400">В наличии: {product.stock}</span>
      </div>
      <button
        onClick={() => add({ productId: product.id, name: product.name, price: Number(product.price), vendorName: product.vendor.name })}
        disabled={inCart}
        className="w-full py-2 rounded-xl text-white text-sm font-medium transition-all disabled:opacity-50"
        style={{ background: '#2455e8' }}
      >
        {inCart ? '✓ В корзине' : 'В корзину'}
      </button>
    </div>
  )
}
