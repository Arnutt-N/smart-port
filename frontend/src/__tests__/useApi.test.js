import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => ({
    token: 'fake-jwt-token',
    csrfToken: 'fake-csrf',
    logout: vi.fn(),
    setMustChangePassword: vi.fn(),
  }),
}))

vi.mock('@/router', () => ({
  default: { push: vi.fn() },
}))

const { useApi } = await import('@/composables/useApi.js')

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

describe('useApi', () => {
  let api

  beforeEach(() => {
    api = useApi()
    vi.restoreAllMocks()
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
  })

  describe('successful responses', () => {
    it('returns parsed JSON on success', async () => {
      const data = { success: true, data: [{ id: 1 }] }
      global.fetch = mockFetch(jsonResponse(data))
      const result = await api.get('/test')
      expect(result).toEqual(data)
    })
  })
})
