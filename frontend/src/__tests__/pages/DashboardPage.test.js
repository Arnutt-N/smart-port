import { mount, RouterLinkStub } from '@vue/test-utils'
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
})
