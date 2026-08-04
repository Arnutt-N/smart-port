<template>
  <span
    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
    :class="badgeClass"
  >
    {{ statusLabel }}
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { ELIGIBILITY_STATUS_MAP } from '@/utils/displayEligibility.js'

const props = defineProps({
  status: { type: String, required: true },
})

/** Non-eligibility labels (awards, equivalence, work-results, legacy). */
const OTHER_STATUS_MAP = {
  upcoming: { label: 'กำลังจะถึง', class: 'bg-blue-50 text-blue-700' },
  pending: { label: 'รอดำเนินการ', class: 'bg-amber-50 text-amber-700' },
  overdue: { label: 'เลยกำหนด', class: 'bg-red-50 text-red-700' },
  eligible: { label: 'มีสิทธิ์', class: 'bg-green-50 text-green-700' },
  completed: { label: 'เสร็จสิ้น', class: 'bg-gray-100 text-gray-600' },
  ready: { label: 'พร้อมดำเนินการ', class: 'bg-green-50 text-green-700' },
  active: { label: 'ใช้งานอยู่', class: 'bg-blue-50 text-blue-700' },
  PENDING: { label: 'รออนุมัติ', class: 'bg-amber-50 text-amber-700' },
  APPROVED: { label: 'อนุมัติแล้ว', class: 'bg-green-50 text-green-700' },
  REJECTED: { label: 'ไม่อนุมัติ', class: 'bg-red-50 text-red-700' },
  DIFF_PASS: { label: 'ผ่านเกณฑ์', class: 'bg-green-50 text-green-700' },
  DIFF_NOT_YET: { label: 'ยังไม่ครบ', class: 'bg-amber-50 text-amber-700' },
  general: { label: 'ทั่วไป', class: 'bg-gray-100 text-gray-600' },
  performance: { label: 'ผลการปฏิบัติงาน', class: 'bg-blue-50 text-blue-700' },
  service: { label: 'การบริการ', class: 'bg-teal-50 text-teal-700' },
  honor: { label: 'เกียรติยศ', class: 'bg-purple-50 text-purple-700' },
  innovation: { label: 'นวัตกรรม', class: 'bg-indigo-50 text-indigo-700' },
  draft: { label: 'ร่าง', class: 'bg-gray-100 text-gray-600' },
  submitted: { label: 'ส่งแล้ว', class: 'bg-blue-50 text-blue-700' },
  under_review: { label: 'กำลังพิจารณา', class: 'bg-amber-50 text-amber-700' },
  approved: { label: 'อนุมัติ', class: 'bg-green-50 text-green-700' },
  rejected: { label: 'ไม่อนุมัติ', class: 'bg-red-50 text-red-700' },
}

const statusMap = { ...OTHER_STATUS_MAP, ...ELIGIBILITY_STATUS_MAP }

const badgeClass = computed(() => statusMap[props.status]?.class || 'bg-gray-100 text-gray-600')
const statusLabel = computed(() => statusMap[props.status]?.label || props.status)
</script>
