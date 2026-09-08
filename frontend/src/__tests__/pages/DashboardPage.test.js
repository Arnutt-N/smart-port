import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGet = vi.fn()

vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet }),
}))

const DashboardPage = (await import('@/pages/DashboardPage.vue')).default

describe('DashboardPage quick actions', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({})
  })

  it('links supportive time counting to the registered route', () => {
    const wrapper = mount(DashboardPage, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    const supportiveLink = wrapper
      .findAllComponents(RouterLinkStub)
      .find((link) => link.text().includes('การนับเวลาเกื้อกูล'))

    expect(supportiveLink).toBeDefined()
    expect(supportiveLink.props('to')).toBe('/time-counting')
  })

  it('shows in_progress count on the probation tracking card, not all statuses', async () => {
    mockGet.mockResolvedValue({
      total_personnel: 10,
      probation: { total: 9, in_progress: 4, near_deadline: 2, overdue: 1 },
      time_counting: { total: 0 },
      candidates: { total: 0 },
    })
    const wrapper = mount(DashboardPage, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await flushPromises()
    const card = wrapper.findAllComponents({ name: 'StatCard' })
      .find((c) => c.props('label') === 'ติดตามพ้นทดลอง')
    expect(card).toBeDefined()
    expect(card.props('value')).toBe('4')
  })
})
