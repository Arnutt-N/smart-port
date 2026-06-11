import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock useApi before importing useUsers
const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
vi.mock('@/composables/useApi.js', () => ({
  useApi: () => ({ get: mockGet, post: mockPost, put: mockPut }),
}))

const { useUsers } = await import('@/composables/useUsers.js')

describe('useUsers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
  })

  describe('fetchList', () => {
    it('calls API with default params', async () => {
      mockGet.mockResolvedValue({ success: true, data: [], pagination: { total: 0 } })

      const { fetchList } = useUsers()
      await fetchList()

      expect(mockGet).toHaveBeenCalledTimes(1)
      const url = mockGet.mock.calls[0][0]
      expect(url).toContain('/users?')
      expect(url).toContain('limit=20')
      expect(url).toContain('offset=0')
    })

    it('encodes Thai search param in URL', async () => {
      mockGet.mockResolvedValue({ success: true, data: [], pagination: { total: 0 } })

      const { fetchList } = useUsers()
      await fetchList({ search: 'สมชาย', limit: 10, offset: 20 })

      const url = mockGet.mock.calls[0][0]
      expect(url).toContain('search=%E0%B8%AA%E0%B8%A1%E0%B8%8A%E0%B8%B2%E0%B8%A2')
      expect(url).toContain('limit=10')
      expect(url).toContain('offset=20')
    })

    it('maps snake_case rows to camelCase with boolean coercion', async () => {
      mockGet.mockResolvedValue({
        success: true,
        data: [{
          user_id: 5,
          username: 'somchai.j',
          full_name: 'สมชาย ใจดี',
          email: null,
          role: 'operator',
          is_active: '1',
          must_change_password: '0',
          last_login_at: '2026-06-11 10:00:00',
          created_at: '2026-06-01 09:00:00',
        }],
        pagination: { total: 1, limit: 20, offset: 0, has_more: false },
      })

      const { fetchList } = useUsers()
      const result = await fetchList()

      expect(result.data).toHaveLength(1)
      const row = result.data[0]
      expect(row.userId).toBe(5)
      expect(row.username).toBe('somchai.j')
      expect(row.fullName).toBe('สมชาย ใจดี')
      expect(row.isActive).toBe(true)
      expect(row.mustChangePassword).toBe(false)
      expect(row.lastLoginAt).toBe('2026-06-11 10:00:00')
    })

    it('coerces is_active "0" to false', async () => {
      mockGet.mockResolvedValue({
        success: true,
        data: [{ user_id: 2, username: 'x', full_name: 'y', role: 'admin', is_active: '0', must_change_password: '1' }],
        pagination: { total: 1 },
      })

      const { fetchList } = useUsers()
      const result = await fetchList()

      expect(result.data[0].isActive).toBe(false)
      expect(result.data[0].mustChangePassword).toBe(true)
    })
  })

  describe('create', () => {
    it('posts full payload in snake_case', async () => {
      mockPost.mockResolvedValue({ success: true, user_id: 9 })

      const { create } = useUsers()
      await create({
        username: 'somying',
        password: 'secret123',
        fullName: 'สมหญิง ขยัน',
        email: 'somying@example.go.th',
        role: 'operator',
      })

      expect(mockPost).toHaveBeenCalledWith('/users', {
        username: 'somying',
        password: 'secret123',
        full_name: 'สมหญิง ขยัน',
        email: 'somying@example.go.th',
        role: 'operator',
      })
    })

    it('sends null email when omitted', async () => {
      mockPost.mockResolvedValue({ success: true, user_id: 10 })

      const { create } = useUsers()
      await create({ username: 'a', password: 'secret123', fullName: 'ก', role: 'admin' })

      expect(mockPost.mock.calls[0][1].email).toBeNull()
    })
  })

  describe('update', () => {
    it('puts only provided fields', async () => {
      mockPut.mockResolvedValue({ success: true })

      const { update } = useUsers()
      await update(5, { password: 'newsecret1' })

      expect(mockPut).toHaveBeenCalledWith('/users/5', { password: 'newsecret1' })
    })

    it('converts isActive boolean to 0/1', async () => {
      mockPut.mockResolvedValue({ success: true })

      const { update } = useUsers()
      await update(7, { isActive: false })

      expect(mockPut).toHaveBeenCalledWith('/users/7', { is_active: 0 })
    })

    it('maps fullName/email/role to snake_case', async () => {
      mockPut.mockResolvedValue({ success: true })

      const { update } = useUsers()
      await update(3, { fullName: 'ใหม่', email: null, role: 'admin' })

      expect(mockPut).toHaveBeenCalledWith('/users/3', {
        full_name: 'ใหม่',
        email: null,
        role: 'admin',
      })
    })

    it('does not send empty password', async () => {
      mockPut.mockResolvedValue({ success: true })

      const { update } = useUsers()
      await update(4, { fullName: 'x', password: '' })

      expect(mockPut).toHaveBeenCalledWith('/users/4', { full_name: 'x' })
    })
  })
})
