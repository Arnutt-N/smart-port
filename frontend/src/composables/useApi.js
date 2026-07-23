const API_BASE = import.meta.env.VITE_API_URL || '/api'

async function authenticatedFetch(url, options = {}, retried = false) {
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
    // Login 401 ต้องโชว์ข้อความจาก API (ไทย) — ห้ามกลายเป็น "Unauthorized" แล้วเด้ง logout
    const isPublicAuth =
      typeof url === 'string' &&
      (url.includes('/auth/login') || url === '/login' || url.endsWith('/login'))
    if (isPublicAuth) {
      const body = await response.clone().json().catch(() => null)
      throw new Error(body?.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    }

    // Access token หมดอายุ — ลองต่ออายุด้วย refresh token 1 ครั้ง แล้วยิงซ้ำ
    if (!retried && auth.refreshToken) {
      try {
        await auth.refresh()
        return authenticatedFetch(url, options, true)
      } catch {
        // refresh ล้มเหลว — ตกไป logout ด้านล่าง
      }
    }

    auth.logout()
    const router = (await import('@/router')).default
    router.push('/login')
    throw new Error('Unauthorized')
  }

  if (response.status === 403) {
    const body = await response.clone().json().catch(() => null)
    if (body?.code === 'PASSWORD_CHANGE_REQUIRED') {
      auth.setMustChangePassword(true)
      const router = (await import('@/router')).default
      router.push('/change-password')
    }
  }

  return response
}

async function request(url, options = {}) {
  const response = await authenticatedFetch(url, options)

  if (!response.ok) {
    // Try to parse JSON error; if the body is HTML (PHP error leaked), produce a clean Thai message
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.error || response.statusText)
    }
    // Non-JSON response (HTML error page, 503 from cold start, etc.)
    const text = await response.text().catch(() => '')
    if (response.status === 503) {
      throw new Error('Database connection failed. Please try again.')
    }
    if (text.includes('<br') || text.includes('<b>') || text.startsWith('<')) {
      // PHP error/warning leaked as HTML
      throw new Error('Server error. Please try again.')
    }
    throw new Error(response.statusText || 'Connection error')
  }

  // Response is OK (2xx) but might still be HTML if PHP errored after headers sent
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '')
    if (text.includes('<br') || text.includes('<b>') || text.trim().startsWith('<')) {
      throw new Error('Server error. Please try again.')
    }
    throw new Error('Invalid response format. Please try again.')
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
    uploadResponse: (url, formData) => authenticatedFetch(url, { method: 'POST', body: formData }),
  }
}
