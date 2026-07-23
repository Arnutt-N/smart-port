import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet }),
}))

const { useProfile } = await import('@/composables/useProfile.js')

describe('useProfile', () => {
  beforeEach(() => {
    mockGet.mockReset()
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
        servant_id: 5, employee_id: 'EMP005', first_name: 'สม', last_name: 'ชาย',
        full_name: 'นายสมชาย', birth_date: '1980-01-01', appointment_date: '2000-01-01',
        retirement_date: '2040-09-30', servant_status: 'active', photo_path: '/x.jpg',
      },
    })
    const { fetchById } = useProfile()
    const result = await fetchById(5)
    expect(mockGet).toHaveBeenCalledWith('/profile/5')
    expect(result.data.servantId).toBe(5)
    expect(result.data.fullName).toBe('นายสมชาย')
    expect(result.data.photoPath).toBe('/x.jpg')
  })

  it('returns null data when API returns none', async () => {
    mockGet.mockResolvedValue({ success: true, data: null })
    const { fetchMe } = useProfile()
    const result = await fetchMe()
    expect(result.data).toBeNull()
  })
})
