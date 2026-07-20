import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mockIsChunkLoadError = vi.fn()
const mockShouldReload = vi.fn()
const isNavigating = ref(false)

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    mustChangePassword: false,
    user: { role: 'admin', must_change_password: false },
  }),
}))

vi.mock('@/composables/useNavProgress.js', () => ({
  useNavProgress: () => ({ isNavigating }),
}))

vi.mock('@/utils/chunkGuard.js', () => ({
  isChunkLoadError: (...args) => mockIsChunkLoadError(...args),
  shouldReloadForChunkError: (...args) => mockShouldReload(...args),
}))

const { onRouterError } = await import('@/router/index.js')

describe('onRouterError chunk reload', () => {
  let assign

  beforeEach(() => {
    isNavigating.value = true
    mockIsChunkLoadError.mockReset()
    mockShouldReload.mockReset()
    assign = vi.fn()
  })

  it('clears nav progress and assigns when chunk reload is allowed', () => {
    mockIsChunkLoadError.mockReturnValue(true)
    mockShouldReload.mockReturnValue(true)

    onRouterError(new TypeError('Failed to fetch dynamically imported module'), { fullPath: '/dashboard' }, { assign })

    expect(isNavigating.value).toBe(false)
    expect(mockShouldReload).toHaveBeenCalledWith('/dashboard', expect.anything(), expect.any(Number))
    expect(assign).toHaveBeenCalledWith('/dashboard')
  })

  it('falls back to pathname when to is missing', () => {
    mockIsChunkLoadError.mockReturnValue(true)
    mockShouldReload.mockReturnValue(true)

    onRouterError(new Error('Failed to fetch dynamically imported module'), null, {
      assign,
      getPathname: () => '/fallback-path',
    })

    expect(assign).toHaveBeenCalledWith('/fallback-path')
  })

  it('clears nav progress but does not assign when error is not a chunk load error', () => {
    mockIsChunkLoadError.mockReturnValue(false)

    onRouterError(new Error('boom'), { fullPath: '/x' }, { assign })

    expect(isNavigating.value).toBe(false)
    expect(assign).not.toHaveBeenCalled()
    expect(mockShouldReload).not.toHaveBeenCalled()
  })

  it('does not assign when reload window blocks a chunk error', () => {
    mockIsChunkLoadError.mockReturnValue(true)
    mockShouldReload.mockReturnValue(false)

    onRouterError(new Error('Failed to fetch dynamically imported module'), { fullPath: '/x' }, { assign })

    expect(isNavigating.value).toBe(false)
    expect(assign).not.toHaveBeenCalled()
  })
})
