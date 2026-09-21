import { describe, expect, it, vi } from 'vitest'
import { applyPersonnelCreateQuery } from '@/utils/applyPersonnelCreateQuery.js'

function makeCtx(overrides = {}) {
  return {
    route: { query: { create: '1', personnel_id: '12', full_name: 'นายสมชาย ไทยแท้' } },
    router: { replace: vi.fn() },
    openCreate: vi.fn(),
    get: vi.fn(async () => ({ success: true, data: { personnel_id: 12, full_name: 'นายสมชาย ไทยแท้', is_active: 1 } })),
    onUnavailable: vi.fn(),
    ...overrides,
  }
}

describe('applyPersonnelCreateQuery', () => {
  it('returns person and opens when personnel is active', async () => {
    const ctx = makeCtx()
    const person = await applyPersonnelCreateQuery(ctx)
    expect(person?.personnel_id).toBe(12)
    expect(person?.full_name).toBe('นายสมชาย ไทยแท้')
    expect(ctx.get).toHaveBeenCalledWith('/personnel/12')
    expect(ctx.openCreate).toHaveBeenCalled()
    expect(ctx.router.replace).toHaveBeenCalledWith({ query: {} })
    expect(ctx.onUnavailable).not.toHaveBeenCalled()
  })

  it('returns null for inactive personnel', async () => {
    const ctx = makeCtx({
      get: vi.fn(async () => ({ success: true, data: { personnel_id: 12, is_active: 0 } })),
    })
    expect(await applyPersonnelCreateQuery(ctx)).toBeNull()
    expect(ctx.openCreate).not.toHaveBeenCalled()
    expect(ctx.router.replace).toHaveBeenCalledWith({ query: {} })
    expect(ctx.onUnavailable).toHaveBeenCalledWith('inactive')
  })

  it('does not prefill when personnel is missing', async () => {
    const ctx = makeCtx({
      get: vi.fn(async () => ({ success: true, data: null })),
    })
    expect(await applyPersonnelCreateQuery(ctx)).toBeNull()
    expect(ctx.openCreate).not.toHaveBeenCalled()
    expect(ctx.onUnavailable).toHaveBeenCalledWith('missing')
  })

  it('returns null without create=1', async () => {
    const ctx = makeCtx({
      route: { query: { personnel_id: '12', full_name: 'นายสมชาย ไทยแท้' } },
    })
    expect(await applyPersonnelCreateQuery(ctx)).toBeNull()
    expect(ctx.get).not.toHaveBeenCalled()
    expect(ctx.router.replace).not.toHaveBeenCalled()
  })

  it('treats get errors as missing', async () => {
    const ctx = makeCtx({
      get: vi.fn(async () => {
        throw new Error('ไม่พบบุคลากร')
      }),
    })
    expect(await applyPersonnelCreateQuery(ctx)).toBeNull()
    expect(ctx.openCreate).not.toHaveBeenCalled()
    expect(ctx.router.replace).toHaveBeenCalledWith({ query: {} })
    expect(ctx.onUnavailable).toHaveBeenCalledWith('missing')
  })
})
