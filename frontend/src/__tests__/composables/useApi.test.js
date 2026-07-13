import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuth = {
  token: 'jwt-token',
  csrfToken: 'csrf-token',
  logout: vi.fn(),
  setMustChangePassword: vi.fn(),
}
const mockPush = vi.fn()

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => mockAuth,
}))

vi.mock('@/router', () => ({
  default: { push: mockPush },
}))

const { useApi } = await import('@/composables/useApi.js')

describe('useApi uploads', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockAuth.logout.mockReset()
    mockAuth.setMustChangePassword.mockReset()
    mockPush.mockReset()
  })

  it('adds authentication and CSRF headers without overriding multipart content type', async () => {
    const response = new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
    const form = new FormData()
    form.append('file', new File(['xlsx'], 'people.xlsx'))

    const result = await useApi().uploadResponse('/import/executive', form)

    expect(result).toBe(response)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [, options] = fetchMock.mock.calls[0]
    expect(options.method).toBe('POST')
    expect(options.body).toBe(form)
    expect(options.headers.Authorization).toBe('Bearer jwt-token')
    expect(options.headers['X-CSRF-Token']).toBe('csrf-token')
    expect(options.headers).not.toHaveProperty('Content-Type')
  })

  it('redirects when the backend requires a password change', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: 'Password change required',
      code: 'PASSWORD_CHANGE_REQUIRED',
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }))

    await expect(useApi().get('/dashboard')).rejects.toThrow('Password change required')

    expect(mockAuth.setMustChangePassword).toHaveBeenCalledWith(true)
    expect(mockPush).toHaveBeenCalledWith('/change-password')
  })

  it('surfaces Thai login error on 401 without logout redirect', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }))

    await expect(useApi().post('/auth/login', { username: 'x', password: 'y' }))
      .rejects.toThrow('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')

    expect(mockAuth.logout).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })
})
