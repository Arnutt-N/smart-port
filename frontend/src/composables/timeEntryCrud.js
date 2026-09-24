import { useResourceCrud } from '@/composables/useResourceCrud.js'
import { useApi } from '@/composables/useApi.js'

function supportiveMapRow(row) {
  return {
    supportiveId: row.supportive_id,
    personnelId: row.personnel_id,
    fullName: row.full_name,
    jobSeriesName: row.job_series_name,
    primarySeriesName: row.primary_series_name,
    startDate: row.start_date,
    endDate: row.end_date,
    startDateThai: row.start_date_thai,
    endDateThai: row.end_date_thai,
    totalDays: row.total_days,
    ratioPercent: row.ratio_percent,
    effectiveDays: row.effective_days,
    netEndDate: row.net_end_date,
    description: row.description,
  }
}

function diverseMapRow(row) {
  return {
    experienceId: row.experience_id,
    personnelId: row.personnel_id,
    fullName: row.full_name,
    fromJobSeries: row.from_job_series,
    fromWorkGroup: row.from_work_group,
    fromDivision: row.from_division,
    fromOrgId: row.from_org_id,
    fromProvince: row.from_province,
    fromStartDate: row.from_start_date,
    fromEndDate: row.from_end_date,
    fromStartDateThai: row.from_start_date_thai,
    fromEndDateThai: row.from_end_date_thai,
    toJobSeries: row.to_job_series,
    toWorkGroup: row.to_work_group,
    toDivision: row.to_division,
    toOrgId: row.to_org_id,
    toProvince: row.to_province,
    toStartDate: row.to_start_date,
    toEndDate: row.to_end_date,
    toStartDateThai: row.to_start_date_thai,
    toEndDateThai: row.to_end_date_thai,
    isDiffJobSeries: row.is_diff_job_series,
    isDiffOrg: row.is_diff_org,
    isDiffLocation: row.is_diff_location,
    isDiffWorkNature: row.is_diff_work_nature,
    diffCount: row.diff_count,
    qualifiedDate: row.qualified_date,
    qualifiedDateThai: row.qualified_date_thai,
  }
}

function equivalenceMapRow(row) {
  return {
    equivalenceId: row.equivalence_id,
    personnelId: row.personnel_id,
    fullName: row.full_name,
    actualPosition: row.actual_position,
    equivalentType: row.equivalent_type,
    requestStartDate: row.request_start_date,
    requestEndDate: row.request_end_date,
    requestStartDateThai: row.request_start_date_thai,
    requestEndDateThai: row.request_end_date_thai,
    requestTotalDays: row.request_total_days,
    approvalStatus: row.approval_status,
    approvedStartDate: row.approved_start_date,
    approvedEndDate: row.approved_end_date,
    approvedStartDateThai: row.approved_start_date_thai,
    approvedEndDateThai: row.approved_end_date_thai,
    approvedTotalDays: row.approved_total_days,
    approvedBy: row.approved_by,
    approvedByName: row.approved_by_name,
    approvalOrderRef: row.approval_order_ref,
  }
}

export function useSupportive() {
  return useResourceCrud({ path: 'supportive', mapRow: supportiveMapRow })
}

export function useDiverse() {
  return useResourceCrud({ path: 'diverse', mapRow: diverseMapRow })
}

export function useEquivalence() {
  const api = useApi()
  return {
    ...useResourceCrud({ path: 'equivalence', mapRow: equivalenceMapRow }),
    approve: async (id, data) => {
      return api.put(`/equivalence/${id}`, {
        approval_status: 'APPROVED',
        approved_start_date: data.approvedStartDate,
        approved_end_date: data.approvedEndDate,
      })
    },
    reject: async (id) => {
      return api.put(`/equivalence/${id}`, {
        approval_status: 'REJECTED',
      })
    },
  }
}
