import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { Eye, Pencil, Trash2, KeyRound, Ban } from 'lucide-vue-next'
import TableRowActions from '@/components/TableRowActions.vue'

describe('TableRowActions', () => {
  it('renders inline icon buttons when actions ≤ maxInline', () => {
    const wrapper = mount(TableRowActions, {
      props: {
        actions: [
          { key: 'edit', label: 'แก้ไข', onClick: vi.fn() },
          { key: 'delete', label: 'ลบ', variant: 'danger', onClick: vi.fn() },
        ],
      },
    })
    expect(wrapper.findAll('button')).toHaveLength(2)
    expect(wrapper.find('button[title="แก้ไข"]').exists()).toBe(true)
    expect(wrapper.find('button[title="ลบ"]').exists()).toBe(true)
    expect(wrapper.find('button[title="จัดการ"]').exists()).toBe(false)
  })

  it('uses default icons for view/edit/delete keys', () => {
    const wrapper = mount(TableRowActions, {
      props: {
        actions: [
          { key: 'view', label: 'ดูรายละเอียด' },
          { key: 'edit', label: 'แก้ไข' },
          { key: 'delete', label: 'ลบ', variant: 'danger' },
        ],
      },
    })
    expect(wrapper.findComponent(Eye).exists()).toBe(true)
    expect(wrapper.findComponent(Pencil).exists()).toBe(true)
    expect(wrapper.findComponent(Trash2).exists()).toBe(true)
  })

  it('calls onClick and emits action key', async () => {
    const onClick = vi.fn()
    const wrapper = mount(TableRowActions, {
      props: {
        actions: [{ key: 'view', label: 'ดูรายละเอียด', onClick }],
      },
    })
    await wrapper.find('button[title="ดูรายละเอียด"]').trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('action')).toEqual([['view']])
  })

  it('switches to MoreVertical menu when actions exceed maxInline', async () => {
    const wrapper = mount(TableRowActions, {
      props: {
        maxInline: 3,
        actions: [
          { key: 'view', label: 'ดูรายละเอียด' },
          { key: 'edit', label: 'แก้ไข' },
          { key: 'reset', label: 'รีเซ็ตรหัสผ่าน', icon: KeyRound, variant: 'warning' },
          { key: 'ban', label: 'ปิดบัญชี', icon: Ban, variant: 'danger' },
        ],
      },
      attachTo: document.body,
    })
    expect(wrapper.find('button[title="จัดการ"]').exists()).toBe(true)
    expect(wrapper.find('button[title="แก้ไข"]').exists()).toBe(false)

    await wrapper.find('button[title="จัดการ"]').trigger('click')
    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('ดูรายละเอียด')
    expect(wrapper.text()).toContain('ปิดบัญชี')
    expect(wrapper.find('[role="separator"]').exists()).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('exposes aria-label on inline icon buttons', () => {
    const wrapper = mount(TableRowActions, {
      props: {
        actions: [{ key: 'edit', label: 'แก้ไข' }],
      },
    })
    expect(wrapper.find('button[aria-label="แก้ไข"]').exists()).toBe(true)
  })
})
