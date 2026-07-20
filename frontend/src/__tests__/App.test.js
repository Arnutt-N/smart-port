import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const isNavigating = ref(false)

vi.mock('@/composables/useNavProgress.js', () => ({
  useNavProgress: () => ({ isNavigating }),
}))

vi.mock('@/components/ToastContainer.vue', () => ({
  default: { name: 'ToastContainer', template: '<div data-testid="toast" />' },
}))

const App = (await import('@/App.vue')).default

describe('App.vue', () => {
  beforeEach(() => {
    isNavigating.value = false
  })

  function mountApp() {
    return mount(App, {
      global: {
        stubs: {
          RouterView: { template: '<div data-testid="router-view" />' },
          Transition: false,
          Suspense: false,
        },
      },
    })
  }

  it('renders router outlet and toast container', () => {
    const wrapper = mountApp()
    expect(wrapper.find('[data-testid="router-view"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="toast"]').exists()).toBe(true)
  })

  it('shows nav progress bar when navigating', async () => {
    isNavigating.value = true
    const wrapper = mountApp()
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="กำลังโหลดหน้า"]').exists()).toBe(true)
  })

  it('hides nav progress bar when not navigating', () => {
    const wrapper = mountApp()
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false)
  })
})
