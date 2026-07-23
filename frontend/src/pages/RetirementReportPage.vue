<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <div class="mb-2">
      <h1 class="text-2xl font-bold text-gray-900">รายงานการเกษียณอายุ</h1>
      <p class="text-sm text-gray-500 mt-1">ติดตามข้าราชการที่ใกล้ครบกำหนดเกษียณอายุราชการ</p>
    </div>

    <!-- Stat Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatCard
        label="ทั้งหมดที่มีกำหนดเกษียณ"
        :value="pagination.total"
        :icon="Users"
        icon-bg-class="bg-blue-50"
        icon-class="text-blue-600"
      />
      <StatCard
        label="เกษียณภายใน 12 เดือน"
        :value="totalWithin12"
        :icon="CalendarClock"
        icon-bg-class="bg-orange-50"
        icon-class="text-orange-600"
      />
      <StatCard
        label="เกษียณภายใน 6 เดือน"
        :value="totalWithin6"
        :icon="AlertTriangle"
        icon-bg-class="bg-red-50"
        icon-class="text-red-600"
      />
    </div>

    <!-- Filters -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
      <div class="relative flex-1">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search class="w-4 h-4 text-gray-400" />
        </div>
        <input
          v-model="searchQuery"
          @input="onSearchInput"
          type="text"
          placeholder="ค้นหาชื่อ หรือรหัสพนักงาน..."
          class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <select
        v-model="within"
        @change="onFilterChange"
        class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="">ทั้งหมด</option>
        <option value="6">ภายใน 6 เดือน</option>
        <option value="12">ภายใน 12 เดือน</option>
        <option value="24">ภายใน 24 เดือน</option>
      </select>
    </div>

    <SkeletonLoader v-if="loading && rows.length === 0" type="table" :rows="5" />

    <EmptyState
      v-else-if="error"
      :icon="AlertCircle"
      title="เกิดข้อผิดพลาด"
      :description="error"
    >
      <button
        class="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
        @click="fetchData"
      >
        ลองใหม่อีกครั้ง
      </button>
    </EmptyState>

    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ลำดับ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">รหัสพนักงาน</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ชื่อ-สกุล</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันเกษียณ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">คงเหลือ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, index) in rows"
              :key="row.servantId"
              class="border-b border-gray-100 hover:bg-gray-50"
            >
              <td class="px-6 py-3 text-sm text-gray-700">{{ pagination.offset + index + 1 }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.employeeId }}</td>
              <td class="px-6 py-3 text-sm text-gray-900 font-medium">{{ row.fullName }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.retirementDate || '-' }}</td>
              <td class="px-6 py-3 text-sm">
                <span :class="getRemainingDaysClass(row.remainingDays)">
                  {{ formatRemainingDays(row.remainingDays) }}
                </span>
              </td>
              <td class="px-6 py-3 text-sm">
                <StatusBadge :status="row.servantStatus || 'active'" />
              </td>
            </tr>
            <tr v-if="rows.length === 0 && !loading">
              <td colspan="6">
                <EmptyState
                  title="ไม่พบข้อมูล"
                  description="ยังไม่มีข้าราชการที่ตรงกับเงื่อนไข"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <PaginationBar
      v-if="pagination.total > 0"
      :total="pagination.total"
      :limit="pagination.limit"
      :offset="pagination.offset"
      @update:offset="val => { pagination.offset = val; fetchData() }"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRetirement } from '@/composables/useRetirement.js'
import { getRemainingDaysClass, formatRemainingDays } from '@/composables/useRemainingDays.js'
import StatCard from '@/components/StatCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/EmptyState.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import { Users, CalendarClock, AlertTriangle, AlertCircle, Search } from 'lucide-vue-next'

const { fetchList } = useRetirement()

const loading = ref(false)
const error = ref(null)
const rows = ref([])
const pagination = ref({ total: 0, limit: 20, offset: 0, has_more: false })
const searchQuery = ref('')
const within = ref('')
const totalWithin12 = ref(0)
const totalWithin6 = ref(0)
let searchTimeout = null

async function fetchStatTotals() {
  const [r12, r6] = await Promise.all([
    fetchList({ search: searchQuery.value, within: 12, limit: 1, offset: 0 }),
    fetchList({ search: searchQuery.value, within: 6, limit: 1, offset: 0 }),
  ])
  totalWithin12.value = r12.pagination.total
  totalWithin6.value = r6.pagination.total
}

async function fetchData() {
  loading.value = true
  error.value = null
  try {
    const [result] = await Promise.all([
      fetchList({
        search: searchQuery.value,
        within: within.value,
        limit: pagination.value.limit,
        offset: pagination.value.offset,
      }),
      fetchStatTotals(),
    ])
    rows.value = result.data
    pagination.value = result.pagination
  } catch (err) {
    error.value = err.message || 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง'
  } finally {
    loading.value = false
  }
}

function onSearchInput() {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    pagination.value.offset = 0
    fetchData()
  }, 300)
}

function onFilterChange() {
  pagination.value.offset = 0
  fetchData()
}

onMounted(fetchData)
</script>
