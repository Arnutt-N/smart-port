import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetchSummary = vi.fn()

vi.mock('@/composables/useAnalytics.js', () => ({
  useAnalytics: () => ({ fetchSummary: mockFetchSummary }),
}))

const AnalyticsPage = (await import('@/pages/AnalyticsPage.vue')).default

function resolvedData() {
  mockFetchSummary.mockResolvedValue({
    data: {
      totals: { personnel: 100, civilServants: 80, awards: 12, decorations: 5, workResults: 30, retirementUpcoming: 3 },
      proposalsByStatus: [{ label: 'approved', count: 10 }],
      awardsByType: [{ label: 'honor', count: 4 }],
    },
  })
}

async function mountPage() {
  const wrapper = mount(AnalyticsPage)
  await vi.waitFor(() => expect(mockFetchSummary).toHaveBeenCalled())
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolvedData()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('loads summary on mount and renders stat cards + distributions', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('บุคลากรทั้งหมด')
    expect(wrapper.text()).toContain('ผลงานตามสถานะ')
    expect(wrapper.text()).toContain('รางวัลตามประเภท')
  })

  it('shows error state with retry when loading fails', async () => {
    mockFetchSummary.mockRejectedValue(new Error('โหลดข้อมูลไม่สำเร็จ'))
    const wrapper = await mountPage()
    await vi.waitFor(() => expect(wrapper.text()).toContain('โหลดข้อมูลไม่สำเร็จ'))
  })
})
