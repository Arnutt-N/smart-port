import { describe, expect, it, vi } from 'vitest'
import { applyPersonnelCreateQuery } from '@/utils/applyPersonnelCreateQuery.js'

function makeCtx(overrides = {}) {
  return {
    route: { query: { create: '1', personnel_id: '12', full_name: 'นายสมชาย ไทยแท้' } },
    router: { replace: vi.fn() },
    openCreate: vi.fn(),
    formData: { value: { personnel_id: null } },
    personnelSearch: { value: '' },
    selectedPersonnelName: { value: '' },
    get: vi.fn(async () => ({ success: true, data: { personnel_id: 12, is_active: 1 } })),
    onUnavailable: vi.fn(),
    ...overrides,
  }
}

describe('applyPersonnelCreateQuery', () => {
  it('prefills and opens when personnel is active', async () => {
    const ctx = makeCtx()
    expect(await applyPersonnelCreateQuery(ctx)).toBe(true)
    expect(ctx.get).toHaveBeenCalledWith('/personnel/12')
    expect(ctx.openCreate).toHaveBeenCalled()
    expect(ctx.formData.value.personnel_id).toBe(12)
    expect(ctx.personnelSearch.value).toBe('นายสมชาย ไทยแท้')
    expect(ctx.selectedPersonnelName.value).toBe('นายสมชาย ไทยแท้')
    expect(ctx.router.replace).toHaveBeenCalledWith({ query: {} })
    expect(ctx.onUnavailable).not.toHaveBeenCalled()
  })

  it('does not prefill inactive personnel', async () => {
    const ctx = makeCtx({
      get: vi.fn(async () => ({ success: true, data: { personnel_id: 12, is_active: 0 } })),
    })
    expect(await applyPersonnelCreateQuery(ctx)).toBe(false)
    expect(ctx.openCreate).not.toHaveBeenCalled()
    expect(ctx.formData.value.personnel_id).toBeNull()
    expect(ctx.router.replace).toHaveBeenCalledWith({ query: {} })
    expect(ctx.onUnavailable).toHaveBeenCalledWith('inactive')
  })

  it('does not prefill when personnel is missing', async () => {
    const ctx = makeCtx({
      get: vi.fn(async () => ({ success: true, data: null })),
    })
    expect(await applyPersonnelCreateQuery(ctx)).toBe(false)
    expect(ctx.openCreate).not.toHaveBeenCalled()
    expect(ctx.onUnavailable).toHaveBeenCalledWith('missing')
  })

  it('does not fetch without create=1', async () => {
    const ctx = makeCtx({
      route: { query: { personnel_id: '12', full_name: 'นายสมชาย ไทยแท้' } },
    })
    expect(await applyPersonnelCreateQuery(ctx)).toBe(false)
    expect(ctx.get).not.toHaveBeenCalled()
    expect(ctx.router.replace).not.toHaveBeenCalled()
  })

  it('treats get errors as missing', async () => {
    const ctx = makeCtx({
      get: vi.fn(async () => {
        throw new Error('ไม่พบบุคลากร')
      }),
    })
    expect(await applyPersonnelCreateQuery(ctx)).toBe(false)
    expect(ctx.openCreate).not.toHaveBeenCalled()
    expect(ctx.router.replace).toHaveBeenCalledWith({ query: {} })
    expect(ctx.onUnavailable).toHaveBeenCalledWith('missing')
  })
})
