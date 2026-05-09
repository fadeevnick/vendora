'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface CartItem {
  productId: string
  name: string
  price: number
  qty: number
  vendorName: string
}

interface CartContext {
  items: CartItem[]
  add: (item: Omit<CartItem, 'qty'>) => void
  remove: (productId: string) => void
  clear: () => void
  total: number
}

const CartCtx = createContext<CartContext | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    if (typeof window === 'undefined') {
      return []
    }

    try {
      const saved = window.localStorage.getItem('vendora_cart')
      return saved ? (JSON.parse(saved) as CartItem[]) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem('vendora_cart', JSON.stringify(items))
  }, [items])

  function add(item: Omit<CartItem, 'qty'>) {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === item.productId)
      if (existing) {
        return prev.map((i) => i.productId === item.productId ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...prev, { ...item, qty: 1 }]
    })
  }

  function remove(productId: string) {
    setItems((prev) => prev.filter((i) => i.productId !== productId))
  }

  function clear() {
    setItems([])
  }

  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0)

  return <CartCtx.Provider value={{ items, add, remove, clear, total }}>{children}</CartCtx.Provider>
}

export function useCart() {
  const ctx = useContext(CartCtx)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
