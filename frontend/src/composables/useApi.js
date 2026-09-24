const API_BASE = import.meta.env.VITE_API_URL || '/api'

// dedupe toast "เซสชันหมดอายุ" — เมื่อ token ตก, หลาย request ชอบ 401 พร้อมกัน
// ต้องแจ้งผู้ใช้ครั้งเดียว ไม่ใช่หลาย toast ซ้อนกัน
let sessionExpiredNotified = false

async function authenticatedFetch(url, options = {}, retried = false) {
  const { useAuthStore } = await import('@/stores/auth.js')
  const auth = useAuthStore()

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  // D3: session อยู่ใน httpOnly cookies — ไม่แนบ Authorization header อีก

  // Add CSRF token for state-changing requests
  const method = options.method || 'GET'
  if (['POST', 'PUT', 'DELETE'].includes(method) && auth.csrfToken) {
    headers['X-CSRF-Token'] = auth.csrfToken
  }

  if (options.body instanceof FormData) {
    delete headers['Content-Type']
  }

  // D3: cookie session — ทุกคำขอแนบ cookies (same-origin ผ่าน /api proxy)
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    credentials: 'include',
    headers,
  })

  if (response.ok) {
    // เรียกสำเร็จ (เช่นหลังเข้าสู่ระบบใหม่) — เปิดให้แจ้งเตือน session หมดอายุได้อีกครั้ง
    sessionExpiredNotified = false
  }

  if (response.status === 401) {
    // Login 401 ต้องโชว์ข้อความจาก API (ไทย) — ห้ามกลายเป็น "Unauthorized" แล้วเด้ง logout
    const isPublicAuth =
      typeof url === 'string' &&
      (url.includes('/auth/login') || url === '/login' || url.endsWith('/login'))
    if (isPublicAuth) {
      const body = await response.clone().json().catch(() => null)
      throw new Error(body?.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    }

    // Access cookie หมดอายุ — ลองต่ออายุด้วย refresh cookie 1 ครั้ง แล้วยิงซ้ำ
    if (!retried && auth.isAuthenticated) {
      try {
        await auth.refresh()
        return authenticatedFetch(url, options, true)
      } catch (e) {
        if (e?.code === 'SESSION_CHANGED' && auth.isAuthenticated) throw e
        // refresh ล้มเหลว — ตกไป logout ด้านล่าง
      }
    }

    // แจ้งผู้ใช้ด้วย toast ไทยก่อนเด้งกลับหน้า login — dedupe กันหลาย request โชว์ซ้ำ
    if (!sessionExpiredNotified) {
      sessionExpiredNotified = true
      const { useUiStore } = await import('@/stores/ui.js')
      useUiStore().showToast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง', 'error')
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
      // backend ส่ง error ภาษาอังกฤษมากับโค้ดนี้ — บังคับข้อความไทยให้ผู้ใช้
      if (error.code === 'PASSWORD_CHANGE_REQUIRED') {
        throw new Error('กรุณาเปลี่ยนรหัสผ่านก่อนใช้งานระบบ')
      }
      throw new Error(error.error || response.statusText)
    }
    // Non-JSON response (HTML error page, 503 from cold start, etc.)
    const text = await response.text().catch(() => '')
    // N50: ข้อความ fallback ต้องเป็นไทย (ผู้ใช้กลุ่มเป้าหมายอ่านไทย)
    if (response.status === 503) {
      throw new Error('เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาลองใหม่อีกครั้ง')
    }
    if (text.includes('<br') || text.includes('<b>') || text.startsWith('<')) {
      // PHP error/warning leaked as HTML
      throw new Error('เกิดข้อผิดพลาดในเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง')
    }
    throw new Error(response.statusText || 'เชื่อมต่อไม่ได้ กรุณาลองใหม่')
  }

  // 204/205 ไม่มี body ตาม spec — คืน null แทนการโยนว่ารูปแบบผิด (กัน success กลายเป็น error)
  if (response.status === 204 || response.status === 205) {
    return null
  }

  // Response is OK (2xx) but might still be HTML if PHP errored after headers sent
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '')
    if (text.includes('<br') || text.includes('<b>') || text.trim().startsWith('<')) {
      throw new Error('เกิดข้อผิดพลาดในเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง')
    }
    throw new Error('รูปแบบการตอบกลับไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง')
  }

  return response.json()
}

/**
 * D1: ขอ signed URL รูปผ่าน useApi (GET /photos/sign) + cache ใน memory จนใกล้หมด TTL
 * ผ่าน request() เสมอ (ได้ session/cookie ฟรีตอน D3 มา) — ห้ามยิง fetch ตรง
 *
 * @param {string|null|undefined} fileName ชื่อไฟล์รูป เช่น "photo_abc.jpg"
 * @returns {Promise<string|null>} URL ที่ใช้กับ <img src> ได้ หรือ null
 */
const photoUrlCache = new Map()
export async function getSignedPhotoUrl(fileName) {
  if (!fileName) return null
  const cached = photoUrlCache.get(fileName)
  if (cached && cached.until > Date.now()) return cached.url
  const data = await request(`/photos/sign?file=${encodeURIComponent(fileName)}`)
  const signedPath = data?.url
  if (!signedPath) return null
  // ประกอบ API base เหมือน endpoint อื่น (dev proxy/nginx ตัด /api ให้เหมือนเดิม)
  const url = `${API_BASE}${signedPath}`
  // cache จนเหลืออายุ 60 วิ (TTL ฝั่ง backend 900 วิ — เผื่อเวลาโหลดรูป)
  photoUrlCache.set(fileName, { url, until: Date.now() + 840000 })
  return url
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
