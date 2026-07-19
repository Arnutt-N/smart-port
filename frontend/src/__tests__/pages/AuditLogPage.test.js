import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGet = vi.fn()

vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet }),
}))

const AuditLogPage = (await import('@/pages/AuditLogPage.vue')).default

const sampleRow = {
  audit_id: 11,
  created_at: '2026-07-01T10:30:00',
  user_id: 1,
  username: 'admin',
  full_name: 'ผู้ดูแลระบบ',
  action: 'UPDATE',
  table_name: 'personnel',
  record_id: 42,
  before_value: { full_name: 'เดิม' },
  after_value: { full_name: 'ใหม่' },
  ip_address: '10.0.0.1',
}

function resolvedData(rows = [sampleRow], total = rows.length) {
  mockGet.mockResolvedValue({
    data: rows,
    pagination: { total, limit: 50, offset: 0 },
  })
}

async function mountPage() {
  const wrapper = mount(AuditLogPage)
  await vi.waitFor(() => {
    expect(mockGet).toHaveBeenCalled()
  })
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('AuditLogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolvedData()
  })

  it('loads audit rows on mount and renders labels', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('ผู้ดูแลระบบ')
    expect(wrapper.text()).toContain('แก้ไข') // action UPDATE
    expect(wrapper.text()).toContain('บุคลากร') // table personnel
    expect(wrapper.text()).toContain('42')
  })

  it('shows empty state when there are no rows', async () => {
    resolvedData([], 0)
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('ไม่พบประวัติการเปลี่ยนแปลง'))
  })

  it('shows error state when loading fails', async () => {
    mockGet.mockRejectedValue(new Error('เซิร์ฟเวอร์ล่ม'))
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('เซิร์ฟเวอร์ล่ม'))
  })

  it('changing table filter resets offset and refetches with the filter', async () => {
    const wrapper = await mountPage()
    mockGet.mockClear()

    wrapper.vm.pagination.offset = 50
    wrapper.vm.filters.table = 'users'
    wrapper.vm.onFilterChange()

    await vi.waitFor(() => {
      expect(mockGet).toHaveBeenCalled()
      const url = mockGet.mock.calls[0][0]
      expect(url).toContain('table=users')
      expect(url).toContain('offset=0')
    })
    expect(wrapper.vm.pagination.offset).toBe(0)
  })

  it('page change keeps filters and moves offset', async () => {
    resolvedData([sampleRow], 200)
    const wrapper = await mountPage()
    mockGet.mockClear()

    wrapper.vm.onPageChange(50)

    await vi.waitFor(() => {
      const url = mockGet.mock.calls[0][0]
      expect(url).toContain('offset=50')
      expect(url).toContain('limit=50')
    })
  })

  it('opens detail modal with before/after values and closes via Escape', async () => {
    const wrapper = await mountPage()

    wrapper.vm.showDetail(sampleRow)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('รายละเอียดการเปลี่ยนแปลง')
    expect(wrapper.text()).toContain('10.0.0.1')
    expect(wrapper.text()).toContain('"full_name": "ใหม่"')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.selectedRow).toBeNull()
  })

  it('maps unknown actions and tables to raw values', async () => {
    resolvedData([{ ...sampleRow, action: 'LOGIN', table_name: 'sessions' }])
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('LOGIN')
    expect(wrapper.text()).toContain('sessions')
  })
})
