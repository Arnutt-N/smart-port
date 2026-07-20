import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

let userVal = null

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => ({
    get user() { return userVal },
  }),
}))

let currentPath = '/dashboard'

vi.mock('vue-router', () => ({
  useRoute: () => ({ get path() { return currentPath } }),
  RouterLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
}))
const AppSidebar = (await import('@/components/AppSidebar.vue')).default

function mountSidebar() {
  return mount(AppSidebar, { props: { open: true } })
}

describe('AppSidebar', () => {
  beforeEach(() => {
    userVal = { name: 'สมชาย', email: 'somchai@example.go.th', role: 'operator' }
    currentPath = '/dashboard'
  })

  it('renders 3 section labels for operator (ภาพรวม, MAIN, no ADMIN)', () => {
    userVal = { name: 'op', role: 'operator' }
    const wrapper = mountSidebar()
    const text = wrapper.text()
    expect(text).toContain('ภาพรวม')
    expect(text).toContain('MAIN')
    expect(text).not.toContain('ADMIN')
  })

  it('renders all 3 section labels (ภาพรวม, MAIN, ADMIN) for admin', () => {
    userVal = { name: 'admin', role: 'admin' }
    const wrapper = mountSidebar()
    const text = wrapper.text()
    expect(text).toContain('ภาพรวม')
    expect(text).toContain('MAIN')
    expect(text).toContain('ADMIN')
  })

  it('shows admin-only items only for admin', () => {
    userVal = { name: 'admin', role: 'admin' }
    let wrapper = mountSidebar()
    expect(wrapper.text()).toContain('นำเข้าข้อมูล')
    expect(wrapper.text()).toContain('จัดการผู้ใช้')
    expect(wrapper.text()).toContain('ประวัติการเปลี่ยนแปลง')
    expect(wrapper.text()).toContain('จัดการพื้นที่พิเศษ')
    wrapper.unmount()

    userVal = { name: 'op', role: 'operator' }
    wrapper = mountSidebar()
    expect(wrapper.text()).not.toContain('นำเข้าข้อมูล')
    expect(wrapper.text()).not.toContain('จัดการผู้ใช้')
    expect(wrapper.text()).not.toContain('จัดการพื้นที่พิเศษ')
  })

  it('renders Dashboard under ภาพรวม section', () => {
    const wrapper = mountSidebar()
    expect(wrapper.text()).toContain('Dashboard')
  })

  it('renders all MAIN items for every role', () => {
    userVal = { name: 'op', role: 'operator' }
    const wrapper = mountSidebar()
    const text = wrapper.text()
    expect(text).toContain('พ้นทดลองปฏิบัติราชการ')
    expect(text).toContain('Candidate Lists')
    expect(text).toContain('การนับเวลาเพิ่มเติม')
    expect(text).toContain('เครื่องราชอิสริยาภรณ์')
    expect(text).toContain('รายงานผู้เกษียณ')
    expect(text).toContain('การจัดการงาน')
    expect(text).toContain('ผลงานและข้อเสนอ')
    expect(text).toContain('รางวัล/ความดีความชอบ')
  })

  it('collapses single-child admin-settings submenu into a flat จัดการพื้นที่พิเศษ item', () => {
    userVal = { name: 'admin', role: 'admin' }
    const wrapper = mountSidebar()
    // flat item — no submenu toggle, should be a direct RouterLink
    expect(wrapper.text()).toContain('จัดการพื้นที่พิเศษ')
    // should NOT have a submenu toggle button labeled "แอดมิน"
    expect(wrapper.text()).not.toContain('แอดมิน')
  })

  it('toggles submenu open and closed when parent button clicked', async () => {
    const wrapper = mountSidebar()
    expect(wrapper.vm.openSubmenus.has('candidates')).toBe(false)

    // find the Candidate Lists parent button (has children, so it's a <button> not a RouterLink)
    const parentBtn = wrapper.findAll('button').find((b) => b.text().includes('Candidate Lists'))
    await parentBtn.trigger('click')
    expect(wrapper.vm.openSubmenus.has('candidates')).toBe(true)

    // sub-items now visible
    expect(wrapper.text()).toContain('ภาพรวม')
    expect(wrapper.text()).toContain('ทั่วไป')
    expect(wrapper.text()).toContain('วิชาการ')
    expect(wrapper.text()).toContain('อำนวยการ')
    expect(wrapper.text()).toContain('บริหาร')

    await parentBtn.trigger('click')
    expect(wrapper.vm.openSubmenus.has('candidates')).toBe(false)
  })

  it('marks parent as active when a child route is current', async () => {
    currentPath = '/candidates/academic'
    const wrapper = mountSidebar()
    const parentBtn = wrapper.findAll('button').find((b) => b.text().includes('Candidate Lists'))
    // isParentActive -> parent button has the active class (bg-blue-600/10)
    expect(parentBtn.classes()).toContain('bg-blue-600/10')
  })

  it('emits close when mobile X button clicked', async () => {
    const wrapper = mountSidebar()
    const closeBtn = wrapper.find('button[aria-label="ปิดเมนู"]')
    await closeBtn.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('shows user name and role badge in user card', () => {
    userVal = { name: 'สมชาย ใจดี', email: 's@x.go.th', role: 'admin' }
    const wrapper = mountSidebar()
    const text = wrapper.text()
    expect(text).toContain('สมชาย ใจดี')
    expect(text).toContain('Admin')
  })

  it('shows Operator badge for non-admin', () => {
    userVal = { name: 'op', role: 'operator' }
    const wrapper = mountSidebar()
    expect(wrapper.text()).toContain('Operator')
  })

  it('shows "A" fallback initial when user has no name', () => {
    userVal = { name: '', role: 'operator' }
    const wrapper = mountSidebar()
    expect(wrapper.text()).toContain('A')
  })

  it('hides sidebar off-canvas when open=false (translate-x-full on mobile)', () => {
    const wrapper = mount(AppSidebar, { props: { open: false } })
    const aside = wrapper.find('aside')
    // when closed, the aside has -translate-x-full (mobile hidden), but lg:translate-x-0 keeps it visible on desktop
    expect(aside.classes()).toContain('-translate-x-full')
  })

  it('shows sidebar when open=true', () => {
    const wrapper = mountSidebar()
    const aside = wrapper.find('aside')
    expect(aside.classes()).toContain('translate-x-0')
  })

  it('renders Candidate Lists sub-items with correct routes when expanded', async () => {
    const wrapper = mountSidebar()
    const parentBtn = wrapper.findAll('button').find((b) => b.text().includes('Candidate Lists'))
    await parentBtn.trigger('click')
    await nextTick()

    // RouterLink is mocked to render <a href="to">
    const links = wrapper.findAll('a')
    const hrefs = links.map((a) => a.attributes('href'))
    expect(hrefs).toContain('/candidates/overview')
    expect(hrefs).toContain('/candidates/general')
    expect(hrefs).toContain('/candidates/academic')
    expect(hrefs).toContain('/candidates/support')
    expect(hrefs).toContain('/candidates/management')
  })

  it('renders การนับเวลาเพิ่มเติม sub-items with correct routes when expanded', async () => {
    const wrapper = mountSidebar()
    const parentBtn = wrapper.findAll('button').find((b) => b.text().includes('การนับเวลาเพิ่มเติม'))
    await parentBtn.trigger('click')
    await nextTick()

    const links = wrapper.findAll('a')
    const hrefs = links.map((a) => a.attributes('href'))
    expect(hrefs).toContain('/time-counting')
    expect(hrefs).toContain('/time-multiplier')
    expect(hrefs).toContain('/time-difference')
    expect(hrefs).toContain('/position-compare')
  })

  it('marks simple item active when its route is current', () => {
    currentPath = '/probation-end'
    const wrapper = mountSidebar()
    // find the RouterLink for /probation-end — it should have the active class
    const links = wrapper.findAll('a')
    const probationLink = links.find((a) => a.attributes('href') === '/probation-end')
    expect(probationLink).toBeTruthy()
    expect(probationLink.classes()).toContain('bg-blue-600/10')
  })

  it('marks flat admin item (จัดการพื้นที่พิเศษ) active when its route is current', () => {
    userVal = { name: 'admin', role: 'admin' }
    currentPath = '/settings/special-areas'
    const wrapper = mountSidebar()
    const links = wrapper.findAll('a')
    const areasLink = links.find((a) => a.attributes('href') === '/settings/special-areas')
    expect(areasLink).toBeTruthy()
    expect(areasLink.classes()).toContain('bg-blue-600/10')
  })
})