import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { decodeJwtPayload, useAuthStore } from '@/stores/auth.js'

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
    sessionStorage.clear()
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

  it('treats superadmin as admin for menu gating', () => {
    const auth = useAuthStore()
    auth.setAuth({
      ...authData(),
      user: { user_id: 1, username: 'root', name: 'Root', role: 'superadmin', must_change_password: false },
    })
    expect(auth.isAdmin).toBe(true)
    expect(auth.isSuperAdmin).toBe(true)
  })

  // ===== base64url payload (F35) =====

  function toBase64UrlSegment(b64) {
    return b64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  }

  it('decodeJwtPayload normalizes - and _ and restores missing padding', () => {
    // '\u00FA' (ú) bytes ทำให้ base64 มี '+' แน่นอน → segment มี '-'
    const plusPayload = { u: '\u00FA\u00FA\u00FA' }
    const plusSegment = toBase64UrlSegment(btoa(JSON.stringify(plusPayload)))
    expect(plusSegment).toContain('-')
    expect(decodeJwtPayload(plusSegment)).toEqual(plusPayload)

    // '???' ทำให้ base64 มี '/' แน่นอน → segment มี '_'
    const slashPayload = { q: '???' }
    const slashSegment = toBase64UrlSegment(btoa(JSON.stringify(slashPayload)))
    expect(slashSegment).toContain('_')
    expect(decodeJwtPayload(slashSegment)).toEqual(slashPayload)
  })

  it('keeps tokens with base64url payload characters valid (no false logout)', () => {
    const payload = { sub: 1, exp: Math.floor(Date.now() / 1000) + 3600, name: '???' }
    const segment = toBase64UrlSegment(btoa(JSON.stringify(payload)))
    expect(segment).toContain('_')

    const auth = useAuthStore()
    auth.setAuth({ ...authData(), token: `hdr.${segment}.sig` })
    expect(auth.isAuthenticated).toBe(true)
  })

  // ===== remember-me (F36) =====

  it('setAuth with remember=false persists all auth keys to sessionStorage only', () => {
    const auth = useAuthStore()
    auth.setAuth({ ...authData(), refresh_token: 'refresh-1' }, { remember: false })

    expect(sessionStorage.getItem('auth_token')).toBe(auth.token)
    expect(sessionStorage.getItem('refresh_token')).toBe('refresh-1')
    expect(sessionStorage.getItem('csrf_token')).toBe('csrf-123')
    expect(JSON.parse(sessionStorage.getItem('user')).username).toBe('admin')
    for (const key of ['auth_token', 'refresh_token', 'csrf_token', 'user']) {
      expect(localStorage.getItem(key)).toBeNull()
    }
  })

  it('hydrates a remember=false session from sessionStorage', () => {
    sessionStorage.setItem('auth_token', validToken())
    sessionStorage.setItem('user', JSON.stringify({ user_id: 1, username: 'admin', role: 'admin' }))
    setActivePinia(createPinia())

    const auth = useAuthStore()
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.isAdmin).toBe(true)
  })

  it('login forwards remember so the session lands in sessionStorage', async () => {
    mockPost.mockResolvedValue(authData())
    const auth = useAuthStore()

    await auth.login({ username: 'admin', password: 'x' }, { remember: false })

    expect(mockPost).toHaveBeenCalledWith('/auth/login', { username: 'admin', password: 'x' })
    expect(sessionStorage.getItem('auth_token')).toBe(auth.token)
    expect(localStorage.getItem('auth_token')).toBeNull()
  })

  it('refresh keeps a remember=false session in sessionStorage', async () => {
    const auth = useAuthStore()
    auth.setAuth({ ...authData(), refresh_token: 'refresh-1' }, { remember: false })

    const newToken = validToken()
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      token: newToken,
      csrf_token: 'csrf-9',
      refresh_token: 'refresh-2',
      user: authData().user,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await auth.refresh()

    expect(auth.token).toBe(newToken)
    expect(sessionStorage.getItem('auth_token')).toBe(newToken)
    expect(sessionStorage.getItem('refresh_token')).toBe('refresh-2')
    expect(localStorage.getItem('auth_token')).toBeNull()
  })

  it('logout clears session-stored remember=false keys too', () => {
    const auth = useAuthStore()
    auth.setAuth({ ...authData(), refresh_token: 'refresh-1' }, { remember: false })
    auth.logout()

    expect(auth.isAuthenticated).toBe(false)
    for (const key of ['auth_token', 'refresh_token', 'csrf_token', 'user']) {
      expect(sessionStorage.getItem(key)).toBeNull()
      expect(localStorage.getItem(key)).toBeNull()
    }
  })
})
