import { useApi } from '@/composables/useApi.js'

/**
 * Shared personnel typeahead — one seam for เกื้อกูล / แตกต่าง / เทียบตำแหน่ง / ทวีคูณ pages.
 */
export function usePersonnelSearch() {
  const api = useApi()

  async function searchPersonnel(query, { limit = 10 } = {}) {
    const q = (query || '').trim()
    // อย่างน้อย 2 ตัวอักษร — กันยิง API ทุกคีย์และลดผลลัพธ์กว้างเกิน
    if (q.length < 2) return []

    const params = new URLSearchParams()
    params.set('search', q)
    params.set('limit', String(limit))
    const result = await api.get(`/personnel?${params}`)
    return Array.isArray(result?.data) ? result.data : []
  }

  return { searchPersonnel }
}
