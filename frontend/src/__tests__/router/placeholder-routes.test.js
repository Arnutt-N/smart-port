import { describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => ({ isAuthenticated: true, mustChangePassword: false, user: { role: 'admin' } }),
}))

vi.mock('@/composables/useNavProgress.js', () => ({
  useNavProgress: () => ({ isNavigating: { value: false } }),
}))

vi.mock('@/utils/chunkGuard.js', () => ({
  isChunkLoadError: () => false,
  shouldReloadForChunkError: () => false,
}))

const router = (await import('@/router/index.js')).default

describe('formerly-placeholder routes now resolve to real pages', () => {
  it.each([
    ['/profile', 'my-profile'],
    ['/work-results', 'work-results'],
    ['/awards', 'awards'],
    ['/analytics', 'analytics'],
    ['/admin', 'admin'],
    ['/royal-decorations', 'royal-decorations'],
    ['/retirement-report', 'retirement-report'],
  ])('resolves %s to its own route (%s), not the catch-all redirect', (path, name) => {
    expect(router.resolve(path).name).toBe(name)
  })

  it('each real page route maps to a distinct component loader (not a shared placeholder)', () => {
    const paths = ['/profile', '/work-results', '/awards', '/analytics', '/admin', '/royal-decorations', '/retirement-report']
    const loaders = paths.map((p) => router.resolve(p).matched.at(-1).components.default)
    loaders.forEach((loader) => expect(typeof loader).toBe('function'))
    expect(new Set(loaders).size).toBe(loaders.length)
  })

  it('work-results and awards no longer share the analytics destination', () => {
    expect(router.resolve('/work-results').path).not.toBe(router.resolve('/analytics').path)
    expect(router.resolve('/awards').path).not.toBe(router.resolve('/analytics').path)
    expect(router.resolve('/work-results').path).not.toBe(router.resolve('/awards').path)
  })

  it('keeps the personnel profile/:id route intact', () => {
    expect(router.resolve('/profile/42').name).toBe('profile')
  })

  it('admin route requires admin', () => {
    expect(router.resolve('/admin').meta.requiresAdmin).toBe(true)
  })
})
