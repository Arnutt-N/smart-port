import { describe, expect, it } from 'vitest'
import { effectScope } from 'vue'
import { useRequestSeq } from '@/composables/useRequestSeq.js'

describe('useRequestSeq', () => {
  it('marks only the latest request as current', () => {
    const { next } = useRequestSeq()
    const first = next()
    const second = next()

    expect(first.isCurrent()).toBe(false)
    expect(second.isCurrent()).toBe(true)
  })

  it('invalidates tokens when the scope is disposed', () => {
    const scope = effectScope()
    let next
    scope.run(() => {
      ;({ next } = useRequestSeq())
    })

    const req = next()
    expect(req.isCurrent()).toBe(true)
    scope.stop()
    expect(req.isCurrent()).toBe(false)
  })
})
