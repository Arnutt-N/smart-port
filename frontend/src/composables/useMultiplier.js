import { useApi } from '@/composables/useApi.js'

export function useMultiplier() {
  const api = useApi()

  async function fetchList({ limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams()
    params.set('limit', limit)
    params.set('offset', offset)

    const result = await api.get(`/multiplier?${params}`)
    return {
      success: result.success,
      data: (result.data || []).map(mapRow),
      summary: result.summary || {},
      pagination: result.pagination || { total: 0, limit, offset, has_more: false },
    }
  }

  async function fetchAreas({ province = '', district = '', activeOnly = true } = {}) {
    const params = new URLSearchParams()
    if (province) params.set('province', province)
    if (district) params.set('district', district)
    params.set('active_only', activeOnly ? '1' : '0')

    const result = await api.get(`/multiplier/areas?${params}`)
    return {
      success: result.success,
      data: (result.data || []).map(mapArea),
      summary: result.summary || { total: 0, source_pending: 0 },
    }
  }

  function mapArea(row) {
    return {
      areaMultiplierId: row.area_multiplier_id,
      province: row.province,
      district: row.district,
      areaLabel: row.area_label,
      basisType: row.basis_type,
      multiplierRatio: row.multiplier_ratio,
      effectiveStartDate: row.effective_start_date,
      effectiveEndDate: row.effective_end_date,
      effectiveStartDateThai: row.effective_start_date_thai,
      effectiveEndDateThai: row.effective_end_date_thai,
      legalReference: row.legal_reference,
      sourceReference: row.source_reference,
      isActive: row.is_active === 1,
      sourcePending: Boolean(row.source_pending),
    }
  }

  async function create(data) {
    return api.post('/multiplier', data)
  }

  async function createArea(data) {
    const result = await api.post('/multiplier/areas', data)
    return {
      success: result.success,
      areaMultiplierId: result.area_multiplier_id,
      data: mapArea(result.data),
    }
  }

  async function setAreaStatus(areaMultiplierId, isActive) {
    const result = await api.put(`/multiplier/areas/${areaMultiplierId}/status`, {
      is_active: isActive ? 1 : 0,
    })
    return { success: result.success, data: mapArea(result.data) }
  }

  function mapRow(row) {
    return {
      multiplierId: row.multiplier_id,
      personnelId: row.personnel_id,
      fullName: row.full_name,
      areaMultiplierId: row.area_multiplier_id,
      province: row.province,
      district: row.district,
      areaLabel: row.area_label,
      basisType: row.basis_type,
      startDate: row.start_date,
      endDate: row.end_date,
      startDateThai: row.start_date_thai,
      endDateThai: row.end_date_thai,
      eligibleStartDate: row.eligible_start_date,
      eligibleEndDate: row.eligible_end_date,
      eligibleStartDateThai: row.eligible_start_date_thai,
      eligibleEndDateThai: row.eligible_end_date_thai,
      serviceDays: row.service_days,
      eligibleDays: row.eligible_days,
      multiplierRatio: row.multiplier_ratio,
      effectiveDays: row.effective_days,
      bonusDays: row.bonus_days,
      netYears: row.net_years,
      netMonths: row.net_months,
      netDayRemainder: row.net_day_remainder,
      proofReference: row.proof_reference,
      description: row.description,
    }
  }

  return { fetchList, fetchAreas, create, createArea, setAreaStatus }
}
