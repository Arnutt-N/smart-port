import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth.js'

const mockPost = vi.fn()

vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ post: mockPost }),
}))

function makeJwt(expSeconds) {
  const b64 = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 1, role: 'admin', exp: expSeconds })}.sig`
}

const validToken = () => makeJwt(Math.floor(Date.now() / 1000) + 3600)
const expiredToken = () => makeJwt(Math.floor(Date.now() / 1000) - 10)

const authData = () => ({
  token: validToken(),
  csrf_token: 'csrf-123',
  user: { user_id: 1, username: 'admin', name: 'Admin', role: 'admin', must_change_password: false },
})

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    mockPost.mockReset()
  })

  it('starts unauthenticated with empty storage', () => {
    const auth = useAuthStore()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.user).toBeNull()
    expect(auth.isAdmin).toBe(false)
  })

  it('setAuth persists token/user/csrf and authenticates', () => {
    const auth = useAuthStore()
    auth.setAuth(authData())

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.isAdmin).toBe(true)
    expect(auth.csrfToken).toBe('csrf-123')
    expect(JSON.parse(localStorage.getItem('user')).username).toBe('admin')
    expect(localStorage.getItem('auth_token')).toBe(auth.token)
  })

  it('rejects expired tokens', () => {
    const auth = useAuthStore()
    auth.setAuth({ ...authData(), token: expiredToken() })
    expect(auth.isAuthenticated).toBe(false)
  })

  it('rejects malformed tokens without throwing', () => {
    const auth = useAuthStore()
    auth.setAuth({ ...authData(), token: 'not-a-jwt' })
    expect(auth.isAuthenticated).toBe(false)
  })

  it('login posts credentials and stores the session', async () => {
    mockPost.mockResolvedValue(authData())
    const auth = useAuthStore()

    await auth.login({ username: 'admin', password: 'x' })

    expect(mockPost).toHaveBeenCalledWith('/auth/login', { username: 'admin', password: 'x' })
    expect(auth.isAuthenticated).toBe(true)
  })

  it('mustChangePassword reflects the user flag and persists updates', () => {
    const auth = useAuthStore()
    auth.setAuth({ ...authData(), user: { ...authData().user, must_change_password: true } })
    expect(auth.mustChangePassword).toBe(true)

    auth.setMustChangePassword(false)
    expect(auth.mustChangePassword).toBe(false)
    expect(JSON.parse(localStorage.getItem('user')).must_change_password).toBe(false)
  })

  it('changePassword posts and clears the forced-change flag', async () => {
    mockPost.mockResolvedValue({ status: 'success' })
    const auth = useAuthStore()
    auth.setAuth({ ...authData(), user: { ...authData().user, must_change_password: true } })

    await auth.changePassword('old-pass', 'new-pass-123')

    expect(mockPost).toHaveBeenCalledWith('/auth/change-password', {
      current_password: 'old-pass',
      new_password: 'new-pass-123',
    })
    expect(auth.mustChangePassword).toBe(false)
  })

  it('logout clears every persisted key', () => {
    const auth = useAuthStore()
    auth.setAuth({ ...authData(), refreshToken: 'refresh-1' })
    auth.logout()

    expect(auth.isAuthenticated).toBe(false)
    expect(auth.user).toBeNull()
    for (const key of ['auth_token', 'authToken', 'refresh_token', 'refreshToken', 'csrf_token', 'user']) {
      expect(localStorage.getItem(key)).toBeNull()
    }
  })

  it('treats corrupted storage values as empty', () => {
    localStorage.setItem('user', '{not json')
    localStorage.setItem('auth_token', 'undefined')
    setActivePinia(createPinia())
    const auth = useAuthStore()

    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
    expect(localStorage.getItem('user')).toBeNull()
    expect(localStorage.getItem('auth_token')).toBeNull()
  })
})
