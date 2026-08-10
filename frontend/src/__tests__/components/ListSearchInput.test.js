import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ListSearchInput from '@/components/ListSearchInput.vue'

describe('ListSearchInput', () => {
  it('emits search on input when imeGuard is off', async () => {
    const wrapper = mount(ListSearchInput, {
      props: { modelValue: '', imeGuard: false },
    })
    const input = wrapper.find('input')
    await input.setValue('abc')
    await input.trigger('input')
    expect(wrapper.emitted('search')?.at(-1)).toEqual(['abc'])
  })

  it('suppresses search during IME composition when imeGuard is on', async () => {
    const wrapper = mount(ListSearchInput, {
      props: { modelValue: '', imeGuard: true },
    })
    const input = wrapper.find('input')

    await input.trigger('compositionstart')
    await input.setValue('ก')
    await input.trigger('input')
    expect(wrapper.emitted('search')).toBeUndefined()

    await input.trigger('compositionend')
    expect(wrapper.emitted('search')?.at(-1)).toEqual(['ก'])
  })
})
