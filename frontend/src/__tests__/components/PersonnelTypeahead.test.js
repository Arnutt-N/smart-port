import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth.js'
import PersonnelTypeahead from '@/components/PersonnelTypeahead.vue'

const mockSearchPersonnel = vi.fn(async () => [])
vi.mock('@/composables/usePersonnelSearch.js', () => ({
  usePersonnelSearch: () => ({ searchPersonnel: (...args) => mockSearchPersonnel(...args) }),
}))

vi.mock('vue-router', () => ({
  RouterLink: {
    name: 'RouterLink',
    props: ['to'],
    template: '<a><slot /></a>',
  },
}))

function mountTypeahead(props = {}, role = 'admin') {
  setActivePinia(createPinia())
  useAuthStore().user = { id: 1, role }
  return mount(PersonnelTypeahead, {
    props: { inputId: 'test-personnel-search', ...props },
  })
}

async function typeQuery(wrapper, text) {
  const input = wrapper.find('input')
  await input.setValue(text)
  await input.trigger('input')
  return input
}

describe('PersonnelTypeahead', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockSearchPersonnel.mockReset()
    mockSearchPersonnel.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not search and hides dropdown for single-character query', async () => {
    const wrapper = mountTypeahead()
    await typeQuery(wrapper, 'ส')
    await vi.advanceTimersByTimeAsync(300)

    expect(mockSearchPersonnel).not.toHaveBeenCalled()
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('searches with limit 10 and shows name plus position on results', async () => {
    mockSearchPersonnel.mockResolvedValue([
      { personnel_id: 9, full_name: 'สมชาย ใจดี', current_position: 'นักวิชาการ' },
    ])
    const wrapper = mountTypeahead()
    await typeQuery(wrapper, 'สมช')
    await vi.advanceTimersByTimeAsync(300)
    await wrapper.vm.$nextTick()

    expect(mockSearchPersonnel).toHaveBeenCalledWith('สมช', { limit: 10 })
    expect(wrapper.findAll('button')).toHaveLength(1)
    expect(wrapper.text()).toContain('สมชาย ใจดี')
    expect(wrapper.text()).toContain('นักวิชาการ')
  })

  it('emits id, fills text and closes dropdown when a row is clicked', async () => {
    mockSearchPersonnel.mockResolvedValue([
      { personnel_id: 9, full_name: 'สมชาย ใจดี', current_position: 'นักวิชาการ' },
    ])
    const wrapper = mountTypeahead()
    await typeQuery(wrapper, 'สมช')
    await vi.advanceTimersByTimeAsync(300)
    await wrapper.vm.$nextTick()

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([[9]])
    expect(wrapper.find('input').element.value).toBe('สมชาย ใจดี')
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('shows error text and hides admin link when search rejects', async () => {
    mockSearchPersonnel.mockRejectedValue(new Error('down'))
    const wrapper = mountTypeahead()
    await typeQuery(wrapper, 'สมช')
    await vi.advanceTimersByTimeAsync(300)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('ค้นหาไม่สำเร็จ กรุณาลองใหม่')
    expect(wrapper.text()).not.toContain('ไปสร้างที่ข้อมูลบุคลากร')
  })

  it('shows admin create link on empty results for admin only', async () => {
    mockSearchPersonnel.mockResolvedValue([])
    const admin = mountTypeahead()
    await typeQuery(admin, 'ไม่มีคนนี้')
    await vi.advanceTimersByTimeAsync(300)
    await admin.vm.$nextTick()

    expect(admin.text()).toContain('ไม่พบบุคลากรที่ตรงกับคำค้น')
    expect(admin.text()).toContain('ไปสร้างที่ข้อมูลบุคลากร')

    const operator = mountTypeahead({}, 'operator')
    await typeQuery(operator, 'ไม่มีคนนี้')
    await vi.advanceTimersByTimeAsync(300)
    await operator.vm.$nextTick()

    expect(operator.text()).toContain('ไม่พบบุคลากรที่ตรงกับคำค้น')
    expect(operator.text()).not.toContain('ไปสร้างที่ข้อมูลบุคลากร')
  })

  it('skips search during IME composition until compositionend', async () => {
    const wrapper = mountTypeahead()
    const input = wrapper.find('input')
    await input.trigger('compositionstart')
    await input.setValue('สม')
    await input.trigger('input')
    await vi.advanceTimersByTimeAsync(300)
    expect(mockSearchPersonnel).not.toHaveBeenCalled()

    await input.trigger('compositionend')
    await vi.advanceTimersByTimeAsync(300)
    expect(mockSearchPersonnel).toHaveBeenCalled()
  })

  it('clears text when external modelValue becomes null', async () => {
    const wrapper = mountTypeahead({ modelValue: 9, displayName: 'สมชาย ใจดี' })
    expect(wrapper.find('input').element.value).toBe('สมชาย ใจดี')

    await wrapper.setProps({ modelValue: null })
    expect(wrapper.find('input').element.value).toBe('')
  })

  it('shows displayName when modelValue has id (prefill path)', async () => {
    const wrapper = mountTypeahead({ modelValue: 12, displayName: 'นายสมชาย ไทยแท้' })
    expect(wrapper.find('input').element.value).toBe('นายสมชาย ไทยแท้')
  })

  it('drops slower first request when a second search overtakes it', async () => {
    let resolveFirst
    mockSearchPersonnel
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(async () => [{ personnel_id: 2, full_name: 'B คนสอง' }])
    const wrapper = mountTypeahead()
    await typeQuery(wrapper, 'สมช')
    await vi.advanceTimersByTimeAsync(300)

    await typeQuery(wrapper, 'สมชาย')
    await vi.advanceTimersByTimeAsync(300)
    resolveFirst([{ personnel_id: 1, full_name: 'A คนหนึ่ง' }])
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('B คนสอง')
    expect(wrapper.text()).not.toContain('A คนหนึ่ง')
  })

  it('disables input and never opens dropdown when disabled', async () => {
    const wrapper = mountTypeahead({ disabled: true })
    const input = wrapper.find('input')
    expect(input.element.disabled).toBe(true)

    await typeQuery(wrapper, 'สมช')
    await vi.advanceTimersByTimeAsync(300)

    expect(mockSearchPersonnel).not.toHaveBeenCalled()
    expect(wrapper.findAll('button')).toHaveLength(0)
  })
})
