'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const NAV = [
  { href: '/vendor/products', label: 'Каталог', icon: '🛍️' },
  { href: '/vendor/orders', label: 'Заказы', icon: '📋' },
]

export function VendorSidebar() {
  const pathname = usePathname()
  const router = useRouter()

  function logout() {
    localStorage.removeItem('token')
    router.push('/auth/login')
  }

  return (
    <aside className="w-52 flex-shrink-0 flex flex-col bg-white border-r border-slate-100 min-h-screen pt-4 pb-6">
      <div className="px-4 mb-6 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#2455e8' }}>
          <span className="text-white font-bold text-sm">V</span>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-800">Vendora</p>
          <p className="text-xs text-slate-400">Seller Portal</p>
        </div>
      </div>

      <nav className="px-3 space-y-0.5 flex-1">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-3">
        <button
          onClick={logout}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors w-full"
        >
          <span className="text-base">→</span>
          Выйти
        </button>
      </div>
    </aside>
  )
}
