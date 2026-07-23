import { useApi } from '@/composables/useApi.js'

export function useAnalytics() {
  const api = useApi()

  async function fetchSummary() {
    const result = await api.get('/analytics')
    const d = result.data || {}
    return {
      success: result.success,
      data: {
        totals: mapTotals(d.totals || {}),
        proposalsByStatus: (d.proposals_by_status || []).map(mapBucket),
        awardsByType: (d.awards_by_type || []).map(mapBucket),
      },
    }
  }

  function mapTotals(t) {
    return {
      personnel: Number(t.personnel || 0),
      civilServants: Number(t.civil_servants || 0),
      awards: Number(t.awards || 0),
      decorations: Number(t.decorations || 0),
      workResults: Number(t.work_results || 0),
      retirementUpcoming: Number(t.retirement_upcoming || 0),
    }
  }

  function mapBucket(row) {
    return { label: row.label ?? '', count: Number(row.count || 0) }
  }

  return { fetchSummary }
}
