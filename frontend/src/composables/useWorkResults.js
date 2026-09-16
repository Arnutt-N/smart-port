import { useApi } from '@/composables/useApi.js'

function toPayload(data) {
  const payload = {}
  if (data.personnelId !== undefined) payload.personnel_id = data.personnelId
  if (data.proposalType !== undefined) payload.proposal_type = data.proposalType
  if (data.title !== undefined) payload.title = data.title
  if (data.description !== undefined) payload.description = data.description
  if (data.impactDescription !== undefined) payload.impact_description = data.impactDescription
  if (data.quantitativeResult !== undefined) payload.quantitative_result = data.quantitativeResult
  if (data.resultUnit !== undefined) payload.result_unit = data.resultUnit
  if (data.submissionDate !== undefined) payload.submission_date = data.submissionDate
  if (data.evaluationScore !== undefined) payload.evaluation_score = data.evaluationScore
  if (data.status !== undefined) payload.status = data.status
  if (data.approvalLevel !== undefined) payload.approval_level = data.approvalLevel
  return payload
}

function mapRow(row) {
  return {
    proposalId: row.proposal_id,
    personnelId: row.personnel_id,
    personnelName: row.personnel_name,
    proposalType: row.proposal_type,
    title: row.title,
    description: row.description,
    impactDescription: row.impact_description,
    quantitativeResult: row.quantitative_result,
    resultUnit: row.result_unit,
    submissionDate: row.submission_date,
    evaluationScore: row.evaluation_score,
    status: row.status,
    approvalLevel: row.approval_level,
    createdAt: row.created_at,
  }
}

export function useWorkResults() {
  const api = useApi()

  async function fetchList({ search = '', status = '', limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (status) params.set('status', status)
    params.set('limit', limit)
    params.set('offset', offset)

    const result = await api.get(`/work-results?${params}`)
    return {
      success: result.success,
      data: (result.data || []).map(mapRow),
      pagination: result.pagination,
    }
  }

  async function fetchDetail(id) {
    const result = await api.get(`/work-results/${id}`)
    return { success: result.success, data: result.data ? mapRow(result.data) : null }
  }

  async function create(data) {
    return api.post('/work-results', toPayload(data))
  }

  async function update(id, data) {
    return api.put(`/work-results/${id}`, toPayload(data))
  }

  async function remove(id) {
    return api.del(`/work-results/${id}`)
  }

  return { fetchList, fetchDetail, create, update, remove }
}
