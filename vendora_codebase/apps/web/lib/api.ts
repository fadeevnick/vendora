const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

function buildRequestError(payload: unknown) {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const errorPayload = payload.error as string | { code?: string; message?: string }

    if (typeof errorPayload === 'string') {
      return new Error(errorPayload)
    }

    const err = new Error(errorPayload.message ?? 'Request failed') as Error & { code?: string }
    err.code = errorPayload.code
    return err
  }

  return new Error('Request failed')
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const { headers: optHeaders, ...rest } = options ?? {}
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...optHeaders },
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw buildRequestError(error)
  }

  return res.json()
}

export const api = {
  get: <T>(path: string, token?: string) =>
    request<T>(path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  post: <T>(path: string, body: unknown, token?: string, extraHeaders?: Record<string, string>) =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(extraHeaders ?? {}),
      },
    }),

  put: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  patch: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
}
