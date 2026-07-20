import { describe, it, expect } from 'vitest'
import { useNavProgress } from '@/composables/useNavProgress.js'

describe('useNavProgress', () => {
  it('exposes shared isNavigating ref', () => {
    const a = useNavProgress()
    const b = useNavProgress()

    expect(a.isNavigating).toBe(b.isNavigating)

    a.isNavigating.value = true
    expect(b.isNavigating.value).toBe(true)

    a.isNavigating.value = false
    expect(b.isNavigating.value).toBe(false)
  })
})
