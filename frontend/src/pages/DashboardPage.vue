<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <!-- Page Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">ภาพรวมระบบสมุดพก</h1>
        <p class="text-gray-600 mt-1">สรุปข้อมูลสำคัญและกิจกรรมล่าสุดของระบบการจัดการข้าราชการ</p>
      </div>
      <div class="flex items-center space-x-3">
        <button @click="fetchDashboard" class="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
          <span>รีเฟรช</span>
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading && !stats.totalPersonnel" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <SkeletonLoader v-for="i in 4" :key="i" height="h-28" />
    </div>

    <!-- Statistics Cards -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard label="จำนวนข้าราชการทั้งหมด" :value="stats.totalPersonnel.toLocaleString()" :icon="Users" icon-bg-class="bg-blue-50" icon-class="text-blue-600" />
      <StatCard label="ติดตามพ้นทดลอง" :value="stats.probationTotal.toLocaleString()" :icon="UserCheck" icon-bg-class="bg-green-50" icon-class="text-green-600" />
      <StatCard label="ผู้มีคุณสมบัติเลื่อนระดับ" :value="stats.candidateTotal.toLocaleString()" :icon="TrendingUp" icon-bg-class="bg-orange-50" icon-class="text-orange-600" />
      <StatCard label="การนับเวลาเพิ่มเติม" :value="stats.timeCountTotal.toLocaleString()" :icon="Clock" icon-bg-class="bg-purple-50" icon-class="text-purple-600" />
    </div>

    <!-- Multiplier Summary Section -->
    <div class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg shadow-sm border border-indigo-100 p-6">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-indigo-100 rounded-lg">
            <Clock class="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900">สรุปการนับทวีคูณ</h3>
            <p class="text-sm text-gray-600">การนับเวลาราชการในพื้นที่พิเศษเป็นทวีคูณ</p>
          </div>
        </div>
        <RouterLink
          to="/time-multiplier"
          class="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          ดูทั้งหมด →
        </RouterLink>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-lg p-4 shadow-sm">
          <div class="text-sm text-gray-600 mb-1">รายการทั้งหมด</div>
          <div class="text-2xl font-bold text-gray-900">{{ multiplierSummary.totalRecords.toLocaleString() }}</div>
          <div class="text-xs text-gray-500 mt-1">รายการ</div>
        </div>
        <div class="bg-white rounded-lg p-4 shadow-sm">
          <div class="text-sm text-gray-600 mb-1">จำนวนบุคลากร</div>
          <div class="text-2xl font-bold text-indigo-600">{{ multiplierSummary.distinctPersonnel.toLocaleString() }}</div>
          <div class="text-xs text-gray-500 mt-1">คน</div>
        </div>
        <div class="bg-white rounded-lg p-4 shadow-sm">
          <div class="text-sm text-gray-600 mb-1">วันทวีคูณรวม</div>
          <div class="text-2xl font-bold text-purple-600">{{ formatNumber(multiplierSummary.totalBonusDays) }}</div>
          <div class="text-xs text-gray-500 mt-1">วัน</div>
        </div>
        <div class="bg-white rounded-lg p-4 shadow-sm">
          <div class="text-sm text-gray-600 mb-1">ประมาณการ</div>
          <div class="text-2xl font-bold text-green-600">{{ multiplierSummary.totalBonusYears.toLocaleString() }}</div>
          <div class="text-xs text-gray-500 mt-1">ปี</div>
        </div>
      </div>
    </div>

    <!-- Main Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Priority Tasks (2/3 width) -->
      <div class="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200">
        <div class="p-6 border-b border-gray-200">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900">งานสำคัญที่ต้องติดตาม</h2>
            <AlertCircle class="w-5 h-5 text-orange-500" />
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">รายการ</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">จำนวน</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ความสำคัญ</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="task in priorityTasks" :key="task.title" class="hover:bg-blue-50/50 transition-all duration-150 cursor-default">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center space-x-3">
                    <component :is="task.icon" class="w-5 h-5" :class="task.iconColor" />
                    <span class="text-sm font-medium text-gray-900">{{ task.title }}</span>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ task.count }} คน</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full" :class="task.priorityColor">
                    {{ task.priority }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <RouterLink :to="task.route" class="text-blue-600 hover:text-blue-800 text-sm font-medium">
                    ดูรายละเอียด
                  </RouterLink>
                </td>
              </tr>
              <tr v-if="priorityTasks.length === 0">
                <td colspan="4" class="px-6 py-8 text-center text-gray-400">ไม่มีงานที่ต้องดำเนินการ</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Right Column: Quick Actions + Summary -->
      <div class="space-y-6">
        <!-- Quick Actions -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900">การดำเนินการด่วน</h3>
            <Zap class="w-5 h-5 text-yellow-500" />
          </div>
          <div class="space-y-3">
            <RouterLink
              v-for="action in quickActions"
              :key="action.title"
              :to="action.route"
              class="w-full flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200"
            >
              <div class="text-white p-2 rounded-lg" :class="action.color">
                <component :is="action.icon" class="w-4 h-4" />
              </div>
              <span class="text-sm font-medium text-gray-700">{{ action.title }}</span>
            </RouterLink>
          </div>
        </div>

        <!-- Probation Summary -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900">สรุปพ้นทดลอง</h3>
            <UserCheck class="w-5 h-5 text-blue-500" />
          </div>
          <div class="space-y-3">
            <div class="flex justify-between items-center p-2 rounded-lg bg-blue-50">
              <span class="text-sm text-blue-700">กำลังดำเนินการ</span>
              <span class="text-sm font-bold text-blue-700">{{ probationSummary.inProgress }}</span>
            </div>
            <div class="flex justify-between items-center p-2 rounded-lg bg-orange-50">
              <span class="text-sm text-orange-700">ใกล้ครบกำหนด</span>
              <span class="text-sm font-bold text-orange-700">{{ probationSummary.nearDeadline }}</span>
            </div>
            <div class="flex justify-between items-center p-2 rounded-lg bg-red-50">
              <span class="text-sm text-red-700">เกินกำหนด</span>
              <span class="text-sm font-bold text-red-700">{{ probationSummary.overdue }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4">
      <p class="text-red-700 text-sm">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import StatCard from '@/components/StatCard.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import { useApi } from '@/composables/useApi.js'
import {
  Users, UserCheck, TrendingUp, Clock,
  RefreshCw, AlertCircle, Zap,
} from 'lucide-vue-next'

const api = useApi()

const loading = ref(false)
const error = ref('')

const stats = ref({
  totalPersonnel: 0,
  probationTotal: 0,
  candidateTotal: 0,
  timeCountTotal: 0,
})

const probationSummary = ref({
  inProgress: 0,
  nearDeadline: 0,
  overdue: 0,
})

const multiplierSummary = ref({
  totalRecords: 0,
  distinctPersonnel: 0,
  totalBonusDays: 0,
  totalBonusYears: 0,
})

const priorityTasks = ref([])

const quickActions = [
  { title: 'พ้นทดลองปฏิบัติราชการ', icon: UserCheck, color: 'bg-blue-500', route: '/probation-end' },
  { title: 'เลื่อนระดับตำแหน่ง', icon: TrendingUp, color: 'bg-green-500', route: '/candidates/general' },
  { title: 'การนับเวลาเกื้อกูล', icon: Clock, color: 'bg-purple-500', route: '/supportive' },
]

function formatNumber(value) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(value)
}

async function fetchDashboard() {
  loading.value = true
  error.value = ''

  try {
    // ดึงข้อมูลสรุปจาก /dashboard endpoint เดียว (รวม candidate totals)
    const d = await api.get('/dashboard')

    stats.value.totalPersonnel = d.total_personnel || 0
    stats.value.probationTotal = d.probation?.total || 0
    stats.value.timeCountTotal = d.time_counting?.total || 0
    stats.value.candidateTotal = d.candidates?.total || 0
    probationSummary.value = {
      inProgress: Math.max(0, (d.probation?.total || 0) - (d.probation?.near_deadline || 0) - (d.probation?.overdue || 0)),
      nearDeadline: d.probation?.near_deadline || 0,
      overdue: d.probation?.overdue || 0,
    }

    multiplierSummary.value = {
      totalRecords: d.multiplier?.total_records || 0,
      distinctPersonnel: d.multiplier?.distinct_personnel || 0,
      totalBonusDays: d.multiplier?.total_bonus_days || 0,
      totalBonusYears: d.multiplier?.total_bonus_years || 0,
    }

    const totalCandidates = d.candidates?.total || 0

    // สร้างรายการงานสำคัญจากข้อมูลจริง
    const tasks = []
    if (probationSummary.value.nearDeadline > 0 || probationSummary.value.overdue > 0) {
      tasks.push({
        title: 'ข้าราชการใกล้ครบ/เกินกำหนดพ้นทดลอง',
        count: probationSummary.value.nearDeadline + probationSummary.value.overdue,
        priority: probationSummary.value.overdue > 0 ? 'เร่งด่วน' : 'สำคัญ',
        priorityColor: probationSummary.value.overdue > 0 ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800',
        icon: UserCheck,
        iconColor: probationSummary.value.overdue > 0 ? 'text-red-500' : 'text-orange-500',
        route: '/probation-end',
      })
    }
    if (totalCandidates > 0) {
      tasks.push({
        title: 'รายชื่อผู้มีคุณสมบัติเลื่อนระดับ',
        count: totalCandidates,
        priority: 'สำคัญ',
        priorityColor: 'bg-orange-100 text-orange-800',
        icon: TrendingUp,
        iconColor: 'text-orange-500',
        route: '/candidates/general',
      })
    }
    priorityTasks.value = tasks

  } catch (err) {
    error.value = 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง'
    console.error('Dashboard fetch error:', err)
  } finally {
    loading.value = false
  }
}

onMounted(fetchDashboard)
</script>
