import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { decodeJwtPayload, useAuthStore } from '@/stores/auth.js'

const mockPost = vi.fn()
const mockGet = vi.fn()

vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ post: mockPost, get: mockGet }),
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
    mockGet.mockReset()
  })

  it('starts unauthenticated with empty storage', () => {
    const auth = useAuthStore()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.user).toBeNull()
    expect(auth.isAdmin).toBe(false)
  })

  // N4 — can() อ่าน effective grants (รวม role_permission_overrides)
  describe('N4 permission grants', () => {
    it('can() returns null-grants fallback to role intents', () => {
      const auth = useAuthStore()
      auth.setAuth(authData()) // role = admin
      expect(auth.can('delete', 'multiplier')).toBe(true) // fallback: admin ทุกอย่าง

      const opAuth = useAuthStore()
      opAuth.setAuth({ ...authData(), user: { ...authData().user, role: 'operator' } })
      expect(opAuth.can('delete', 'multiplier')).toBe(false)
      expect(opAuth.can('create', 'multiplier')).toBe(true)
      expect(opAuth.can('create', 'photos')).toBe(true)
    })

    it('can() uses loaded grants instead of role', () => {
      const auth = useAuthStore()
      auth.setAuth(authData())
      // override ปิด delete:multiplier ของ admin — can() ต้องตาม grants
      auth.permissionGrants = { read: ['*'], create: [], update: [], delete: [] }
      expect(auth.can('delete', 'multiplier')).toBe(false)
      expect(auth.isAdmin).toBe(false) // no delete grants = not admin-like
    })

    it('setAuth clears stale grants on session change', () => {
      const auth = useAuthStore()
      auth.setAuth(authData())
      auth.permissionGrants = { read: ['multiplier'], create: [], update: [], delete: [] }
      auth.setAuth(authData())
      expect(auth.permissionGrants).toBeNull()
    })

    it('isAdmin stays role-based before grants load (fallback)', () => {
      const auth = useAuthStore()
      auth.setAuth(authData()) // admin, grants = null
      expect(auth.isAdmin).toBe(true)
    })
  })

  it('fetchPermissionGrants fires concurrent calls only once (single-flight)', async () => {
    mockGet.mockReset()
    mockGet.mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({ data: { grants: { read: ['*'], create: [], update: [], delete: [] } } }), 20)
    }))
    const auth = useAuthStore()
    auth.setAuth(authData())
    await Promise.all([auth.fetchPermissionGrants(), auth.fetchPermissionGrants()])
    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(mockGet).toHaveBeenCalledWith('/settings/permissions/self')
  })

  it('fetchPermissionGrants recovers after failure and refetches next time', async () => {
    mockGet.mockReset()
    mockGet.mockRejectedValueOnce(new Error('offline'))
    const auth = useAuthStore()
    auth.setAuth(authData())
    await auth.fetchPermissionGrants()
    expect(auth.permissionGrants).toBeNull()
    mockGet.mockResolvedValue({ data: { grants: { read: ['*'], create: [], update: [], delete: [] } } })
    await auth.fetchPermissionGrants()
    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(auth.permissionGrants).toEqual({ read: ['*'], create: [], update: [], delete: [] })
  })

  it('logout clears grants so isAdmin/can stop answering for the old session', () => {
    const auth = useAuthStore()
    auth.setAuth(authData())
    auth.permissionGrants = { read: ['*'], create: [], update: [], delete: ['x'] }
    expect(auth.isAdmin).toBe(true)
    auth.logout()
    expect(auth.permissionGrants).toBeNull()
    expect(auth.isAdmin).toBe(false)
    expect(auth.can('delete', 'x')).toBe(false)
  })

  it('discards grants response that resolves after session change', async () => {
    let resolveFetch
    mockGet.mockReset()
    mockGet.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve }))
    const auth = useAuthStore()
    auth.setAuth(authData())
    const p = auth.fetchPermissionGrants()
    await vi.waitFor(() => {
      expect(mockGet).toHaveBeenCalledTimes(1)
    })
    mockPost.mockReset()
    mockPost.mockResolvedValue({ ...authData(), user: { ...authData().user, username: 'b' } })
    await auth.login({ username: 'b', password: 'x' })
    resolveFetch({ data: { grants: { read: ['*'], create: [], update: [], delete: ['x'] } } })
    await p
    expect(auth.permissionGrants).toBeNull()
  })

  it('preserves grants fetch across same-session setAuth (token refresh)', async () => {
    let resolveFetch
    mockGet.mockReset()
    mockGet.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve }))
    const auth = useAuthStore()
    const data = authData()
    auth.setAuth(data)
    const p = auth.fetchPermissionGrants()
    await vi.waitFor(() => { expect(mockGet).toHaveBeenCalledTimes(1) })
    auth.setAuth({ ...data, token: data.token })
    resolveFetch({ data: { grants: { read: ['*'], create: [], update: [], delete: [] } } })
    await p
    expect(auth.permissionGrants).toEqual({ read: ['*'], create: [], update: [], delete: [] })
  })

  it('does not resurrect the session when logout lands mid-refresh', async () => {
    const realFetch = globalThis.fetch
    try {
      let resolveRefresh
      globalThis.fetch = vi.fn((url) => {
        if (String(url).includes('/auth/refresh')) {
          return new Promise((resolve) => { resolveRefresh = resolve })
        }
        return Promise.resolve(new Response('{}', { status: 200 }))
      })
      const auth = useAuthStore()
      const data = authData()
      auth.setAuth({ ...data, refresh_token: 'refresh-1' })
      const p = auth.refresh()
      auth.logout()
      resolveRefresh(new Response(JSON.stringify({ ...data, token: validToken(), refresh_token: 'refresh-2' }), { status: 200 }))
      await expect(p).rejects.toMatchObject({ code: 'SESSION_CHANGED' })
      expect(auth.token).toBe('')
      expect(auth.user).toBeNull()
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('does not let a stale refresh overwrite a newer login session', async () => {
    const realFetch = globalThis.fetch
    try {
      let resolveRefresh
      globalThis.fetch = vi.fn((url) => {
        if (String(url).includes('/auth/refresh')) {
          return new Promise((resolve) => { resolveRefresh = resolve })
        }
        return Promise.resolve(new Response('{}', { status: 200 }))
      })
      const auth = useAuthStore()
      const dataA = authData()
      auth.setAuth({ ...dataA, refresh_token: 'refresh-1' })
      const p = auth.refresh()
      const userB = { user_id: 2, username: 'b-operator', name: 'B', role: 'operator', must_change_password: false }
      const dataB = { ...authData(), token: validToken(), refresh_token: 'refresh-2', user: userB }
      mockPost.mockReset()
      mockPost.mockResolvedValue(dataB)
      await auth.login({ username: 'b-operator', password: 'x' })
      resolveRefresh(new Response(JSON.stringify({ ...dataA, token: validToken(), refresh_token: 'refresh-9' }), { status: 200 }))
      await expect(p).rejects.toMatchObject({ code: 'SESSION_CHANGED' })
      expect(auth.token).toBe(dataB.token)
      expect(auth.user.username).toBe('b-operator')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('reports SESSION_CHANGED (not Refresh failed) when refresh 401s after login', async () => {
    const realFetch = globalThis.fetch
    try {
      let resolveRefresh
      globalThis.fetch = vi.fn((url) => {
        if (String(url).includes('/auth/refresh')) {
          return new Promise((resolve) => { resolveRefresh = resolve })
        }
        return Promise.resolve(new Response('{}', { status: 200 }))
      })
      const auth = useAuthStore()
      const dataA = authData()
      auth.setAuth({ ...dataA, refresh_token: 'refresh-1' })
      const p = auth.refresh()
      const userB = { user_id: 2, username: 'b-operator', name: 'B', role: 'operator', must_change_password: false }
      const dataB = { ...authData(), token: validToken(), refresh_token: 'refresh-2', user: userB }
      mockPost.mockReset()
      mockPost.mockResolvedValue(dataB)
      await auth.login({ username: 'b-operator', password: 'x' })
      resolveRefresh(new Response('{}', { status: 401 }))
      await expect(p).rejects.toMatchObject({ code: 'SESSION_CHANGED' })
      expect(auth.token).toBe(dataB.token)
      expect(auth.user.username).toBe('b-operator')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('keeps the newer fetch handle when a stale grants fetch settles', async () => {
    const resolvers = []
    mockGet.mockReset()
    mockGet.mockImplementation(() => new Promise((resolve) => { resolvers.push(resolve) }))
    const auth = useAuthStore()
    const dataA = authData()
    auth.setAuth(dataA)
    const pA = auth.fetchPermissionGrants()
    await vi.waitFor(() => { expect(mockGet).toHaveBeenCalledTimes(1) })
    const userB = { user_id: 2, username: 'b-operator', name: 'B', role: 'operator', must_change_password: false }
    mockPost.mockReset()
    mockPost.mockResolvedValue({ ...authData(), user: userB })
    await auth.login({ username: 'b-operator', password: 'x' })
    const pB = auth.fetchPermissionGrants()
    await vi.waitFor(() => { expect(mockGet).toHaveBeenCalledTimes(2) })
    resolvers[0]({ data: { grants: { read: ['*'], create: [], update: [], delete: ['a'] } } })
    await pA
    const pC = auth.fetchPermissionGrants()
    expect(mockGet).toHaveBeenCalledTimes(2)
    resolvers[1]({ data: { grants: { read: ['*'], create: [], update: [], delete: ['b'] } } })
    await Promise.all([pB, pC])
    expect(auth.permissionGrants).toEqual({ read: ['*'], create: [], update: [], delete: ['b'] })
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

  it('decodes Thai (non-ASCII) payload segment without throwing', () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ sub: 1, name: 'สมชาย ใจดี', exp: 9999999999 }))
    let binary = ''
    bytes.forEach((b) => { binary += String.fromCharCode(b) })
    const segment = btoa(binary).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
    expect(decodeJwtPayload(segment)).toEqual({ sub: 1, name: 'สมชาย ใจดี', exp: 9999999999 })
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
    // '>>>' UTF-8 bytes ทำให้ base64 มี '+' แน่นอน → segment มี '-'
    const plusPayload = { u: '>>>' }
    const plusBytes = new TextEncoder().encode(JSON.stringify(plusPayload))
    let plusBinary = ''
    plusBytes.forEach((b) => { plusBinary += String.fromCharCode(b) })
    const plusSegment = toBase64UrlSegment(btoa(plusBinary))
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
