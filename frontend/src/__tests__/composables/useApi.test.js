import { beforeEach, describe, expect, it, vi } from 'vitest'

// mutable auth mock (hoisted) — ปรับ isAuthenticated/refresh ต่อ test เพื่อทดสอบ 401 -> refresh -> retry
const authMock = vi.hoisted(() => ({
  state: {
    csrfToken: 'fake-csrf',
    isAuthenticated: false,
    logout: () => {},
    setMustChangePassword: () => {},
    refresh: () => Promise.resolve({}),
  },
}))

const mockPush = vi.fn()

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => authMock.state,
}))

const uiMock = vi.hoisted(() => ({
  showToast: vi.fn(),
}))

vi.mock('@/stores/ui.js', () => ({
  useUiStore: () => ({ showToast: uiMock.showToast }),
}))

vi.mock('@/router', () => ({
  default: { push: (...args) => mockPush(...args) },
}))

const { useApi, getSignedPhotoUrl } = await import('@/composables/useApi.js')

function mockFetch(response) {
  return vi.fn().mockResolvedValue(response)
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    clone: () => jsonResponse(body, status),
  }
}

function htmlResponse(html, status = 500) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'text/html; charset=UTF-8' }),
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(html),
    clone: () => htmlResponse(html, status),
  }
}

describe('getSignedPhotoUrl', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  it('requests a signed URL and prefixes it with the API base', async () => {
    global.fetch = mockFetch(jsonResponse({ url: '/uploads/photo_abc.jpg?exp=999&sig=deadbeef' }))
    const url = await getSignedPhotoUrl('photo_abc.jpg')
    expect(url).toBe('/api/uploads/photo_abc.jpg?exp=999&sig=deadbeef')
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toContain('/photos/sign?file=photo_abc.jpg')
  })

  it('serves repeat views from cache without refetching', async () => {
    global.fetch = mockFetch(jsonResponse({ url: '/uploads/cached.jpg?exp=999&sig=x' }))
    const first = await getSignedPhotoUrl('cached.jpg')
    const second = await getSignedPhotoUrl('cached.jpg')
    expect(second).toBe(first)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('refetches after the cache entry expires', async () => {
    global.fetch = mockFetch(jsonResponse({ url: '/uploads/aging.jpg?exp=999&sig=x' }))
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000000)
    await getSignedPhotoUrl('aging.jpg')
    nowSpy.mockReturnValue(1000000 + 840001)
    await getSignedPhotoUrl('aging.jpg')
    expect(global.fetch).toHaveBeenCalledTimes(2)
    nowSpy.mockRestore()
  })

  it('returns null for empty input or missing url without fetching', async () => {
    global.fetch = mockFetch(jsonResponse({}))
    await expect(getSignedPhotoUrl(null)).resolves.toBeNull()
    await expect(getSignedPhotoUrl('')).resolves.toBeNull()
    await expect(getSignedPhotoUrl(undefined)).resolves.toBeNull()
    await expect(getSignedPhotoUrl('ghost.jpg')).resolves.toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})

describe('no direct uploads composition (grep guard)', () => {
  it('composables never build /uploads/ URLs inline and apiAssetUrl is gone', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, resolve } = await import('node:path')
    const here = dirname(fileURLToPath(import.meta.url))
    for (const rel of ['../../composables/useApi.js', '../../composables/useProfile.js']) {
      const src = readFileSync(resolve(here, rel), 'utf8')
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
      expect(code).not.toContain('uploads/')
    }
    const mod = await import('@/composables/useApi.js')
    expect('apiAssetUrl' in mod).toBe(false)
  })
})

describe('useApi', () => {
  let api

  beforeEach(() => {
    api = useApi()
    mockPush.mockReset()
    uiMock.showToast.mockReset()
    authMock.state.csrfToken = 'fake-csrf'
    authMock.state.isAuthenticated = false
    authMock.state.logout = vi.fn()
    authMock.state.setMustChangePassword = vi.fn()
    authMock.state.refresh = vi.fn().mockResolvedValue({})
    // เคลียร์ assignment จากเทสต์ก่อน (อย่าใช้ restoreAllMocks — มันทำให้ spy ทับ mock ค้าง)
    globalThis.fetch = vi.fn()
  })

  describe('HTML-detection branches', () => {
    it('throws clean error when non-ok response is HTML (PHP error leaked)', async () => {
      global.fetch = mockFetch(htmlResponse('<br /><b>Warning</b>: Undefined variable'))
      // N50: ข้อความ fallback เป็นภาษาไทย
      await expect(api.get('/test')).rejects.toThrow('เกิดข้อผิดพลาดในเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง')
    })

    it('throws database error message on 503 HTML response', async () => {
      global.fetch = mockFetch(htmlResponse('<html><body>Service Unavailable</body></html>', 503))
      await expect(api.get('/test')).rejects.toThrow('เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาลองใหม่อีกครั้ง')
    })

    it('throws clean error when 2xx response is HTML (PHP errored after headers sent)', async () => {
      global.fetch = mockFetch(htmlResponse('<br /><b>Fatal error</b>: Allowed memory exhausted', 200))
      await expect(api.get('/test')).rejects.toThrow('เกิดข้อผิดพลาดในเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง')
    })

    it('throws invalid response format for non-JSON 2xx without HTML markers', async () => {
      global.fetch = mockFetch({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        json: () => Promise.reject(new Error('not json')),
        text: () => Promise.resolve('plain text response'),
        clone: () => ({ json: () => Promise.reject(new Error('not json')), text: () => Promise.resolve('plain text response') }),
      })
      await expect(api.get('/test')).rejects.toThrow('รูปแบบการตอบกลับไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง')
    })
  })

  describe('JSON error handling', () => {
    it('throws error message from JSON error response', async () => {
      global.fetch = mockFetch(jsonResponse({ error: 'ไม่พบข้อมูล' }, 404))
      await expect(api.get('/test')).rejects.toThrow('ไม่พบข้อมูล')
    })

    it('falls back to statusText when JSON has no error field', async () => {
      global.fetch = mockFetch({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('{}'),
        clone: () => ({ json: () => Promise.resolve({}), text: () => Promise.resolve('{}') }),
      })
      await expect(api.get('/test')).rejects.toThrow('Internal Server Error')
    })

    it('throws statusText when error body is not JSON', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('oops', {
        status: 500,
        statusText: 'Internal Server Error',
      }))

      await expect(api.get('/boom')).rejects.toThrow('Internal Server Error')
    })
  })

  describe('successful responses', () => {
    it('returns parsed JSON on success', async () => {
      const data = { success: true, data: [{ id: 1 }] }
      global.fetch = mockFetch(jsonResponse(data))
      const result = await api.get('/test')
      expect(result).toEqual(data)
    })
  })

  describe('methods and uploads', () => {
    it('attaches cookies with CSRF headers without overriding multipart content type', async () => {
      const response = new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
      globalThis.fetch = vi.fn().mockResolvedValue(response)
      const form = new FormData()
      form.append('file', new File(['xlsx'], 'people.xlsx'))

      const result = await api.uploadResponse('/import/executive', form)

      expect(result).toBe(response)
      expect(globalThis.fetch).toHaveBeenCalledOnce()
      const [, options] = globalThis.fetch.mock.calls[0]
      expect(options.method).toBe('POST')
      expect(options.body).toBe(form)
      expect(options.credentials).toBe('include')
      expect(options.headers).not.toHaveProperty('Authorization')
      expect(options.headers['X-CSRF-Token']).toBe('fake-csrf')
      expect(options.headers).not.toHaveProperty('Content-Type')
    })

    it('put and del send the correct methods and parse JSON', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }))

      await expect(api.put('/users/1', { role: 'admin' })).resolves.toEqual({ success: true })
      expect(globalThis.fetch.mock.calls[0][1].method).toBe('PUT')

      await expect(api.del('/users/1')).resolves.toEqual({ success: true })
      expect(globalThis.fetch.mock.calls[1][1].method).toBe('DELETE')
    })

    it('upload posts FormData without forcing JSON content-type', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        success: true,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      const form = new FormData()
      form.append('file', new File(['x'], 'a.xlsx'))

      await expect(api.upload('/import/executive', form)).resolves.toEqual({ success: true })
      expect(globalThis.fetch.mock.calls[0][1].body).toBe(form)
      expect(globalThis.fetch.mock.calls[0][1].headers).not.toHaveProperty('Content-Type')
    })
  })

  describe('401 and 403 handling', () => {
    it('refreshes then retries the original request once on 401', async () => {
      authMock.state.isAuthenticated = true
      const payload = { ok: true, value: 42 }
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401))
        .mockResolvedValueOnce(jsonResponse(payload))

      const result = await api.get('/protected')

      expect(authMock.state.refresh).toHaveBeenCalledTimes(1)
      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(result).toEqual(payload)
      expect(authMock.state.logout).not.toHaveBeenCalled()
    })

    it('logs out when refresh fails', async () => {
      authMock.state.isAuthenticated = true
      authMock.state.refresh = vi.fn().mockRejectedValue(new Error('Refresh failed'))
      global.fetch = mockFetch(jsonResponse({ error: 'Unauthorized' }, 401))

      await expect(api.get('/protected')).rejects.toThrow('Unauthorized')
      expect(authMock.state.refresh).toHaveBeenCalledTimes(1)
      expect(authMock.state.logout).toHaveBeenCalledTimes(1)
    })

    it('does not logout when refresh reports a session change with a new session active', async () => {
      authMock.state.isAuthenticated = true
      const stale = new Error('Session changed during refresh')
      stale.code = 'SESSION_CHANGED'
      authMock.state.refresh = vi.fn().mockRejectedValue(stale)
      authMock.state.isAuthenticated = true
      global.fetch = mockFetch(jsonResponse({ error: 'Unauthorized' }, 401))

      await expect(api.get('/protected')).rejects.toThrow('Session changed during refresh')
      expect(authMock.state.logout).not.toHaveBeenCalled()
      expect(mockPush).not.toHaveBeenCalled()
    })

    it('logs out when refresh reports a session change with no active session', async () => {
      authMock.state.isAuthenticated = true
      const stale = new Error('Session changed during refresh')
      stale.code = 'SESSION_CHANGED'
      authMock.state.refresh = vi.fn().mockRejectedValue(stale)
      authMock.state.isAuthenticated = false
      global.fetch = mockFetch(jsonResponse({ error: 'Unauthorized' }, 401))

      await expect(api.get('/protected')).rejects.toThrow('Unauthorized')
      expect(authMock.state.logout).toHaveBeenCalledTimes(1)
      expect(mockPush).toHaveBeenCalledWith('/login')
    })

    it('logs out immediately when not authenticated', async () => {
      authMock.state.isAuthenticated = false
      global.fetch = mockFetch(jsonResponse({ error: 'Unauthorized' }, 401))

      await expect(api.get('/protected')).rejects.toThrow('Unauthorized')
      expect(authMock.state.refresh).not.toHaveBeenCalled()
      expect(authMock.state.logout).toHaveBeenCalledTimes(1)
      expect(mockPush).toHaveBeenCalledWith('/login')
    })

    it('shows the Thai expired-session toast once before redirecting on 401', async () => {
      authMock.state.isAuthenticated = false
      // เรียกสำเร็จ 1 ครั้งก่อน — เคลียร์ latch (หลังเข้าสู่ระบบใหม่ flag จะถูกรีเซ็ต)
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ ok: true }))
        .mockResolvedValue(jsonResponse({ error: 'Unauthorized' }, 401))

      await api.get('/warmup')
      await expect(api.get('/protected')).rejects.toThrow('Unauthorized')

      expect(uiMock.showToast).toHaveBeenCalledTimes(1)
      expect(uiMock.showToast).toHaveBeenCalledWith('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง', 'error')
      expect(mockPush).toHaveBeenCalledWith('/login')
    })

    it('does not repeat the expired-session toast for follow-up 401s before re-login', async () => {
      authMock.state.isAuthenticated = false
      // เรียกสำเร็จ 1 ครั้งก่อน — เคลียร์ latch (หลังเข้าสู่ระบบใหม่ flag จะถูกรีเซ็ต)
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ ok: true }))
        .mockResolvedValue(jsonResponse({ error: 'Unauthorized' }, 401))

      await api.get('/warmup')
      await expect(api.get('/first')).rejects.toThrow('Unauthorized')
      await expect(api.get('/second')).rejects.toThrow('Unauthorized')

      // 401 สองครั้งติดกัน (session ตกครั้งเดียว) — toast ต้องโชว์ครั้งเดียว ไม่ซ้ำ
      expect(uiMock.showToast).toHaveBeenCalledTimes(1)
      expect(uiMock.showToast).toHaveBeenCalledWith('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง', 'error')
      expect(authMock.state.logout).toHaveBeenCalledTimes(2)
    })

    it('does not refresh on /auth/login 401 (shows API error instead)', async () => {
      authMock.state.isAuthenticated = true
      global.fetch = mockFetch(jsonResponse({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, 401))

      await expect(api.post('/auth/login', {})).rejects.toThrow('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
      expect(authMock.state.refresh).not.toHaveBeenCalled()
      expect(authMock.state.logout).not.toHaveBeenCalled()
    })

    it('redirects when the backend requires a password change', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: 'Password change required',
        code: 'PASSWORD_CHANGE_REQUIRED',
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }))

      await expect(api.get('/dashboard')).rejects.toThrow('กรุณาเปลี่ยนรหัสผ่านก่อนใช้งานระบบ')

      expect(authMock.state.setMustChangePassword).toHaveBeenCalledWith(true)
      expect(mockPush).toHaveBeenCalledWith('/change-password')
    })
  })

  describe('cookie transport (D3)', () => {
    it('sends cookies with every request and never an Authorization header', async () => {
      global.fetch = mockFetch(jsonResponse({ ok: true }))
      await api.get('/test')
      const [, options] = global.fetch.mock.calls[0]
      expect(options.credentials).toBe('include')
      expect(options.headers).not.toHaveProperty('Authorization')
    })

    it('attaches the CSRF header on state-changing requests', async () => {
      global.fetch = mockFetch(jsonResponse({ ok: true }))
      await api.post('/test', { a: 1 })
      const [, options] = global.fetch.mock.calls[0]
      expect(options.credentials).toBe('include')
      expect(options.headers['X-CSRF-Token']).toBe('fake-csrf')
    })
  })

  describe('empty success responses', () => {
    it('resolves null on 204 No Content instead of throwing', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
      await expect(api.del('/anything')).resolves.toBeNull()
    })

    it('resolves null on 205 Reset Content', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 205 }))
      await expect(api.get('/test')).resolves.toBeNull()
    })
  })
})
