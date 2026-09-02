import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuth = {
  isAuthenticated: false,
  mustChangePassword: false,
  user: null,
  get isAdmin() {
    return this.user?.role === 'admin' || this.user?.role === 'superadmin'
  },
  get isSuperAdmin() {
    return this.user?.role === 'superadmin'
  },
}

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => mockAuth,
}))

vi.mock('@/composables/useNavProgress.js', () => ({
  useNavProgress: () => ({ isNavigating: { value: false } }),
}))

vi.mock('@/utils/chunkGuard.js', () => ({
  isChunkLoadError: () => false,
  shouldReloadForChunkError: () => false,
}))

const router = (await import('@/router/index.js')).default

describe('router auth guards', () => {
  beforeEach(() => {
    mockAuth.isAuthenticated = false
    mockAuth.mustChangePassword = false
    mockAuth.user = null
  })

  it('redirects unauthenticated users away from protected routes', async () => {
    await router.push('/dashboard')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('forces password change before accessing the app shell', async () => {
    mockAuth.isAuthenticated = true
    mockAuth.mustChangePassword = true
    mockAuth.user = { role: 'operator', must_change_password: true }

    await router.push('/dashboard')
    expect(router.currentRoute.value.path).toBe('/change-password')
  })

  it('allows authenticated users to reach change-password when required', async () => {
    mockAuth.isAuthenticated = true
    mockAuth.mustChangePassword = true
    mockAuth.user = { role: 'operator', must_change_password: true }

    await router.push('/change-password')
    expect(router.currentRoute.value.path).toBe('/change-password')
  })

  it('redirects non-admin users away from admin-only routes', async () => {
    mockAuth.isAuthenticated = true
    mockAuth.mustChangePassword = false
    mockAuth.user = { role: 'operator', must_change_password: false }

    await router.push('/import')
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('allows admin users to reach admin-only routes', async () => {
    mockAuth.isAuthenticated = true
    mockAuth.mustChangePassword = false
    mockAuth.user = { role: 'admin', must_change_password: false }

    await router.push('/import')
    expect(router.currentRoute.value.path).toBe('/import')
  })

  it('redirects voluntary change-password visits to settings account', async () => {
    mockAuth.isAuthenticated = true
    mockAuth.mustChangePassword = false
    mockAuth.user = { role: 'operator' }

    await router.push('/change-password')
    expect(router.currentRoute.value.path).toBe('/settings/account')
  })

  it('allows superadmin into settings permissions', async () => {
    mockAuth.isAuthenticated = true
    mockAuth.mustChangePassword = false
    mockAuth.user = { role: 'superadmin' }

    await router.push('/settings/permissions')
    expect(router.currentRoute.value.path).toBe('/settings/permissions')
  })

  it('blocks non-superadmin from settings permissions', async () => {
    mockAuth.isAuthenticated = true
    mockAuth.mustChangePassword = false
    mockAuth.user = { role: 'admin' }

    await router.push('/dashboard')
    await router.push('/settings/permissions')
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('redirects authenticated users away from login', async () => {
    mockAuth.isAuthenticated = true
    mockAuth.mustChangePassword = false
    mockAuth.user = { role: 'operator' }

    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })
})

describe('router candidate paths', () => {
  beforeEach(() => {
    mockAuth.isAuthenticated = true
    mockAuth.mustChangePassword = false
    mockAuth.user = { role: 'operator', must_change_password: false }
  })

  it('resolves candidate overview route', async () => {
    await router.push('/candidates/overview')
    expect(router.currentRoute.value.name).toBe('candidates')
    expect(router.currentRoute.value.params.section).toBe('overview')
  })

  it('redirects unknown candidate sections to overview', async () => {
    await router.push('/candidates/foo')
    expect(router.currentRoute.value.name).toBe('candidates')
    expect(router.currentRoute.value.params.section).toBe('overview')
  })

  it('does not expose legacy /supportive quick-action path', async () => {
    await router.push('/supportive')
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('redirects legacy time-multiplier/areas to settings for admin', async () => {
    mockAuth.user = { role: 'admin' }
    await router.push('/time-multiplier/areas')
    expect(router.currentRoute.value.path).toBe('/settings/special-areas')
  })

  it('catch-all unknown paths redirect to dashboard', async () => {
    await router.push('/this-path-does-not-exist')
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })
})
