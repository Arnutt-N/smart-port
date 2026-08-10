import { describe, expect, it, vi } from 'vitest'
import { buildStandardRowActions } from '@/utils/tableRowActions.js'

describe('buildStandardRowActions', () => {
  it('returns empty array when no handlers given', () => {
    expect(buildStandardRowActions()).toEqual([])
  })

  it('builds view and edit without delete when canDelete is false', () => {
    const onView = vi.fn()
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    const actions = buildStandardRowActions({
      onView,
      onEdit,
      onDelete,
      canDelete: false,
    })

    expect(actions.map((a) => a.key)).toEqual(['view', 'edit'])
    expect(actions.find((a) => a.key === 'delete')).toBeUndefined()
  })

  it('includes danger delete when canDelete is true', () => {
    const onDelete = vi.fn()
    const actions = buildStandardRowActions({
      onEdit: vi.fn(),
      onDelete,
      canDelete: true,
    })

    expect(actions.map((a) => a.key)).toEqual(['edit', 'delete'])
    expect(actions[1]).toMatchObject({
      key: 'delete',
      label: 'ลบ',
      variant: 'danger',
      onClick: onDelete,
    })
  })

  it('omits view when onView is not provided', () => {
    const actions = buildStandardRowActions({
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      canDelete: true,
    })
    expect(actions.map((a) => a.key)).toEqual(['edit', 'delete'])
  })

  it('uses Thai labels for view and edit', () => {
    const actions = buildStandardRowActions({
      onView: vi.fn(),
      onEdit: vi.fn(),
    })
    expect(actions[0].label).toBe('ดูรายละเอียด')
    expect(actions[1].label).toBe('แก้ไข')
  })
})
