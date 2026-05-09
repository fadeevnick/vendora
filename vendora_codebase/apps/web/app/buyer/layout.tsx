'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useCart } from '../../lib/cart'

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { items } = useCart()
  const [isAuth] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return Boolean(window.localStorage.getItem('token'))
  })

  function logout() {
    localStorage.removeItem('token')
    router.push('/auth/login')
  }

  const NAV = [
    { href: '/buyer/products', label: 'Каталог' },
    { href: '/buyer/orders', label: 'Заказы' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#2455e8' }}>
                <span className="text-white font-bold text-xs">V</span>
              </div>
              <span className="text-sm font-bold text-slate-800">Vendora</span>
            </div>
            <nav className="flex items-center gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname.startsWith(item.href)
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1">
            <Link
              href="/buyer/cart"
              className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === '/buyer/cart'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Корзина
              {items.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-[10px] font-bold flex items-center justify-center" style={{ background: '#2455e8' }}>
                  {items.length}
                </span>
              )}
            </Link>
            {isAuth ? (
              <button
                onClick={logout}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Выйти
              </button>
            ) : (
              <Link
                href="/auth/login"
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
              >
                Войти
              </Link>
            )}
          </div>
        </div>
      </header>
      <div>{children}</div>
    </div>
  )
}
