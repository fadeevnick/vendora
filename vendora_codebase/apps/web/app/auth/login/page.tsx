'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '../../../lib/api'

interface LoginResponse {
  data: {
    token: string
    session: {
      vendorMembership: {
        vendorId: string
      } | null
      capabilities: {
        platformAdmin: boolean
      }
    }
  }
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await api.post<LoginResponse>('/auth/login', { email, password })
      localStorage.setItem('token', response.data.token)

      if (response.data.session.vendorMembership) {
        router.push('/vendor/products')
        return
      }

      if (response.data.session.capabilities.platformAdmin) {
        router.push('/buyer/products')
        return
      }

      router.push('/buyer/products')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#2455e8' }}>
            <span className="text-white font-bold text-sm">V</span>
          </div>
          <span className="font-semibold text-slate-800 text-lg">Vendora</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Войти в аккаунт</h1>
          <p className="text-sm text-slate-500 mb-6">
            Login допускается только после email verification. Admin sign-in остаётся отдельным API path.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-600 block mb-1">Email</label>
              <input
                type="email"
                required
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600 block mb-1">Пароль</label>
              <input
                type="password"
                required
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50"
              style={{ background: '#2455e8' }}
            >
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>

          <p className="text-sm text-slate-500 text-center mt-4">
            Нет аккаунта?{' '}
            <Link href="/auth/register" className="text-blue-600 hover:underline font-medium">
              Зарегистрироваться
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
