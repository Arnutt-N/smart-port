<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <div class="flex gap-2 border-b border-gray-200 pb-1 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <RouterLink
        v-for="s in sections"
        :key="s.id"
        :to="`/candidates/${s.id}`"
        class="px-4 py-2 text-sm rounded-t-lg transition-colors"
        :class="activeSection === s.id
          ? 'bg-primary-50 text-primary-700 font-medium border-b-2 border-primary-500'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'"
      >
        {{ s.label }}
      </RouterLink>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard label="ทั้งหมดในบัญชี" :value="filteredCandidates.length" :icon="Users" />
      <StatCard label="มีสิทธิ์" :value="countByStatus('eligible')" :icon="CheckCircle" icon-bg-class="bg-green-50" icon-class="text-green-500" value-class="text-green-600" />
      <StatCard label="เกินกำหนด" :value="countByStatus('overdue')" :icon="AlertTriangle" icon-bg-class="bg-red-50" icon-class="text-red-500" value-class="text-red-600" />
    </div>

    <div class="flex flex-col sm:flex-row gap-3">
      <input
        v-model="search"
        type="text"
        class="input flex-1"
        placeholder="ค้นหาชื่อ-สกุล หรือตำแหน่ง..."
      />
    </div>

    <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-gray-500 text-left">
          <tr>
            <th class="px-6 py-3 font-medium">ลำดับ</th>
            <th class="px-6 py-3 font-medium">ชื่อ-สกุล</th>
            <th class="px-6 py-3 font-medium">ตำแหน่งปัจจุบัน</th>
            <th class="px-6 py-3 font-medium">ระดับ</th>
            <th class="px-6 py-3 font-medium">วันครบกำหนด</th>
            <th class="px-6 py-3 font-medium">วันคงเหลือ</th>
            <th class="px-6 py-3 font-medium">สถานะ</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="(c, i) in filteredCandidates" :key="c.id" class="hover:bg-blue-50/50 transition-all duration-150">
            <td class="px-6 py-3 text-gray-500">{{ i + 1 }}</td>
            <td class="px-6 py-3 text-gray-900 font-medium">{{ c.name }}</td>
            <td class="px-6 py-3 text-gray-600">{{ c.currentPosition }}</td>
            <td class="px-6 py-3 text-gray-600">{{ c.currentLevel }}</td>
            <td class="px-6 py-3 text-gray-500">{{ c.dueDate }}</td>
            <td class="px-6 py-3" :class="c.remainingDays <= 30 ? 'text-red-600 font-medium' : 'text-gray-500'">
              {{ c.remainingDays }} วัน
            </td>
            <td class="px-6 py-3">
              <StatusBadge :status="c.status" />
            </td>
          </tr>
          <tr v-if="filteredCandidates.length === 0">
            <td colspan="7" class="px-6 py-8 text-center text-gray-400">ไม่พบข้อมูล</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import StatCard from '@/components/StatCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Users, CheckCircle, AlertTriangle } from 'lucide-vue-next'

const props = defineProps({
  section: { type: String, default: 'general' },
})

const route = useRoute()
const search = ref('')

const activeSection = computed(() => route.params.section || props.section || 'general')

const sections = [
  { id: 'general', label: 'สายงานทั่วไป' },
  { id: 'academic', label: 'สายงานวิชาการ' },
  { id: 'support', label: 'สายงานอำนวยการ' },
  { id: 'management', label: 'สายงานบริหาร' },
]

const candidates = ref([
  { id: 1, name: 'นายสมชาย ใจดี', currentPosition: 'นักวิชาการ', currentLevel: 'ชำนาญงาน', dueDate: '15 เม.ย. 2569', remainingDays: 25, status: 'eligible', section: 'general' },
  { id: 2, name: 'นางสาวสมหญิง รักเรียน', currentPosition: 'นักจัดการ', currentLevel: 'ปฏิบัติการ', dueDate: '1 พ.ค. 2569', remainingDays: 41, status: 'pending', section: 'general' },
  { id: 3, name: 'นายประสิทธิ์ ทำงานดี', currentPosition: 'วิศวกร', currentLevel: 'ชำนาญการ', dueDate: '1 มี.ค. 2569', remainingDays: -20, status: 'overdue', section: 'academic' },
  { id: 4, name: 'นางวิลาวัลย์ ศรีสวัสดิ์', currentPosition: 'ผู้อำนวยการ', currentLevel: 'อำนวยการ', dueDate: '20 เม.ย. 2569', remainingDays: 30, status: 'eligible', section: 'support' },
  { id: 5, name: 'นายธีระ มั่นคง', currentPosition: 'ผู้บริหาร', currentLevel: 'บริหาร', dueDate: '10 พ.ค. 2569', remainingDays: 50, status: 'pending', section: 'management' },
])

const filteredCandidates = computed(() => {
  return candidates.value
    .filter((c) => c.section === activeSection.value)
    .filter((c) => {
      if (!search.value) return true
      const q = search.value.toLowerCase()
      return c.name.toLowerCase().includes(q) || c.currentPosition.toLowerCase().includes(q)
    })
})

function countByStatus(status) {
  return filteredCandidates.value.filter((c) => c.status === status).length
}
</script>
