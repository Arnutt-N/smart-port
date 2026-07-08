const API_BASE = import.meta.env.VITE_API_URL || '/api'

async function request(url, options = {}) {
  const { useAuthStore } = await import('@/stores/auth.js')
  const auth = useAuthStore()

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (auth.token) {
    headers.Authorization = `Bearer ${auth.token}`
  }

  // Add CSRF token for state-changing requests
  const method = options.method || 'GET'
  if (['POST', 'PUT', 'DELETE'].includes(method) && auth.csrfToken) {
    headers['X-CSRF-Token'] = auth.csrfToken
  }

  if (options.body instanceof FormData) {
    delete headers['Content-Type']
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  })

  if (response.status === 401) {
    auth.logout()
    const router = (await import('@/router')).default
    router.push('/login')
    throw new Error('Unauthorized')
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(error.error || response.statusText)
  }

  return response.json()
}

export function useApi() {
  return {
    get: (url) => request(url),
    post: (url, data) => request(url, { method: 'POST', body: JSON.stringify(data) }),
    put: (url, data) => request(url, { method: 'PUT', body: JSON.stringify(data) }),
    del: (url) => request(url, { method: 'DELETE' }),
    upload: (url, formData) => request(url, { method: 'POST', body: formData }),
  }
}
