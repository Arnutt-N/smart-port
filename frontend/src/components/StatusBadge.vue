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

const props = defineProps({
  status: { type: String, required: true },
})

const statusMap = {
  upcoming: { label: 'กำลังจะถึง', class: 'bg-blue-50 text-blue-700' },
  pending: { label: 'รอดำเนินการ', class: 'bg-amber-50 text-amber-700' },
  overdue: { label: 'เลยกำหนด', class: 'bg-red-50 text-red-700' },
  eligible: { label: 'มีสิทธิ์', class: 'bg-green-50 text-green-700' },
  completed: { label: 'เสร็จสิ้น', class: 'bg-gray-100 text-gray-600' },
  ready: { label: 'พร้อมดำเนินการ', class: 'bg-green-50 text-green-700' },
  active: { label: 'ใช้งานอยู่', class: 'bg-blue-50 text-blue-700' },
  // Candidate display statuses (computed by useCandidates composable)
  NOT_MET: { label: 'ยังไม่ถึงเกณฑ์', class: 'bg-yellow-50 text-yellow-700' },
  NEAR_MET: { label: 'ใกล้ถึงเกณฑ์', class: 'bg-orange-50 text-orange-700' },
  MET: { label: 'ครบเกณฑ์', class: 'bg-green-50 text-green-700' },
  EXCEEDED: { label: 'ถึงเกณฑ์', class: 'bg-green-50 text-green-700' },
  PROMOTING: { label: 'กำลังดำเนินการ', class: 'bg-blue-50 text-blue-700' },
  // Candidate backend statuses (fallback)
  qualified: { label: 'ถึงเกณฑ์', class: 'bg-green-50 text-green-700' },
  not_yet: { label: 'ยังไม่ถึงเกณฑ์', class: 'bg-yellow-50 text-yellow-700' },
  check_data: { label: 'ตรวจสอบข้อมูล', class: 'bg-orange-50 text-orange-700' },
  // Probation display statuses (computed by useProbation composable)
  NOT_DUE: { label: 'ยังไม่ครบกำหนด', class: 'bg-yellow-50 text-yellow-700' },
  NEAR_DEADLINE: { label: 'ใกล้ครบกำหนด', class: 'bg-orange-50 text-orange-700' },
  READY: { label: 'พร้อมพ้นทดลอง', class: 'bg-green-50 text-green-700' },
  OVERDUE: { label: 'เกินกำหนด', class: 'bg-red-50 text-red-700' },
  IN_REVIEW: { label: 'กำลังดำเนินการ', class: 'bg-blue-50 text-blue-700' },
  // Probation backend statuses
  IN_PROGRESS: { label: 'กำลังดำเนินการ', class: 'bg-blue-50 text-blue-700' },
  COMPLETED: { label: 'ผ่านทดลอง', class: 'bg-green-50 text-green-700' },
  FAILED: { label: 'ไม่ผ่าน', class: 'bg-red-50 text-red-700' },
  EXTENDED: { label: 'ขยายเวลา', class: 'bg-orange-50 text-orange-700' },
  // Approval statuses (Position Equivalence)
  PENDING: { label: 'รออนุมัติ', class: 'bg-amber-50 text-amber-700' },
  APPROVED: { label: 'อนุมัติแล้ว', class: 'bg-green-50 text-green-700' },
  REJECTED: { label: 'ไม่อนุมัติ', class: 'bg-red-50 text-red-700' },
  // Diff count badges (Diverse Experience)
  DIFF_PASS: { label: 'ผ่านเกณฑ์', class: 'bg-green-50 text-green-700' },
  DIFF_NOT_YET: { label: 'ยังไม่ครบ', class: 'bg-amber-50 text-amber-700' },
  // Award types
  general: { label: 'ทั่วไป', class: 'bg-gray-100 text-gray-600' },
  performance: { label: 'ผลการปฏิบัติงาน', class: 'bg-blue-50 text-blue-700' },
  service: { label: 'การบริการ', class: 'bg-teal-50 text-teal-700' },
  honor: { label: 'เกียรติยศ', class: 'bg-purple-50 text-purple-700' },
  innovation: { label: 'นวัตกรรม', class: 'bg-indigo-50 text-indigo-700' },
  // Work-result / proposal statuses
  draft: { label: 'ร่าง', class: 'bg-gray-100 text-gray-600' },
  submitted: { label: 'ส่งแล้ว', class: 'bg-blue-50 text-blue-700' },
  under_review: { label: 'กำลังพิจารณา', class: 'bg-amber-50 text-amber-700' },
  approved: { label: 'อนุมัติ', class: 'bg-green-50 text-green-700' },
  rejected: { label: 'ไม่อนุมัติ', class: 'bg-red-50 text-red-700' },
}

const badgeClass = computed(() => statusMap[props.status]?.class || 'bg-gray-100 text-gray-600')
const statusLabel = computed(() => statusMap[props.status]?.label || props.status)
</script>
