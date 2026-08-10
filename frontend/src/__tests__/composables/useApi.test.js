import { beforeEach, describe, expect, it, vi } from 'vitest'

// mutable auth mock (hoisted) — ปรับ refreshToken/refresh ต่อ test เพื่อทดสอบ 401 -> refresh -> retry
const authMock = vi.hoisted(() => ({
  state: {
    token: 'fake-jwt-token',
    csrfToken: 'fake-csrf',
    refreshToken: '',
    logout: () => {},
    setMustChangePassword: () => {},
    refresh: () => Promise.resolve({}),
  },
}))

const mockPush = vi.fn()

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => authMock.state,
}))

vi.mock('@/router', () => ({
  default: { push: (...args) => mockPush(...args) },
}))

const { useApi, apiAssetUrl } = await import('@/composables/useApi.js')

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

describe('apiAssetUrl', () => {
  it('prefixes a relative backend path with the API base', () => {
    expect(apiAssetUrl('uploads/photo_abc.jpg')).toBe('/api/uploads/photo_abc.jpg')
  })

  it('does not double the slash when the path already starts with one', () => {
    expect(apiAssetUrl('/uploads/photo_abc.jpg')).toBe('/api/uploads/photo_abc.jpg')
  })

  it('leaves absolute URLs untouched', () => {
    expect(apiAssetUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg')
  })

  it('returns null for empty input so callers can hide the image', () => {
    expect(apiAssetUrl(null)).toBeNull()
    expect(apiAssetUrl('')).toBeNull()
    expect(apiAssetUrl(undefined)).toBeNull()
  })
})

describe('useApi', () => {
  let api

  beforeEach(() => {
    api = useApi()
    mockPush.mockReset()
    authMock.state.token = 'fake-jwt-token'
    authMock.state.csrfToken = 'fake-csrf'
    authMock.state.refreshToken = ''
    authMock.state.logout = vi.fn()
    authMock.state.setMustChangePassword = vi.fn()
    authMock.state.refresh = vi.fn().mockResolvedValue({})
    // เคลียร์ assignment จากเทสต์ก่อน (อย่าใช้ restoreAllMocks — มันทำให้ spy ทับ mock ค้าง)
    globalThis.fetch = vi.fn()
  })

  describe('HTML-detection branches', () => {
    it('throws clean error when non-ok response is HTML (PHP error leaked)', async () => {
      global.fetch = mockFetch(htmlResponse('<br /><b>Warning</b>: Undefined variable'))
      await expect(api.get('/test')).rejects.toThrow('Server error. Please try again.')
    })

    it('throws database error message on 503 HTML response', async () => {
      global.fetch = mockFetch(htmlResponse('<html><body>Service Unavailable</body></html>', 503))
      await expect(api.get('/test')).rejects.toThrow('Database connection failed. Please try again.')
    })

    it('throws clean error when 2xx response is HTML (PHP errored after headers sent)', async () => {
      global.fetch = mockFetch(htmlResponse('<br /><b>Fatal error</b>: Allowed memory exhausted', 200))
      await expect(api.get('/test')).rejects.toThrow('Server error. Please try again.')
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
      await expect(api.get('/test')).rejects.toThrow('Invalid response format. Please try again.')
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
    it('adds authentication and CSRF headers without overriding multipart content type', async () => {
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
      expect(options.headers.Authorization).toBe('Bearer fake-jwt-token')
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
      authMock.state.refreshToken = 'refresh-abc'
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
      authMock.state.refreshToken = 'refresh-abc'
      authMock.state.refresh = vi.fn().mockRejectedValue(new Error('Refresh failed'))
      global.fetch = mockFetch(jsonResponse({ error: 'Unauthorized' }, 401))

      await expect(api.get('/protected')).rejects.toThrow('Unauthorized')
      expect(authMock.state.refresh).toHaveBeenCalledTimes(1)
      expect(authMock.state.logout).toHaveBeenCalledTimes(1)
    })

    it('logs out immediately when there is no refresh token', async () => {
      authMock.state.refreshToken = ''
      global.fetch = mockFetch(jsonResponse({ error: 'Unauthorized' }, 401))

      await expect(api.get('/protected')).rejects.toThrow('Unauthorized')
      expect(authMock.state.refresh).not.toHaveBeenCalled()
      expect(authMock.state.logout).toHaveBeenCalledTimes(1)
      expect(mockPush).toHaveBeenCalledWith('/login')
    })

    it('does not refresh on /auth/login 401 (shows API error instead)', async () => {
      authMock.state.refreshToken = 'refresh-abc'
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

      await expect(api.get('/dashboard')).rejects.toThrow('Password change required')

      expect(authMock.state.setMustChangePassword).toHaveBeenCalledWith(true)
      expect(mockPush).toHaveBeenCalledWith('/change-password')
    })
  })
})
