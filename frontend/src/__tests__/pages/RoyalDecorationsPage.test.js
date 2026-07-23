import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth.js'

const mockFetchList = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()

vi.mock('@/composables/useDecorations.js', () => ({
  useDecorations: () => ({
    fetchList: mockFetchList,
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
  }),
}))

const RoyalDecorationsPage = (await import('@/pages/RoyalDecorationsPage.vue')).default

const sampleRow = {
  decorationId: 1,
  servantId: 4,
  servantName: 'สมหญิง รักดี',
  decorationName: 'ทวีติยาภรณ์ช้างเผือก',
  decorationClass: 'ชั้นที่ 1',
  receivedYear: 2566,
  gazetteRef: 'ล.123',
  description: 'y',
}

function resolvedData(rows = [sampleRow]) {
  mockFetchList.mockResolvedValue({
    data: rows,
    pagination: { total: rows.length, limit: 20, offset: 0, has_more: false },
  })
}

async function mountPage(role = 'admin') {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = { id: 1, role }
  const wrapper = mount(RoyalDecorationsPage)
  await vi.waitFor(() => expect(mockFetchList).toHaveBeenCalled())
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('RoyalDecorationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolvedData()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('loads data on mount and renders rows', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('ทวีติยาภรณ์ช้างเผือก')
    expect(wrapper.text()).toContain('สมหญิง รักดี')
  })

  it('shows add button for admin and opens create modal', async () => {
    const wrapper = await mountPage('admin')
    expect(wrapper.text()).toContain('เพิ่มรายการ')
    wrapper.vm.openCreate()
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.showFormModal).toBe(true)
  })

  it('hides add button for non-admin', async () => {
    const wrapper = await mountPage('operator')
    expect(wrapper.vm.isAdmin).toBe(false)
    expect(wrapper.text()).not.toContain('เพิ่มรายการ')
  })

  it('shows error state when loading fails', async () => {
    mockFetchList.mockRejectedValue(new Error('โหลดข้อมูลไม่สำเร็จ'))
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('โหลดข้อมูลไม่สำเร็จ'))
  })

  it('shows empty state when no rows', async () => {
    resolvedData([])
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('ไม่พบข้อมูล'))
  })
})
