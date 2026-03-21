<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="ทั้งหมด" :value="employees.length" :icon="Users" />
      <StatCard label="พร้อมดำเนินการ" :value="countByStatus('ready')" :icon="CheckCircle" icon-bg-class="bg-green-50" icon-class="text-green-500" value-class="text-green-600" />
      <StatCard label="ใกล้ครบกำหนด" :value="countByStatus('upcoming')" :icon="Clock" icon-bg-class="bg-yellow-50" icon-class="text-yellow-500" value-class="text-yellow-600" />
      <StatCard label="เกินกำหนด" :value="countByStatus('overdue')" :icon="AlertTriangle" icon-bg-class="bg-red-50" icon-class="text-red-500" value-class="text-red-600" />
    </div>

    <input
      v-model="search"
      type="text"
      class="input max-w-md"
      placeholder="ค้นหาชื่อ-สกุล, ตำแหน่ง หรือหน่วยงาน..."
    />

    <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-gray-500 text-left">
          <tr>
            <th class="px-6 py-3 font-medium">ลำดับ</th>
            <th class="px-6 py-3 font-medium">ชื่อ-สกุล</th>
            <th class="px-6 py-3 font-medium">ตำแหน่ง</th>
            <th class="px-6 py-3 font-medium">หน่วยงาน</th>
            <th class="px-6 py-3 font-medium">วันเริ่มทดลอง</th>
            <th class="px-6 py-3 font-medium">วันครบกำหนด</th>
            <th class="px-6 py-3 font-medium">วันคงเหลือ</th>
            <th class="px-6 py-3 font-medium">สถานะ</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="(e, i) in filtered" :key="e.id" class="hover:bg-gray-50">
            <td class="px-6 py-3 text-gray-500">{{ i + 1 }}</td>
            <td class="px-6 py-3 text-gray-900 font-medium">{{ e.name }}</td>
            <td class="px-6 py-3 text-gray-600">{{ e.position }}</td>
            <td class="px-6 py-3 text-gray-600">{{ e.department }}</td>
            <td class="px-6 py-3 text-gray-500">{{ e.startDate }}</td>
            <td class="px-6 py-3 text-gray-500">{{ e.endDate }}</td>
            <td class="px-6 py-3" :class="e.remainingDays <= 30 ? 'text-red-600 font-medium' : 'text-gray-500'">
              {{ e.remainingDays }} วัน
            </td>
            <td class="px-6 py-3">
              <StatusBadge :status="e.status" />
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="8" class="px-6 py-8 text-center text-gray-400">ไม่พบข้อมูล</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import StatCard from '@/components/StatCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Users, CheckCircle, Clock, AlertTriangle } from 'lucide-vue-next'

const search = ref('')

const employees = ref([
  { id: 1, name: 'นายวีระ สุขสวัสดิ์', position: 'นักวิชาการ', department: 'กองบริหารงานบุคคล', startDate: '1 ต.ค. 2568', endDate: '31 มี.ค. 2569', remainingDays: 10, status: 'upcoming' },
  { id: 2, name: 'นางสาวพิมพ์ชนก แก้วใส', position: 'นักจัดการทั่วไป', department: 'กองคลัง', startDate: '1 พ.ย. 2568', endDate: '30 เม.ย. 2569', remainingDays: 40, status: 'ready' },
  { id: 3, name: 'นายอรรถพล มีศรี', position: 'วิศวกร', department: 'กองช่าง', startDate: '1 ก.ย. 2568', endDate: '28 ก.พ. 2569', remainingDays: -21, status: 'overdue' },
  { id: 4, name: 'นางสาวรัตนา ดวงดี', position: 'นักวิเคราะห์นโยบาย', department: 'กองแผน', startDate: '1 ต.ค. 2568', endDate: '31 มี.ค. 2569', remainingDays: 10, status: 'upcoming' },
  { id: 5, name: 'นายชัยวัฒน์ ทองคำ', position: 'นักทรัพยากรบุคคล', department: 'กองบริหารงานบุคคล', startDate: '1 ธ.ค. 2568', endDate: '31 พ.ค. 2569', remainingDays: 71, status: 'ready' },
])

const filtered = computed(() => {
  if (!search.value) return employees.value
  const q = search.value.toLowerCase()
  return employees.value.filter(
    (e) => e.name.toLowerCase().includes(q) || e.position.toLowerCase().includes(q) || e.department.toLowerCase().includes(q)
  )
})

function countByStatus(status) {
  return employees.value.filter((e) => e.status === status).length
}
</script>
