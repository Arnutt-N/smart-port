import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth.js'

const mockPost = vi.fn()
const mockGet = vi.fn()

vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ post: mockPost, get: mockGet }),
}))

// backend response shape หลัง login/refresh (D3 compat-keep: token fields ยังส่งมา
// แต่ store เพิกเฉย — session จริงอยู่ใน httpOnly cookies)
const authData = () => ({
  token: 'compat-jwt-ignored',
  csrf_token: 'csrf-123',
  refresh_token: 'compat-refresh-ignored',
  user: { user_id: 1, username: 'admin', name: 'Admin', role: 'admin', must_change_password: false },
})

// GET /auth/me response shape (getAuthMe: { success, data })
const meResponse = (overrides = {}) => ({
  success: true,
  data: {
    id: 1,
    username: 'admin',
    name: 'Admin',
    full_name: 'Admin',
    email: 'admin@example.t',
    role: 'admin',
    must_change_password: false,
    ...overrides,
  },
})

function mockFetchJson(body, status = 200) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }))
}

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
    auth.setAuth({ ...data })
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
      auth.setAuth(authData())
      const p = auth.refresh()
      auth.logout()
      resolveRefresh(new Response(JSON.stringify(authData()), { status: 200 }))
      await expect(p).rejects.toMatchObject({ code: 'SESSION_CHANGED' })
      expect(auth.isAuthenticated).toBe(false)
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
      auth.setAuth(authData())
      const p = auth.refresh()
      const userB = { user_id: 2, username: 'b-operator', name: 'B', role: 'operator', must_change_password: false }
      mockPost.mockReset()
      mockPost.mockResolvedValue({ ...authData(), user: userB })
      await auth.login({ username: 'b-operator', password: 'x' })
      resolveRefresh(new Response(JSON.stringify(authData()), { status: 200 }))
      await expect(p).rejects.toMatchObject({ code: 'SESSION_CHANGED' })
      expect(auth.isAuthenticated).toBe(true)
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
      auth.setAuth(authData())
      const p = auth.refresh()
      const userB = { user_id: 2, username: 'b-operator', name: 'B', role: 'operator', must_change_password: false }
      mockPost.mockReset()
      mockPost.mockResolvedValue({ ...authData(), user: userB })
      await auth.login({ username: 'b-operator', password: 'x' })
      resolveRefresh(new Response('{}', { status: 401 }))
      await expect(p).rejects.toMatchObject({ code: 'SESSION_CHANGED' })
      expect(auth.isAuthenticated).toBe(true)
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

  it('setAuth persists csrf/user (never tokens) and authenticates', () => {
    const auth = useAuthStore()
    auth.setAuth(authData())

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.isAdmin).toBe(true)
    expect(auth.csrfToken).toBe('csrf-123')
    expect(JSON.parse(localStorage.getItem('user')).username).toBe('admin')
    // compat-keep fields จาก backend ต้องไม่ลง storage และ store ไม่ expose
    expect(localStorage.getItem('auth_token')).toBeNull()
    expect(localStorage.getItem('refresh_token')).toBeNull()
    expect('token' in auth).toBe(false)
    expect('refreshToken' in auth).toBe(false)
  })

  it('removes legacy token keys from both storages on load (one-time migration)', () => {
    localStorage.setItem('auth_token', 'old-jwt')
    localStorage.setItem('refresh_token', 'old-refresh')
    localStorage.setItem('authToken', 'old-jwt')
    sessionStorage.setItem('auth_token', 'old-jwt')
    sessionStorage.setItem('refreshToken', 'old-refresh')
    setActivePinia(createPinia())

    useAuthStore()

    for (const key of ['auth_token', 'refresh_token', 'authToken', 'refreshToken']) {
      expect(localStorage.getItem(key)).toBeNull()
      expect(sessionStorage.getItem(key)).toBeNull()
    }
  })

  it('checkSession authenticates from a valid server session', async () => {
    const realFetch = globalThis.fetch
    try {
      globalThis.fetch = mockFetchJson(meResponse())
      const auth = useAuthStore()
      expect(auth.isAuthenticated).toBe(false)

      await expect(auth.checkSession()).resolves.toBe(true)

      expect(auth.isAuthenticated).toBe(true)
      expect(auth.user.username).toBe('admin')
      expect(auth.isAdmin).toBe(true)
      const [url, options] = globalThis.fetch.mock.calls[0]
      expect(String(url)).toContain('/auth/me')
      expect(options.credentials).toBe('include')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('checkSession stays logged out on 401 without throwing', async () => {
    const realFetch = globalThis.fetch
    try {
      globalThis.fetch = mockFetchJson({ error: 'Unauthorized' }, 401)
      const auth = useAuthStore()

      await expect(auth.checkSession()).resolves.toBe(false)

      expect(auth.isAuthenticated).toBe(false)
      expect(auth.user).toBeNull()
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('checkSession stays logged out on network failure', async () => {
    const realFetch = globalThis.fetch
    try {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'))
      const auth = useAuthStore()

      await expect(auth.checkSession()).resolves.toBe(false)

      expect(auth.isAuthenticated).toBe(false)
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('checkSession stays logged out on malformed body', async () => {
    const realFetch = globalThis.fetch
    try {
      globalThis.fetch = mockFetchJson({ success: true })
      const auth = useAuthStore()

      await expect(auth.checkSession()).resolves.toBe(false)

      expect(auth.isAuthenticated).toBe(false)
    } finally {
      globalThis.fetch = realFetch
    }
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
    localStorage.setItem('auth_token', 'old-jwt')
    const auth = useAuthStore()
    auth.setAuth(authData())
    auth.logout()

    expect(auth.isAuthenticated).toBe(false)
    expect(auth.user).toBeNull()
    for (const key of ['auth_token', 'authToken', 'refresh_token', 'refreshToken', 'csrf_token', 'user']) {
      expect(localStorage.getItem(key)).toBeNull()
      expect(sessionStorage.getItem(key)).toBeNull()
    }
  })

  it('treats corrupted storage values as empty', () => {
    localStorage.setItem('user', '{not json')
    localStorage.setItem('csrf_token', 'undefined')
    setActivePinia(createPinia())
    const auth = useAuthStore()

    expect(auth.user).toBeNull()
    expect(auth.csrfToken).toBe('')
    expect(auth.isAuthenticated).toBe(false)
    expect(localStorage.getItem('user')).toBeNull()
    expect(localStorage.getItem('csrf_token')).toBeNull()
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

  // ===== cookie transport (D3) =====

  it('refresh uses cookie transport (credentials, no token body)', async () => {
    const realFetch = globalThis.fetch
    try {
      globalThis.fetch = mockFetchJson(authData())
      const auth = useAuthStore()
      auth.setAuth(authData())

      await auth.refresh()

      const [url, options] = globalThis.fetch.mock.calls[0]
      expect(String(url)).toContain('/auth/refresh')
      expect(options.method).toBe('POST')
      expect(options.credentials).toBe('include')
      expect(options.body).toBeUndefined()
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('refresh fails fast without an active session', async () => {
    const auth = useAuthStore()
    await expect(auth.refresh()).rejects.toThrow('No active session')
  })

  it('refresh updates csrf/user from the rotated session', async () => {
    const realFetch = globalThis.fetch
    try {
      globalThis.fetch = mockFetchJson({
        ...authData(),
        csrf_token: 'csrf-9',
        user: { ...authData().user, name: 'Renamed' },
      })
      const auth = useAuthStore()
      auth.setAuth(authData())

      await auth.refresh()

      expect(auth.isAuthenticated).toBe(true)
      expect(auth.csrfToken).toBe('csrf-9')
      expect(auth.user.name).toBe('Renamed')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('logout notifies the server over cookies then clears state', async () => {
    const realFetch = globalThis.fetch
    try {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('{"success":true}', { status: 200 }))
      const auth = useAuthStore()
      auth.setAuth(authData())
      auth.logout()

      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
      const [url, options] = globalThis.fetch.mock.calls[0]
      expect(String(url)).toContain('/auth/logout')
      expect(options.credentials).toBe('include')
      expect(options.body).toBeUndefined()
      expect(auth.isAuthenticated).toBe(false)
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('logout skips the server call when already logged out', async () => {
    const realFetch = globalThis.fetch
    try {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('{"success":true}', { status: 200 }))
      const auth = useAuthStore()
      auth.logout()

      expect(globalThis.fetch).not.toHaveBeenCalled()
      expect(auth.isAuthenticated).toBe(false)
    } finally {
      globalThis.fetch = realFetch
    }
  })

  // ===== remember-me (F36, D3: csrf/user split) =====

  it('setAuth with remember=false persists csrf/user to sessionStorage only', () => {
    const auth = useAuthStore()
    auth.setAuth(authData(), { remember: false })

    expect(sessionStorage.getItem('csrf_token')).toBe('csrf-123')
    expect(JSON.parse(sessionStorage.getItem('user')).username).toBe('admin')
    expect(sessionStorage.getItem('auth_token')).toBeNull()
    for (const key of ['csrf_token', 'user']) {
      expect(localStorage.getItem(key)).toBeNull()
    }
  })

  it('hydrates user/csrf from sessionStorage without authenticating', () => {
    sessionStorage.setItem('csrf_token', 'csrf-9')
    sessionStorage.setItem('user', JSON.stringify({ user_id: 1, username: 'admin', role: 'admin' }))
    setActivePinia(createPinia())

    const auth = useAuthStore()
    expect(auth.user.username).toBe('admin')
    expect(auth.csrfToken).toBe('csrf-9')
    // D3: storage อย่างเดียวไม่พอ — ต้องผ่าน checkSession (server-checked) ก่อน
    expect(auth.isAuthenticated).toBe(false)
  })

  it('login forwards remember so csrf/user land in sessionStorage', async () => {
    mockPost.mockResolvedValue(authData())
    const auth = useAuthStore()

    await auth.login({ username: 'admin', password: 'x' }, { remember: false })

    expect(mockPost).toHaveBeenCalledWith('/auth/login', { username: 'admin', password: 'x' })
    expect(sessionStorage.getItem('csrf_token')).toBe('csrf-123')
    expect(localStorage.getItem('csrf_token')).toBeNull()
  })

  it('refresh keeps a remember=false session in sessionStorage', async () => {
    const realFetch = globalThis.fetch
    try {
      const auth = useAuthStore()
      auth.setAuth(authData(), { remember: false })

      globalThis.fetch = mockFetchJson({ ...authData(), csrf_token: 'csrf-9' })
      await auth.refresh()

      expect(auth.csrfToken).toBe('csrf-9')
      expect(sessionStorage.getItem('csrf_token')).toBe('csrf-9')
      expect(localStorage.getItem('csrf_token')).toBeNull()
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('logout clears session-stored remember=false keys too', () => {
    const auth = useAuthStore()
    auth.setAuth(authData(), { remember: false })
    auth.logout()

    expect(auth.isAuthenticated).toBe(false)
    for (const key of ['csrf_token', 'user']) {
      expect(sessionStorage.getItem(key)).toBeNull()
      expect(localStorage.getItem(key)).toBeNull()
    }
  })
})
