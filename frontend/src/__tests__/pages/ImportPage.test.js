import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUploadResponse = vi.fn()

vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ uploadResponse: mockUploadResponse }),
}))

const ImportPage = (await import('@/pages/ImportPage.vue')).default

function makeFile(name, size = 1024) {
  const file = new File(['x'], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

function mockResponse({ ok, status = ok ? 200 : 422, body }) {
  return {
    ok,
    status,
    statusText: 'Error',
    json: vi.fn().mockResolvedValue(body),
  }
}

async function mountPage() {
  const wrapper = mount(ImportPage, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('ImportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders template download link and upload dropzone', async () => {
    const wrapper = await mountPage()
    const link = wrapper.find('a[download]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toContain('/import-template.xlsx')
    expect(wrapper.text()).toContain('รองรับ .xlsx ขนาดไม่เกิน 5MB')
  })

  it('rejects non-xlsx files before upload', async () => {
    const wrapper = await mountPage()
    wrapper.vm.pick(makeFile('data.csv'))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('รองรับเฉพาะไฟล์ .xlsx')
    expect(wrapper.vm.file).toBeNull()
    expect(mockUploadResponse).not.toHaveBeenCalled()
  })

  it('rejects files larger than 5MB', async () => {
    const wrapper = await mountPage()
    wrapper.vm.pick(makeFile('big.xlsx', 5 * 1024 * 1024 + 1))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('ไฟล์ใหญ่เกิน 5MB')
    expect(wrapper.vm.file).toBeNull()
  })

  it('accepts a valid xlsx and shows its name', async () => {
    const wrapper = await mountPage()
    wrapper.vm.pick(makeFile('personnel.xlsx'))
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.file.name).toBe('personnel.xlsx')
    expect(wrapper.text()).toContain('personnel.xlsx')
  })

  it('submits and shows summary on success', async () => {
    const wrapper = await mountPage()
    mockUploadResponse.mockResolvedValue(
      mockResponse({
        ok: true,
        body: { success: true, summary: { personnel: 10, diverse: 3, equivalence: 2, history: 5 } },
      }),
    )

    wrapper.vm.pick(makeFile('personnel.xlsx'))
    await wrapper.vm.submit()
    await wrapper.vm.$nextTick()

    expect(mockUploadResponse).toHaveBeenCalledWith('/import/executive', expect.any(FormData))
    expect(wrapper.vm.status).toBe('success')
    expect(wrapper.text()).toContain('นำเข้าสำเร็จ')
    expect(wrapper.text()).toContain('10')
  })

  it('shows server validation errors on failure response', async () => {
    const wrapper = await mountPage()
    mockUploadResponse.mockResolvedValue(
      mockResponse({
        ok: false,
        body: { success: false, errors: ['แถวที่ 3: ไม่พบเลขบัตรประชาชน', 'แถวที่ 7: วันที่ไม่ถูกต้อง'] },
      }),
    )

    wrapper.vm.pick(makeFile('personnel.xlsx'))
    await wrapper.vm.submit()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.status).toBe('error')
    expect(wrapper.text()).toContain('นำเข้าไม่สำเร็จ (2 รายการ)')
    expect(wrapper.text()).toContain('ไม่พบเลขบัตรประชาชน')
  })

  it('handles non-JSON error responses gracefully', async () => {
    const wrapper = await mountPage()
    mockUploadResponse.mockResolvedValue({
      ok: false,
      status: 413,
      statusText: 'Payload Too Large',
      json: vi.fn().mockRejectedValue(new Error('not json')),
    })

    wrapper.vm.pick(makeFile('personnel.xlsx'))
    await wrapper.vm.submit()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.status).toBe('error')
    expect(wrapper.text()).toContain('Payload Too Large')
  })

  it('shows connection error when upload throws', async () => {
    const wrapper = await mountPage()
    mockUploadResponse.mockRejectedValue(new Error('network down'))

    wrapper.vm.pick(makeFile('personnel.xlsx'))
    await wrapper.vm.submit()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
  })

  it('reset clears file, status and results', async () => {
    const wrapper = await mountPage()
    wrapper.vm.pick(makeFile('personnel.xlsx'))
    wrapper.vm.reset()

    expect(wrapper.vm.file).toBeNull()
    expect(wrapper.vm.status).toBe('idle')
    expect(wrapper.vm.errors).toEqual([])
    expect(wrapper.vm.summary).toBeNull()
  })
})
