import { useApi } from '@/composables/useApi.js'

export function useAwards() {
  const api = useApi()

  async function fetchList({ search = '', limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    params.set('limit', limit)
    params.set('offset', offset)

    const result = await api.get(`/awards?${params}`)
    return {
      success: result.success,
      data: (result.data || []).map(mapRow),
      pagination: result.pagination,
    }
  }

  async function create(data) {
    return api.post('/awards', toPayload(data))
  }

  async function update(id, data) {
    return api.put(`/awards/${id}`, toPayload(data))
  }

  async function remove(id) {
    return api.del(`/awards/${id}`)
  }

  function toPayload(data) {
    const payload = {}
    if (data.servantId !== undefined) payload.servant_id = data.servantId
    if (data.awardName !== undefined) payload.award_name = data.awardName
    if (data.awardType !== undefined) payload.award_type = data.awardType
    if (data.awardLevel !== undefined) payload.award_level = data.awardLevel
    if (data.awardedDate !== undefined) payload.awarded_date = data.awardedDate
    if (data.description !== undefined) payload.description = data.description
    return payload
  }

  function mapRow(row) {
    return {
      awardId: row.award_id,
      servantId: row.servant_id,
      servantName: row.servant_name,
      awardName: row.award_name,
      awardType: row.award_type,
      awardLevel: row.award_level,
      awardedDate: row.awarded_date,
      description: row.description,
      createdAt: row.created_at,
    }
  }

  return { fetchList, create, update, remove }
}
