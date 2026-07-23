import { useApi } from '@/composables/useApi.js'

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

  function mapRow(row) {
    return {
      proposalId: row.proposal_id,
      servantId: row.servant_id,
      servantName: row.servant_name,
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

  return { fetchList, fetchDetail }
}
