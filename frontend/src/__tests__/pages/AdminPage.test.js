import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

const AdminPage = (await import('@/pages/AdminPage.vue')).default

function mountPage() {
  return mount(AdminPage, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
}

describe('AdminPage', () => {
  it('renders the admin hub heading and nav cards', () => {
    const wrapper = mountPage()
    expect(wrapper.text()).toContain('การจัดการระบบ')
    expect(wrapper.text()).toContain('จัดการผู้ใช้')
    expect(wrapper.text()).toContain('บันทึกการใช้งาน')
    expect(wrapper.text()).toContain('นำเข้าข้อมูล')
    expect(wrapper.text()).toContain('พื้นที่พิเศษ')
  })

  it('links each card to its destination route', () => {
    const wrapper = mountPage()
    const hrefs = wrapper.findAll('a').map((a) => a.attributes('to'))
    expect(hrefs).toContain('/users')
    expect(hrefs).toContain('/audit')
    expect(hrefs).toContain('/import')
    expect(hrefs).toContain('/settings/special-areas')
  })
})
