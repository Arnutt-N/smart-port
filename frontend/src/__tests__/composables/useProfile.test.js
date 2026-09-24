import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockSign = vi.fn()
vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet }),
  getSignedPhotoUrl: (...args) => mockSign(...args),
}))

const { useProfile } = await import('@/composables/useProfile.js')

describe('useProfile', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockSign.mockReset()
    mockSign.mockImplementation(async (f) => `/api/uploads/${f}?exp=999&sig=test`)
  })

  it('exposes fetchMe and fetchById', () => {
    const api = useProfile()
    expect(typeof api.fetchMe).toBe('function')
    expect(typeof api.fetchById).toBe('function')
  })

  it('fetchMe calls /profile and maps account row', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        user_id: 1, username: 'admin', full_name: 'ผู้ดูแล', email: 'a@b.c',
        role: 'admin', is_active: 1, must_change_password: 0,
        last_login_at: '2024-01-01', created_at: '2023-01-01',
      },
    })
    const { fetchMe } = useProfile()
    const result = await fetchMe()
    expect(mockGet).toHaveBeenCalledWith('/profile')
    expect(result.data).toEqual({
      userId: 1, username: 'admin', fullName: 'ผู้ดูแล', email: 'a@b.c',
      role: 'admin', isActive: true, mustChangePassword: false,
      lastLoginAt: '2024-01-01', createdAt: '2023-01-01',
    })
  })

  it('fetchById calls /profile/{id} and maps servant row', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        personnel_id: 5, employee_id: 'EMP005', first_name: 'สม', last_name: 'ชาย',
        full_name: 'นายสมชาย', birth_date: '1980-01-01', appointment_date: '2000-01-01',
        retirement_date: '2040-09-30', servant_status: 'active',
        photo_path: 'uploads/photo_abc.jpg',
      },
    })
    const { fetchById } = useProfile()
    const result = await fetchById(5)
    expect(mockGet).toHaveBeenCalledWith('/profile/5')
    expect(result.data.personnelId).toBe(5)
    expect(result.data.fullName).toBe('นายสมชาย')
    // ต้องขอ signed URL ด้วยชื่อไฟล์ (ไม่ใช่ path ดิบ) แล้วได้ URL เต็มกลับมา
    expect(mockSign).toHaveBeenCalledWith('photo_abc.jpg')
    expect(result.data.photoPath).toBe('/api/uploads/photo_abc.jpg?exp=999&sig=test')
  })

  it('maps a missing photo to null instead of a broken image URL', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: { personnel_id: 6, full_name: 'นางสาวสมหญิง', photo_path: null },
    })
    const { fetchById } = useProfile()
    const result = await fetchById(6)
    expect(result.data.photoPath).toBeNull()
    expect(mockSign).not.toHaveBeenCalled()
  })

  it('falls back to null when signing fails so the placeholder shows', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: { personnel_id: 7, full_name: 'นายล้มเหลว', photo_path: 'uploads/broken.jpg' },
    })
    mockSign.mockRejectedValueOnce(new Error('403'))
    const { fetchById } = useProfile()
    const result = await fetchById(7)
    expect(result.data.photoPath).toBeNull()
  })

  it('returns null data when API returns none', async () => {
    mockGet.mockResolvedValue({ success: true, data: null })
    const { fetchMe } = useProfile()
    const result = await fetchMe()
    expect(result.data).toBeNull()
  })
})
