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
  let replace

  beforeEach(() => {
    isNavigating.value = true
    mockIsChunkLoadError.mockReset()
    mockResolveRecovery.mockReset()
    assign = vi.fn()
    replace = vi.fn()
  })

  it('clears nav progress and assigns recovery url for chunk errors', () => {
    mockIsChunkLoadError.mockReturnValue(true)
    mockResolveRecovery.mockReturnValue({ action: 'reload-target', url: '/dashboard' })

    onRouterError(new TypeError('Failed to fetch dynamically imported module'), { fullPath: '/dashboard' }, { assign, replace })

    expect(isNavigating.value).toBe(false)
    expect(mockResolveRecovery).toHaveBeenCalledWith('/dashboard', expect.anything(), expect.any(Number), '/dashboard')
    expect(assign).toHaveBeenCalledWith('/dashboard')
    expect(replace).not.toHaveBeenCalled()
  })

  it('falls back via resolveChunkRecoveryTarget when provided', () => {
    mockIsChunkLoadError.mockReturnValue(true)
    mockResolveRecovery.mockReturnValue({ action: 'reload-fallback', url: '/dashboard' })

    onRouterError(new Error('Failed to fetch dynamically imported module'), { fullPath: '/x' }, { assign, replace })

    expect(assign).toHaveBeenCalledWith('/dashboard')
  })

  it('uses tertiary root recovery when resolve returns reload-root', () => {
    mockIsChunkLoadError.mockReturnValue(true)
    mockResolveRecovery.mockReturnValue({ action: 'reload-root', url: '/' })

    onRouterError(new Error('Failed to fetch dynamically imported module'), { fullPath: '/dashboard' }, { assign, replace })

    expect(assign).toHaveBeenCalledWith('/')
  })

  it('soft-replaces to dashboard for non-chunk errors', () => {
    mockIsChunkLoadError.mockReturnValue(false)

    onRouterError(new Error('boom'), { fullPath: '/x' }, { assign, replace })

    expect(isNavigating.value).toBe(false)
    expect(assign).not.toHaveBeenCalled()
    expect(mockResolveRecovery).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith('/dashboard')
  })

  it('does not soft-replace when already on dashboard for non-chunk errors', () => {
    mockIsChunkLoadError.mockReturnValue(false)

    onRouterError(new Error('boom'), { fullPath: '/dashboard' }, { assign, replace })

    expect(replace).not.toHaveBeenCalled()
  })

  it('does not assign when recovery is blocked', () => {
    mockIsChunkLoadError.mockReturnValue(true)
    mockResolveRecovery.mockReturnValue({ action: 'blocked', url: null })

    onRouterError(new Error('Failed to fetch dynamically imported module'), { fullPath: '/x' }, { assign, replace })

    expect(assign).not.toHaveBeenCalled()
  })
})
