import { useApi } from '@/composables/useApi.js'

export function useDecorations() {
  const api = useApi()

  async function fetchList({ search = '', limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    params.set('limit', limit)
    params.set('offset', offset)

    const result = await api.get(`/royal-decorations?${params}`)
    return {
      success: result.success,
      data: (result.data || []).map(mapRow),
      pagination: result.pagination,
    }
  }

  async function create(data) {
    return api.post('/royal-decorations', toPayload(data))
  }

  async function update(id, data) {
    return api.put(`/royal-decorations/${id}`, toPayload(data))
  }

  async function remove(id) {
    return api.del(`/royal-decorations/${id}`)
  }

  function toPayload(data) {
    const payload = {}
    if (data.servantId !== undefined) payload.servant_id = data.servantId
    if (data.decorationName !== undefined) payload.decoration_name = data.decorationName
    if (data.decorationClass !== undefined) payload.decoration_class = data.decorationClass
    if (data.receivedYear !== undefined) payload.received_year = data.receivedYear
    if (data.gazetteRef !== undefined) payload.gazette_ref = data.gazetteRef
    if (data.description !== undefined) payload.description = data.description
    return payload
  }

  function mapRow(row) {
    return {
      decorationId: row.decoration_id,
      servantId: row.servant_id,
      servantName: row.servant_name,
      decorationName: row.decoration_name,
      decorationClass: row.decoration_class,
      receivedYear: row.received_year,
      gazetteRef: row.gazette_ref,
      description: row.description,
      createdAt: row.created_at,
    }
  }

  return { fetchList, create, update, remove }
}
