import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { useDebouncedCallback } from '@/composables/useDebouncedCallback.js'
import { useRequestSeq } from '@/composables/useRequestSeq.js'

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces calls until delay elapses', async () => {
    const scope = effectScope()
    const fn = vi.fn()
    let run
    scope.run(() => {
      ;({ run } = useDebouncedCallback(fn, 300))
    })

    run('a')
    run('b')
    expect(fn).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(300)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('b')
    scope.stop()
  })

  it('cancels pending timer on scope dispose', async () => {
    const scope = effectScope()
    const fn = vi.fn()
    let run
    scope.run(() => {
      ;({ run } = useDebouncedCallback(fn, 300))
    })

    run()
    scope.stop()
    await vi.advanceTimersByTimeAsync(300)
    expect(fn).not.toHaveBeenCalled()
  })

  it('ignores run() after scope dispose', async () => {
    const scope = effectScope()
    const fn = vi.fn()
    let run
    scope.run(() => {
      ;({ run } = useDebouncedCallback(fn, 300))
    })

    scope.stop()
    run()
    await vi.advanceTimersByTimeAsync(300)
    expect(fn).not.toHaveBeenCalled()
  })

  it('with useRequestSeq, ignores async work after scope dispose', async () => {
    const scope = effectScope()
    let applied = false
    let run
    let release
    const gate = new Promise((resolve) => { release = resolve })

    scope.run(() => {
      const { next } = useRequestSeq()
      ;({ run } = useDebouncedCallback(async () => {
        const req = next()
        await gate
        if (!req.isCurrent()) return
        applied = true
      }, 300))
    })

    run()
    await vi.advanceTimersByTimeAsync(300)
    scope.stop()
    release()
    await Promise.resolve()
    expect(applied).toBe(false)
  })
})
