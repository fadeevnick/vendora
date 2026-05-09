'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '../../../lib/api'

type AccountType = 'BUYER' | 'VENDOR_OWNER'

interface RegisterResponse {
  data: {
    userId: string
    email: string
    accountType: AccountType
    emailVerificationRequired: boolean
    verificationTokenExpiresInHours: number
    devVerificationToken?: string
  }
}

interface VerifyEmailResponse {
  data: {
    verified: boolean
    token: string
    session: {
      vendorMembership: {
        vendorId: string
      } | null
    }
  }
}

export default function RegisterPage() {
  const router = useRouter()
  const [accountType, setAccountType] = useState<AccountType>('BUYER')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verificationToken, setVerificationToken] = useState('')
  const [verificationEmail, setVerificationEmail] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await api.post<RegisterResponse>('/auth/register', { accountType, email, password })
      setVerificationEmail(response.data.email)
      setVerificationToken(response.data.devVerificationToken ?? '')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка регистрации')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyEmail() {
    if (!verificationToken) {
      setError('Локальный verification token недоступен')
      return
    }

    setError('')
    setVerifying(true)

    try {
      const response = await api.post<VerifyEmailResponse>('/auth/verify-email', { token: verificationToken })
      localStorage.setItem('token', response.data.token)

      if (response.data.session.vendorMembership) {
        router.push('/vendor/products')
        return
      }

      router.push('/buyer/products')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка подтверждения email')
    } finally {
      setVerifying(false)
    }
  }

  const isVerificationStep = Boolean(verificationEmail)

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
          <h1 className="text-xl font-bold text-slate-900 mb-2">
            {isVerificationStep ? 'Подтвердите email' : 'Создать аккаунт'}
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            {isVerificationStep
              ? `Для ${verificationEmail} нужен verify step перед первым входом.`
              : 'R1 runtime теперь требует email verification до первого входа.'}
          </p>

          {isVerificationStep ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-1">Dev verification token</p>
                <p className="text-sm text-blue-900 break-all">{verificationToken || 'Token будет доступен после почтовой интеграции.'}</p>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <button
                type="button"
                disabled={verifying || !verificationToken}
                onClick={handleVerifyEmail}
                className="w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50"
                style={{ background: '#2455e8' }}
              >
                {verifying ? 'Подтверждение...' : 'Подтвердить email и войти'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setVerificationEmail('')
                  setVerificationToken('')
                  setError('')
                }}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Зарегистрировать другой аккаунт
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">Тип аккаунта</label>
                <select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value as AccountType)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-white"
                >
                  <option value="BUYER">Buyer</option>
                  <option value="VENDOR_OWNER">Vendor Owner</option>
                </select>
              </div>

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
                  minLength={8}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  placeholder="Минимум 8 символов, буква и цифра"
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
                {loading ? 'Регистрация...' : 'Создать аккаунт'}
              </button>
            </form>
          )}

          <p className="text-sm text-slate-500 text-center mt-4">
            Уже есть аккаунт?{' '}
            <Link href="/auth/login" className="text-blue-600 hover:underline font-medium">
              Войти
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
