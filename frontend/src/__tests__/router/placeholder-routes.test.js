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

describe('placeholder routes', () => {
  it.each([
    ['/work-results', 'work-results'],
    ['/awards', 'awards'],
    ['/profile', 'my-profile'],
  ])('resolves %s to its own route (%s), not the catch-all redirect', (path, name) => {
    expect(router.resolve(path).name).toBe(name)
  })

  it('work-results and awards no longer share the analytics destination', () => {
    expect(router.resolve('/work-results').path).not.toBe(router.resolve('/analytics').path)
    expect(router.resolve('/awards').path).not.toBe(router.resolve('/analytics').path)
    expect(router.resolve('/work-results').path).not.toBe(router.resolve('/awards').path)
  })

  it('keeps the personnel profile/:id route intact', () => {
    expect(router.resolve('/profile/42').name).toBe('profile')
  })
})
