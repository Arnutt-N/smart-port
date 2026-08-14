import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth.js'

const mockFetchList = vi.fn()
const mockFetchLookups = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/composables/usePersonnelMaster.js', () => ({
  usePersonnelMaster: () => ({
    fetchList: mockFetchList,
    fetchLookups: mockFetchLookups,
    create: mockCreate,
    update: mockUpdate,
  }),
}))

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
  useRoute: () => ({ get query() { return routeQuery.value } }),
  useRouter: () => ({ replace: mockReplace }),
}))

const mockReplace = vi.fn()
const routeQuery = { value: {} }

const PersonnelPage = (await import('@/pages/PersonnelPage.vue')).default

const sampleRow = {
  personnelId: 7,
  citizenId: '1234567890123',
  employeeId: 'E001',
  prefixId: 1,
  firstName: 'สมชาย',
  lastName: 'ใจดี',
  fullName: 'นายสมชาย ใจดี',
  isActive: true,
  currentPosition: 'นักทรัพยากรบุคคล',
  department: 'ก.พ.',
}

function resolvedData(rows = [sampleRow]) {
  mockFetchList.mockResolvedValue({
    data: rows,
    pagination: { total: rows.length, limit: 20, offset: 0, has_more: false },
  })
  mockFetchLookups.mockResolvedValue([
    { prefix_id: 1, prefix_code: '001', prefix_name_th: 'นาย' },
  ])
}

async function mountPage(role = 'admin') {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = { id: 1, role }
  const wrapper = mount(PersonnelPage)
  await vi.waitFor(() => expect(mockFetchList).toHaveBeenCalled())
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('PersonnelPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeQuery.value = {}
    resolvedData()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('loads data on mount and renders rows', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('นายสมชาย ใจดี')
    expect(wrapper.findAll('th').map((th) => th.text())).toContain('เลขบัตร')
    expect(wrapper.text()).toContain('1234567890123')
    expect(mockFetchList).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0, includeInactive: false }),
    )
  })

  it('shows add button for admin and opens create modal', async () => {
    const wrapper = await mountPage('admin')
    expect(wrapper.text()).toContain('เพิ่มบุคลากร')
    wrapper.vm.openCreate()
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.showFormModal).toBe(true)
  })

  it('opens create modal from ?create=1 for admin and clears query', async () => {
    routeQuery.value = { create: '1' }
    const wrapper = await mountPage('admin')
    expect(wrapper.vm.showFormModal).toBe(true)
    expect(mockReplace).toHaveBeenCalledWith({ query: {} })
  })

  it('does not open create modal from ?create=1 for operator', async () => {
    routeQuery.value = { create: '1' }
    const wrapper = await mountPage('operator')
    expect(wrapper.vm.showFormModal).toBe(false)
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('hides add button for non-admin', async () => {
    const wrapper = await mountPage('operator')
    expect(wrapper.vm.isAdmin).toBe(false)
    expect(wrapper.text()).not.toContain('เพิ่มบุคลากร')
  })

  it('hides citizen_id column for non-admin', async () => {
    const wrapper = await mountPage('operator')
    expect(wrapper.text()).toContain('นายสมชาย ใจดี')
    expect(wrapper.findAll('th').map((th) => th.text())).not.toContain('เลขบัตร')
    expect(wrapper.text()).not.toContain('1234567890123')
  })

  it('shows error state when loading fails', async () => {
    mockFetchList.mockRejectedValue(new Error('โหลดข้อมูลไม่สำเร็จ'))
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('โหลดข้อมูลไม่สำเร็จ'))
  })

  it('shows empty state when no rows', async () => {
    resolvedData([])
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('ไม่พบบุคลากร'))
  })
})
