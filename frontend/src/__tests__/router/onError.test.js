import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mockIsChunkLoadError = vi.fn()
const mockResolveRecovery = vi.fn()
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
  resolveChunkRecoveryTarget: (...args) => mockResolveRecovery(...args),
}))

const { onRouterError } = await import('@/router/index.js')

describe('onRouterError chunk reload', () => {
  let assign

  beforeEach(() => {
    isNavigating.value = true
    mockIsChunkLoadError.mockReset()
    mockResolveRecovery.mockReset()
    assign = vi.fn()
  })

  it('clears nav progress and assigns recovery url for chunk errors', () => {
    mockIsChunkLoadError.mockReturnValue(true)
    mockResolveRecovery.mockReturnValue({ action: 'reload-target', url: '/dashboard' })

    onRouterError(new TypeError('Failed to fetch dynamically imported module'), { fullPath: '/dashboard' }, { assign })

    expect(isNavigating.value).toBe(false)
    expect(mockResolveRecovery).toHaveBeenCalledWith('/dashboard', expect.anything(), expect.any(Number), '/dashboard')
    expect(assign).toHaveBeenCalledWith('/dashboard')
  })

  it('falls back via resolveChunkRecoveryTarget when provided', () => {
    mockIsChunkLoadError.mockReturnValue(true)
    mockResolveRecovery.mockReturnValue({ action: 'reload-fallback', url: '/dashboard' })

    onRouterError(new Error('Failed to fetch dynamically imported module'), { fullPath: '/x' }, { assign })

    expect(assign).toHaveBeenCalledWith('/dashboard')
  })

  it('uses tertiary root recovery when resolve returns reload-root', () => {
    mockIsChunkLoadError.mockReturnValue(true)
    mockResolveRecovery.mockReturnValue({ action: 'reload-root', url: '/' })

    onRouterError(new Error('Failed to fetch dynamically imported module'), { fullPath: '/dashboard' }, { assign })

    expect(assign).toHaveBeenCalledWith('/')
  })

  it('clears nav progress but ignores non-chunk errors', () => {
    mockIsChunkLoadError.mockReturnValue(false)

    onRouterError(new Error('boom'), { fullPath: '/x' }, { assign })

    expect(isNavigating.value).toBe(false)
    expect(assign).not.toHaveBeenCalled()
    expect(mockResolveRecovery).not.toHaveBeenCalled()
  })

  it('does not assign when recovery is blocked', () => {
    mockIsChunkLoadError.mockReturnValue(true)
    mockResolveRecovery.mockReturnValue({ action: 'blocked', url: null })

    onRouterError(new Error('Failed to fetch dynamically imported module'), { fullPath: '/x' }, { assign })

    expect(assign).not.toHaveBeenCalled()
  })
})
