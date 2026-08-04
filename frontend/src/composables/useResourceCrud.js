import { useApi } from '@/composables/useApi.js'

/**
 * Parameterized list/CRUD adapter for personnel-linked resources.
 *
 * @param {{
 *   path: string,
 *   mapRow: (row: object) => object,
 *   toPayload: (data: object) => object,
 * }} config
 */
export function useResourceCrud({ path, mapRow, toPayload }) {
  const api = useApi()
  const base = path.replace(/^\//, '').replace(/\/$/, '')

  async function fetchList({ search = '', limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    params.set('limit', String(limit))
    params.set('offset', String(offset))

    const result = await api.get(`/${base}?${params}`)
    return {
      success: result.success,
      data: (result.data || []).map(mapRow),
      pagination: result.pagination,
    }
  }

  async function create(data) {
    return api.post(`/${base}`, toPayload(data))
  }

  async function update(id, data) {
    return api.put(`/${base}/${id}`, toPayload(data))
  }

  async function remove(id) {
    return api.del(`/${base}/${id}`)
  }

  return { fetchList, create, update, remove }
}
