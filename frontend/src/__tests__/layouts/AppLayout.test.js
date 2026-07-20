import { mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { markRaw, nextTick } from 'vue'

vi.mock('@/components/AppSidebar.vue', () => ({
  default: {
    name: 'AppSidebar',
    props: ['open'],
    emits: ['close'],
    template: '<aside data-testid="sidebar" :data-open="open" @click="$emit(\'close\')" />',
  },
}))

vi.mock('@/components/AppTopbar.vue', () => ({
  default: {
    name: 'AppTopbar',
    emits: ['toggle-sidebar'],
    template: '<header data-testid="topbar" @click="$emit(\'toggle-sidebar\')" />',
  },
}))

const AppLayout = (await import('@/layouts/AppLayout.vue')).default

describe('AppLayout', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('innerWidth', 1280)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mountLayout(options = {}) {
    const { invokeRouterSlot = false } = options
    return mount(AppLayout, {
      global: {
        mocks: {
          $route: { path: '/dashboard' },
        },
        stubs: {
          // Default stub skips the v-slot; opt-in stub exercises Transition + page component
          RouterView: invokeRouterSlot
            ? {
                name: 'RouterView',
                template:
                  '<div data-testid="router-view"><slot :Component="pageComp" /></div>',
                setup() {
                  return {
                    pageComp: markRaw({
                      name: 'StubPage',
                      template: '<div data-testid="slotted-page">หน้าทดสอบ</div>',
                    }),
                  }
                },
              }
            : { template: '<div data-testid="router-view" />' },
          RouterLink: RouterLinkStub,
        },
      },
    })
  }

  it('opens sidebar by default on desktop widths', () => {
    const wrapper = mountLayout()
    expect(wrapper.vm.sidebarOpen).toBe(true)
  })

  it('keeps sidebar closed by default on mobile widths', () => {
    vi.stubGlobal('innerWidth', 800)
    const wrapper = mountLayout()
    expect(wrapper.vm.sidebarOpen).toBe(false)
  })

  it('toggles sidebar when topbar emits toggle-sidebar', async () => {
    const wrapper = mountLayout()
    expect(wrapper.vm.sidebarOpen).toBe(true)

    await wrapper.get('[data-testid="topbar"]').trigger('click')
    expect(wrapper.vm.sidebarOpen).toBe(false)

    await wrapper.get('[data-testid="topbar"]').trigger('click')
    expect(wrapper.vm.sidebarOpen).toBe(true)
  })

  it('closes sidebar when overlay is clicked on mobile', async () => {
    vi.stubGlobal('innerWidth', 800)
    const wrapper = mountLayout()
    wrapper.vm.sidebarOpen = true
    await nextTick()

    const overlay = wrapper.find('.fixed.inset-0')
    expect(overlay.exists()).toBe(true)
    await overlay.trigger('click')
    expect(wrapper.vm.sidebarOpen).toBe(false)
  })

  it('updates sidebarOpen on window resize', async () => {
    const wrapper = mountLayout()
    expect(wrapper.vm.sidebarOpen).toBe(true)

    vi.stubGlobal('innerWidth', 500)
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(wrapper.vm.sidebarOpen).toBe(false)

    vi.stubGlobal('innerWidth', 1400)
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(wrapper.vm.sidebarOpen).toBe(true)
  })

  it('removes resize listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const wrapper = mountLayout()
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('renders RouterView slot content through the page Transition', () => {
    const wrapper = mountLayout({ invokeRouterSlot: true })
    // VTU stubs <Transition> as transition-stub; slotted page still mounts
    expect(wrapper.find('transition-stub').exists()).toBe(true)
    expect(wrapper.get('[data-testid="slotted-page"]').text()).toBe('หน้าทดสอบ')
  })
})
