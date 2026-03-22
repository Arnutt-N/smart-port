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
  // Candidate statuses (lowercase from backend)
  qualified: { label: 'ครบกำหนด', class: 'bg-green-50 text-green-700' },
  not_yet: { label: 'รอดำเนินการ', class: 'bg-amber-50 text-amber-700' },
  check_data: { label: 'ตรวจสอบข้อมูล', class: 'bg-orange-50 text-orange-700' },
  // Probation statuses (UPPER_CASE from backend -- case-sensitive)
  IN_PROGRESS: { label: 'กำลังดำเนินการ', class: 'bg-blue-50 text-blue-700' },
  COMPLETED: { label: 'ผ่านทดลอง', class: 'bg-green-50 text-green-700' },
  FAILED: { label: 'ไม่ผ่าน', class: 'bg-red-50 text-red-700' },
  EXTENDED: { label: 'ขยายเวลา', class: 'bg-orange-50 text-orange-700' },
}

const badgeClass = computed(() => statusMap[props.status]?.class || 'bg-gray-100 text-gray-600')
const statusLabel = computed(() => statusMap[props.status]?.label || props.status)
</script>
