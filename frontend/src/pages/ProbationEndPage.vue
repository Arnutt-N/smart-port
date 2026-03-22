<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <!-- Breadcrumb -->
    <nav class="flex items-center gap-2 text-sm text-gray-500 mb-4">
      <Home class="w-4 h-4" />
      <span>/</span>
      <span>พ้นทดลองปฏิบัติราชการ</span>
    </nav>

    <!-- Page Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900">ติดตามพ้นทดลองปฏิบัติราชการ</h1>
      <p class="text-sm text-gray-500 mt-1">ติดตามสถานะการทดลองปฏิบัติราชการของข้าราชการบรรจุใหม่</p>
    </div>

    <!-- Stat Cards -->
    <SkeletonLoader v-if="loading && rows.length === 0" type="stat-cards" />
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard
        label="ทั้งหมด"
        :value="summary.total"
        :icon="Users"
        icon-bg-class="bg-blue-50"
        icon-class="text-blue-600"
      />
      <StatCard
        label="กำลังดำเนินการ"
        :value="summary.in_progress"
        :icon="UserCheck"
        icon-bg-class="bg-green-50"
        icon-class="text-green-600"
      />
      <StatCard
        label="ใกล้ครบกำหนด"
        :value="summary.near_deadline"
        :icon="Clock"
        icon-bg-class="bg-yellow-50"
        icon-class="text-yellow-600"
      />
      <StatCard
        label="เกินกำหนด"
        :value="summary.overdue"
        :icon="AlertTriangle"
        icon-bg-class="bg-red-50"
        icon-class="text-red-600"
      />
    </div>

    <!-- Search Bar -->
    <div class="flex items-center gap-3 mb-4">
      <div class="relative flex-1">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search class="w-4 h-4 text-gray-400" />
        </div>
        <input
          v-model="searchQuery"
          @input="onSearchInput"
          type="text"
          placeholder="ค้นหาชื่อ, ตำแหน่ง หรือหน่วยงาน..."
          class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
    </div>

    <!-- Loading State -->
    <SkeletonLoader v-if="loading && rows.length === 0" type="table" :rows="5" />

    <!-- Error State -->
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

    <!-- Data Table -->
    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ลำดับ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ชื่อ-สกุล</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ตำแหน่ง</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">หน่วยงาน</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันเริ่มทดลอง</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันครบกำหนด</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันคงเหลือ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สถานะ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">การดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, index) in rows"
              :key="row.enrollmentId"
              class="border-b border-gray-100 hover:bg-gray-50"
            >
              <td class="px-6 py-3 text-sm text-gray-700">{{ pagination.offset + index + 1 }}</td>
              <td class="px-6 py-3 text-sm text-gray-900 font-medium">{{ row.name }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.position }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.department }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.startDate }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.endDate }}</td>
              <td class="px-6 py-3 text-sm">
                <span :class="getRemainingDaysClass(row.remainingDays)">
                  {{ formatRemainingDays(row.remainingDays) }}
                </span>
              </td>
              <td class="px-6 py-3 text-sm">
                <StatusBadge :status="row.status" />
              </td>
              <td class="px-6 py-3 text-sm">
                <div class="flex items-center gap-2">
                  <button class="p-1 text-gray-400 hover:text-blue-600 transition-colors" title="ดูรายละเอียด">
                    <Eye class="w-4 h-4" />
                  </button>
                  <button class="p-1 text-gray-400 hover:text-yellow-600 transition-colors" title="แก้ไข">
                    <Pencil class="w-4 h-4" />
                  </button>
                  <button class="p-1 text-gray-400 hover:text-red-600 transition-colors" title="ลบ">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="rows.length === 0 && !loading">
              <td colspan="9">
                <EmptyState
                  title="ไม่พบข้อมูล"
                  description="ยังไม่มีข้อมูลการทดลองปฏิบัติราชการ หรือไม่พบข้อมูลที่ตรงกับการค้นหา"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Pagination -->
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
import { useProbation } from '@/composables/useProbation.js'
import { getRemainingDaysClass, formatRemainingDays } from '@/composables/useRemainingDays.js'
import StatCard from '@/components/StatCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/EmptyState.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import { Users, UserCheck, Clock, AlertTriangle, AlertCircle, Home, Eye, Pencil, Trash2, Search } from 'lucide-vue-next'

const { fetchList } = useProbation()

const loading = ref(false)
const error = ref(null)
const rows = ref([])
const summary = ref({ total: 0, in_progress: 0, near_deadline: 0, overdue: 0 })
const pagination = ref({ total: 0, limit: 20, offset: 0, has_more: false })

// Search with 300ms debounce
const searchQuery = ref('')
let searchTimeout = null

async function fetchData() {
  loading.value = true
  error.value = null
  try {
    const result = await fetchList({
      search: searchQuery.value,
      limit: pagination.value.limit,
      offset: pagination.value.offset,
    })
    rows.value = result.data
    summary.value = result.summary
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

onMounted(() => {
  fetchData()
})
</script>
