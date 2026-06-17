<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <!-- Breadcrumb -->
    <nav class="flex items-center gap-2 text-sm text-gray-500 mb-4">
      <Home class="w-4 h-4" />
      <span>/</span>
      <span>{{ currentConfig.breadcrumb }}</span>
    </nav>

    <!-- Page Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ currentConfig.title }}</h1>
        <p class="text-sm text-gray-500 mt-1">{{ currentConfig.subtitle }}</p>
      </div>
    </div>

    <!-- ==================== OVERVIEW SECTION ==================== -->
    <template v-if="isOverview">
      <!-- Overview Loading Skeleton (custom 2+3 layout) -->
      <template v-if="overviewLoading">
        <div class="animate-pulse space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div v-for="i in 4" :key="'sk2-'+i" class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div class="flex items-center">
                <div class="w-12 h-12 bg-gray-200 rounded-lg"></div>
                <div class="ml-4 flex-1 space-y-2">
                  <div class="h-3 bg-gray-200 rounded w-24"></div>
                  <div class="h-6 bg-gray-200 rounded w-16"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div v-for="i in 4" :key="'sk4-'+i" class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div class="flex items-center">
                <div class="w-12 h-12 bg-gray-200 rounded-lg"></div>
                <div class="ml-4 flex-1 space-y-2">
                  <div class="h-3 bg-gray-200 rounded w-24"></div>
                  <div class="h-6 bg-gray-200 rounded w-16"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Overview Error -->
      <template v-else-if="overviewError">
        <EmptyState
          :icon="AlertCircle"
          title="เกิดข้อผิดพลาด"
          :description="overviewError"
        >
          <button
            @click="fetchOverviewData"
            class="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg"
          >
            ลองใหม่
          </button>
        </EmptyState>
      </template>

      <!-- Overview Data -->
      <template v-else-if="overviewData">
        <!-- Row 1: 4 stat cards (ทั่วไป / วิชาการ / อำนวยการ / บริหาร) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="ประเภททั่วไป"
            :value="overviewData.generalTotal"
            :icon="Users"
            icon-bg-class="bg-blue-50"
            icon-class="text-blue-600"
          />
          <StatCard
            label="ประเภทวิชาการ"
            :value="overviewData.academicTotal"
            :icon="UserCheck"
            icon-bg-class="bg-purple-50"
            icon-class="text-purple-600"
          />
          <StatCard
            label="ประเภทอำนวยการ"
            :value="overviewData.supportiveTotal"
            :icon="Briefcase"
            icon-bg-class="bg-amber-50"
            icon-class="text-amber-600"
          />
          <StatCard
            label="ประเภทบริหาร"
            :value="overviewData.managementTotal"
            :icon="Building2"
            icon-bg-class="bg-rose-50"
            icon-class="text-rose-600"
          />
        </div>

        <!-- Row 2: 4 stat cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="กำลังดำเนินการ"
            :value="overviewData.checkDataTotal"
            :icon="Loader"
            icon-bg-class="bg-blue-50"
            icon-class="text-blue-600"
          />
          <StatCard
            label="ถึงเกณฑ์"
            :value="overviewData.qualifiedTotal"
            :icon="UserCheck"
            icon-bg-class="bg-green-50"
            icon-class="text-green-600"
          />
          <StatCard
            label="ใกล้ถึงเกณฑ์"
            :value="overviewData.nearQualifiedTotal"
            :icon="Timer"
            icon-bg-class="bg-orange-50"
            icon-class="text-orange-600"
          />
          <StatCard
            label="ยังไม่ถึงเกณฑ์"
            :value="overviewData.notYetTotal"
            :icon="Clock"
            icon-bg-class="bg-yellow-50"
            icon-class="text-yellow-600"
          />
        </div>

        <!-- Top 5 nearest deadline table -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          <div class="px-6 py-4 border-b border-gray-200">
            <h2 class="text-lg font-semibold text-gray-900">ใกล้ครบกำหนดที่สุด (5 อันดับแรก)</h2>
          </div>
          <table class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ลำดับ</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ชื่อ-สกุล</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ตำแหน่งปัจจุบัน</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ระดับ</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันครบกำหนด</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันคงเหลือ</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สถานะ</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr
                v-for="(row, idx) in overviewData.top5"
                :key="row.personnelId || idx"
                class="hover:bg-blue-50/50 transition-all duration-150"
              >
                <td class="px-6 py-3 text-gray-500">{{ idx + 1 }}</td>
                <td class="px-6 py-3 text-gray-900 font-medium">{{ row.name }}</td>
                <td class="px-6 py-3 text-gray-600">{{ row.currentPosition }}</td>
                <td class="px-6 py-3 text-gray-600">{{ row.currentLevelName }}</td>
                <td class="px-6 py-3 text-gray-500">{{ row.qualificationDate }}</td>
                <td class="px-6 py-3" :class="getCandidateRemainingDaysClass(row.remainingDays)">
                  {{ formatRemainingDays(row.remainingDays) }}
                </td>
                <td class="px-6 py-3">
                  <StatusBadge :status="row.status" />
                </td>
              </tr>
              <tr v-if="overviewData.top5.length === 0">
                <td colspan="7" class="px-6 py-8 text-center text-gray-400">ไม่พบข้อมูล</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>

    <!-- ==================== SUB-TAB SECTIONS (general/academic/support/management) ==================== -->
    <template v-else-if="hasSubTabs">
      <!-- Pill sub-tab buttons -->
      <div class="flex gap-2 mb-6">
        <button
          v-for="tab in currentSubTabs"
          :key="tab.level"
          class="px-4 py-2 text-sm rounded-full transition-colors"
          :class="activeSubTab === tab.level
            ? 'bg-blue-500 text-white'
            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'"
          @click="activeSubTab = tab.level"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Search bar + filter -->
      <div class="flex items-center gap-3 mb-4">
        <div class="flex-1 relative">
          <input
            v-model="searchQuery"
            type="text"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="ค้นหาชื่อ หรือตำแหน่ง..."
            @input="onSearchInput"
          />
        </div>
      </div>

      <!-- Loading state -->
      <SkeletonLoader v-if="loading" type="table" :rows="5" />

      <!-- Error state -->
      <EmptyState
        v-else-if="error"
        :icon="AlertCircle"
        title="เกิดข้อผิดพลาด"
        :description="error"
      >
        <button
          @click="fetchData"
          class="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg"
        >
          ลองใหม่
        </button>
      </EmptyState>

      <!-- Data table -->
      <template v-else>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ลำดับ</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ชื่อ-นามสกุล</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ตำแหน่งปัจจุบัน</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ระดับตำแหน่ง</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันเข้าสู่ระดับปัจจุบัน</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันที่ครบกำหนด</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันเกื้อกูล</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สถานะ 3 ต่าง</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันเทียบ ตน.</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">จำนวนวันที่เหลือ</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สถานะ</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr
                v-for="(row, idx) in rows"
                :key="row.personnelId || idx"
                class="hover:bg-blue-50/50 transition-all duration-150"
              >
                <td class="px-6 py-3 text-gray-500">{{ pagination.offset + idx + 1 }}</td>
                <td class="px-6 py-3 text-gray-900 font-medium">{{ row.name }}</td>
                <td class="px-6 py-3 text-gray-600">{{ row.currentPosition }}</td>
                <td class="px-6 py-3 text-gray-600">{{ row.currentLevelName }}</td>
                <td class="px-6 py-3 text-gray-500">{{ row.levelStartDate }}</td>
                <td class="px-6 py-3 text-gray-500">{{ row.qualificationDate }}</td>
                <td class="px-6 py-3 text-gray-500">
                  {{ row.supportiveDays > 0 ? `${row.supportiveDays} วัน` : '-' }}
                </td>
                <td class="px-6 py-3">
                  <StatusBadge v-if="row.diverseStatus" :status="row.diverseStatus" />
                  <span v-else class="text-gray-400">-</span>
                </td>
                <td class="px-6 py-3 text-gray-500">
                  {{ row.equivalenceDays > 0 ? `${row.equivalenceDays} วัน` : '-' }}
                </td>
                <td class="px-6 py-3" :class="getCandidateRemainingDaysClass(row.remainingDays)">
                  {{ formatRemainingDays(row.remainingDays) }}
                </td>
                <td class="px-6 py-3">
                  <StatusBadge :status="row.status" />
                </td>
                <td class="px-6 py-3">
                  <button
                    @click="openView(row)"
                    class="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded"
                    title="ดูรายละเอียด"
                  >
                    <Eye class="w-4 h-4" />
                  </button>
                </td>
              </tr>
              <tr v-if="rows.length === 0">
                <td colspan="12">
                  <EmptyState
                    title="ไม่พบข้อมูล"
                    description="ไม่พบรายชื่อผู้มีคุณสมบัติในระดับนี้"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <PaginationBar
          :total="pagination.total"
          :limit="pagination.limit"
          :offset="pagination.offset"
          @update:offset="onPageChange"
        />
      </template>
    </template>

    <!-- ==================== View Modal ==================== -->
    <Teleport to="body">
      <div v-if="showViewModal" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" @click="showViewModal = false"></div>
        <div class="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
          <div class="px-6 py-4 border-b border-gray-200">
            <h2 class="text-lg font-semibold text-gray-900">รายละเอียดผู้มีคุณสมบัติ</h2>
          </div>
          <div class="px-6 py-4 space-y-3">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <p class="text-xs text-gray-500">ชื่อ-สกุล</p>
                <p class="text-sm font-medium text-gray-900">{{ viewingRow?.name }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">สถานะ</p>
                <StatusBadge v-if="viewingRow" :status="viewingRow.status" />
              </div>
              <div>
                <p class="text-xs text-gray-500">ตำแหน่งปัจจุบัน</p>
                <p class="text-sm text-gray-900">{{ viewingRow?.currentPosition || '-' }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">ระดับตำแหน่ง</p>
                <p class="text-sm text-gray-900">{{ viewingRow?.currentLevelName || '-' }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">สังกัด</p>
                <p class="text-sm text-gray-900">{{ viewingRow?.department || '-' }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">วันเข้าสู่ระดับปัจจุบัน</p>
                <p class="text-sm text-gray-900">{{ viewingRow?.levelStartDate || '-' }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">วันที่ครบกำหนด</p>
                <p class="text-sm text-gray-900">{{ viewingRow?.qualificationDate || '-' }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">วันคงเหลือ</p>
                <p class="text-sm" :class="getCandidateRemainingDaysClass(viewingRow?.remainingDays)">
                  {{ formatRemainingDays(viewingRow?.remainingDays) }}
                </p>
              </div>
              <div>
                <p class="text-xs text-gray-500">วันเกื้อกูล</p>
                <p class="text-sm text-gray-900">{{ viewingRow?.supportiveDays > 0 ? `${viewingRow.supportiveDays} วัน` : '-' }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">วันเทียบ ตน.</p>
                <p class="text-sm text-gray-900">{{ viewingRow?.equivalenceDays > 0 ? `${viewingRow.equivalenceDays} วัน` : '-' }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">สถานะ 3 ต่าง</p>
                <StatusBadge v-if="viewingRow?.diverseStatus" :status="viewingRow.diverseStatus" />
                <p v-else class="text-sm text-gray-400">-</p>
              </div>
            </div>
          </div>
          <div class="px-6 py-4 border-t border-gray-200 flex justify-end">
            <button
              @click="showViewModal = false"
              class="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ปิด
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useCandidates } from '@/composables/useCandidates.js'
import { getCandidateRemainingDaysClass, formatRemainingDays } from '@/composables/useRemainingDays.js'
import StatCard from '@/components/StatCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/EmptyState.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import {
  Users, UserCheck, AlertCircle, Clock, Timer, Loader, Home,
  Eye, Briefcase, Building2
} from 'lucide-vue-next'

const props = defineProps({
  section: { type: String, default: 'overview' },
})

const { fetchByLevel, fetchOverview } = useCandidates()

// Sub-tab state (reactive, not router per D-04)
const activeSubTab = ref(null)

// Data state
const loading = ref(false)
const error = ref(null)
const rows = ref([])
const summary = ref(null)
const pagination = ref({ total: 0, limit: 20, offset: 0, has_more: false })

// Search state with 300ms debounce (Pitfall 3)
const searchQuery = ref('')
let searchTimeout = null

// Overview state
const overviewLoading = ref(false)
const overviewError = ref(null)
const overviewData = ref(null)

// View modal state
const showViewModal = ref(false)
const viewingRow = ref(null)

function openView(row) {
  viewingRow.value = row
  showViewModal.value = true
}

// Configuration maps
const subTabConfig = {
  general: [
    { level: 'O2', label: 'ชำนาญงาน' },
    { level: 'O3', label: 'อาวุโส' },
  ],
  academic: [
    { level: 'K2', label: 'ชำนาญการ' },
    { level: 'K3', label: 'ชำนาญการพิเศษ' },
    { level: 'K4', label: 'เชี่ยวชาญ' },
  ],
  support: [
    { level: 'M1', label: 'อำนวยการต้น' },
    { level: 'M2', label: 'อำนวยการสูง' },
  ],
  management: [
    { level: 'S1', label: 'บริหารต้น' },
    { level: 'S2', label: 'บริหารสูง' },
  ],
}

const categoryConfig = {
  overview: {
    title: 'ภาพรวมบัญชีรายชื่อผู้มีคุณสมบัติ',
    subtitle: 'สรุปภาพรวมบัญชีรายชื่อผู้มีคุณสมบัติเลื่อนและย้ายตำแหน่งทุกประเภท',
    breadcrumb: 'ภาพรวม',
  },
  general: {
    title: 'รายชื่อผู้มีคุณสมบัติเลื่อน/ย้ายตำแหน่ง (ทั่วไป)',
    subtitle: 'จัดการข้อมูลผู้มีคุณสมบัติเลื่อนและย้ายตำแหน่งในสายงานทั่วไป',
    breadcrumb: 'ทั่วไป',
  },
  academic: {
    title: 'รายชื่อผู้มีคุณสมบัติเลื่อน/ย้ายตำแหน่ง (วิชาการ)',
    subtitle: 'จัดการข้อมูลผู้มีคุณสมบัติเลื่อนและย้ายตำแหน่งในสายงานวิชาการ',
    breadcrumb: 'วิชาการ',
  },
  support: {
    title: 'รายชื่อผู้มีคุณสมบัติเลื่อน/ย้ายตำแหน่ง (อำนวยการ)',
    subtitle: 'จัดการข้อมูลผู้มีคุณสมบัติเลื่อนและย้ายตำแหน่งในสายงานอำนวยการ',
    breadcrumb: 'อำนวยการ',
  },
  management: {
    title: 'รายชื่อผู้มีคุณสมบัติเลื่อน/ย้ายตำแหน่ง (บริหาร)',
    subtitle: 'จัดการข้อมูลผู้มีคุณสมบัติเลื่อนและย้ายตำแหน่งในสายงานบริหาร',
    breadcrumb: 'บริหาร',
  },
}

// Computed
const currentConfig = computed(() => categoryConfig[props.section] || categoryConfig.overview)
const currentSubTabs = computed(() => subTabConfig[props.section] || [])
const isOverview = computed(() => props.section === 'overview')
const hasSubTabs = computed(() => currentSubTabs.value.length > 0)

// Fetch data for sub-tab level pages
async function fetchData() {
  if (!activeSubTab.value) return
  loading.value = true
  error.value = null
  try {
    const result = await fetchByLevel(activeSubTab.value, {
      search: searchQuery.value,
      limit: pagination.value.limit,
      offset: pagination.value.offset,
    })
    rows.value = result.data
    summary.value = result.summary
    pagination.value = result.pagination
  } catch (err) {
    error.value = err.message || 'ไม่สามารถโหลดข้อมูลได้'
  } finally {
    loading.value = false
  }
}

// Fetch overview data — aggregate จาก backend ครั้งเดียว (เลขถูกต้องทั้ง dataset เสมอ)
async function fetchOverviewData() {
  overviewLoading.value = true
  overviewError.value = null
  try {
    const result = await fetchOverview()
    const s = result.summary
    overviewData.value = {
      generalTotal: s.general_total || 0,
      academicTotal: s.academic_total || 0,
      supportiveTotal: s.supportive_total || 0,
      managementTotal: s.management_total || 0,
      qualifiedTotal: s.qualified_total || 0,
      nearQualifiedTotal: s.near_qualified_total || 0,
      notYetTotal: s.not_yet_total || 0,
      checkDataTotal: s.check_data_total || 0,
      top5: result.top5,
    }
  } catch (err) {
    overviewError.value = err.message || 'ไม่สามารถโหลดข้อมูลภาพรวมได้'
  } finally {
    overviewLoading.value = false
  }
}

// Debounced search (Pitfall 3)
function onSearchInput() {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    pagination.value.offset = 0
    fetchData()
  }, 300)
}

// Page change handler
function onPageChange(newOffset) {
  pagination.value.offset = newOffset
  fetchData()
}

// Watchers
watch(() => props.section, (newSection) => {
  if (newSection === 'overview') {
    fetchOverviewData()
  } else {
    const tabs = subTabConfig[newSection]
    if (tabs && tabs.length > 0) {
      searchQuery.value = ''
      pagination.value.offset = 0
      activeSubTab.value = tabs[0].level
    }
  }
})

watch(activeSubTab, (newTab) => {
  if (!newTab) return
  if (isOverview.value) return
  // Reset offset and search when sub-tab changes (Pitfall 4)
  pagination.value.offset = 0
  searchQuery.value = ''
  fetchData()
})

// Initial load
onMounted(() => {
  if (props.section === 'overview') {
    fetchOverviewData()
  } else {
    const tabs = subTabConfig[props.section]
    if (tabs && tabs.length > 0) {
      activeSubTab.value = tabs[0].level
    }
  }
})
</script>
