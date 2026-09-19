import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useAuthStore } from '@/stores/auth.js'

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/dashboard' }),
  RouterLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
}))

const AppSidebar = (await import('@/components/AppSidebar.vue')).default

describe('AppSidebar grants reactivity (real store)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
  })

  it('toggles work-management when grants flip after mount', async () => {
    const auth = useAuthStore()
    auth.user = { name: 'op', role: 'operator' }
    const wrapper = mount(AppSidebar, { props: { open: true } })
    expect(wrapper.text()).not.toContain('การจัดการงาน')

    auth.permissionGrants = { read: ['*'], create: [], update: [], delete: ['multiplier'] }
    await nextTick()
    expect(wrapper.text()).toContain('การจัดการงาน')

    auth.permissionGrants = null
    await nextTick()
    expect(wrapper.text()).not.toContain('การจัดการงาน')
  })

  it('toggles work-management on role flip without remount', async () => {
    const auth = useAuthStore()
    auth.user = { name: 'op', role: 'operator' }
    const wrapper = mount(AppSidebar, { props: { open: true } })
    expect(wrapper.text()).not.toContain('การจัดการงาน')

    auth.user = { name: 'op', role: 'admin' }
    await nextTick()
    expect(wrapper.text()).toContain('การจัดการงาน')

    auth.user = { name: 'op', role: 'operator' }
    await nextTick()
    expect(wrapper.text()).not.toContain('การจัดการงาน')
  })
})
