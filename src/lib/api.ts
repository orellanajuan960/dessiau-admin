const BASE = ''

export async function fetcher<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Error de servidor' }))
    throw new Error(error.error || error.message || `Error ${res.status}`)
  }
  return res.json()
}

export const api = {
  get: <T>(url: string) => fetcher<T>(url),
  post: <T>(url: string, data?: unknown) =>
    fetcher<T>(url, { method: 'POST', body: JSON.stringify(data) }),
  put: <T>(url: string, data?: unknown) =>
    fetcher<T>(url, { method: 'PUT', body: JSON.stringify(data) }),
  del: <T>(url: string) => fetcher<T>(url, { method: 'DELETE' }),
}
