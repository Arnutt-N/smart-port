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
      <div v-if="hasSubTabs" class="flex gap-2">
        <button class="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm rounded-lg">
          <Download class="w-4 h-4" /> ส่งออก
        </button>
        <button class="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm rounded-lg">
          <Upload class="w-4 h-4" /> นำเข้า
        </button>
        <button class="flex items-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg">
          <Plus class="w-4 h-4" /> เพิ่มรายชื่อ
        </button>
      </div>
    </div>

    <!-- ==================== OVERVIEW SECTION ==================== -->
    <template v-if="isOverview">
      <!-- Overview Loading Skeleton (custom 2+3 layout) -->
      <template v-if="overviewLoading">
        <div class="animate-pulse space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div v-for="i in 2" :key="'sk2-'+i" class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div class="flex items-center">
                <div class="w-12 h-12 bg-gray-200 rounded-lg"></div>
                <div class="ml-4 flex-1 space-y-2">
                  <div class="h-3 bg-gray-200 rounded w-24"></div>
                  <div class="h-6 bg-gray-200 rounded w-16"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div v-for="i in 3" :key="'sk3-'+i" class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
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
        <!-- Row 1: 2 stat cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>

        <!-- Row 2: 4 stat cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            label="ครบกำหนด"
            :value="overviewData.qualifiedTotal"
            :icon="UserCheck"
            icon-bg-class="bg-green-50"
            icon-class="text-green-600"
          />
          <StatCard
            label="ใกล้ครบกำหนด"
            :value="overviewData.notYetTotal"
            :icon="Clock"
            icon-bg-class="bg-amber-50"
            icon-class="text-amber-600"
          />
          <StatCard
            label="เกินกำหนด"
            :value="overviewData.overdueTotal"
            :icon="AlertTriangle"
            icon-bg-class="bg-red-50"
            icon-class="text-red-600"
          />
          <StatCard
            label="ตรวจสอบข้อมูล"
            :value="overviewData.checkDataTotal"
            :icon="AlertCircle"
            icon-bg-class="bg-orange-50"
            icon-class="text-orange-600"
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
                <td class="px-6 py-3" :class="getRemainingDaysClass(row.remainingDays)">
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

    <!-- ==================== PLACEHOLDER SECTIONS (support/management) ==================== -->
    <template v-else-if="isPlaceholder">
      <EmptyState
        :icon="Construction"
        title="อยู่ระหว่างพัฒนา"
        description="ฟีเจอร์นี้อยู่ระหว่างการพัฒนา จะเปิดให้ใช้งานในเร็วๆ นี้"
      />
    </template>

    <!-- ==================== SUB-TAB SECTIONS (general/academic) ==================== -->
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
            @compositionstart="onCompositionStart"
            @compositionend="onCompositionEnd"
          />
        </div>
        <button class="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
          ตัวกรอง
        </button>
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
                <td class="px-6 py-3" :class="getRemainingDaysClass(row.remainingDays)">
                  {{ formatRemainingDays(row.remainingDays) }}
                </td>
                <td class="px-6 py-3">
                  <StatusBadge :status="row.status" />
                </td>
                <td class="px-6 py-3">
                  <div class="flex items-center gap-2">
                    <button class="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="ดูรายละเอียด">
                      <Eye class="w-4 h-4" />
                    </button>
                    <button class="p-1 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded" title="แก้ไข">
                      <Pencil class="w-4 h-4" />
                    </button>
                    <button class="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded" title="ลบ">
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>
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
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useCandidates } from '@/composables/useCandidates.js'
import { getRemainingDaysClass, formatRemainingDays } from '@/composables/useRemainingDays.js'
import StatCard from '@/components/StatCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/EmptyState.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import {
  Users, UserCheck, AlertCircle, Clock, Home,
  Download, Upload, Plus, Eye, Pencil, Trash2,
  Construction, AlertTriangle
} from 'lucide-vue-next'

const props = defineProps({
  section: { type: String, default: 'overview' },
})

const { fetchByLevel } = useCandidates()

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
let isComposing = false

// Overview state (separate because it merges multiple API calls)
const overviewLoading = ref(false)
const overviewError = ref(null)
const overviewData = ref(null)

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
const isPlaceholder = computed(() => ['support', 'management'].includes(props.section))
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

// Fetch overview data (Promise.allSettled for all 5 levels per D-08)
async function fetchOverviewData() {
  overviewLoading.value = true
  overviewError.value = null
  try {
    const levels = ['O2', 'O3', 'K2', 'K3', 'K4']
    const results = await Promise.allSettled(
      levels.map(level => fetchByLevel(level, { limit: 100, offset: 0 }))
    )

    // Extract fulfilled results mapped by level
    const dataByLevel = {}
    levels.forEach((level, i) => {
      if (results[i].status === 'fulfilled') {
        dataByLevel[level] = results[i].value
      } else {
        dataByLevel[level] = { data: [], summary: { total: 0, qualified: 0, not_yet: 0, check_data: 0 } }
      }
    })

    const generalTotal = (dataByLevel.O2.summary?.total || 0) + (dataByLevel.O3.summary?.total || 0)
    const academicTotal = (dataByLevel.K2.summary?.total || 0) + (dataByLevel.K3.summary?.total || 0) + (dataByLevel.K4.summary?.total || 0)

    const allSummaries = Object.values(dataByLevel).map(d => d.summary || {})
    const qualifiedTotal = allSummaries.reduce((sum, s) => sum + (s.qualified || 0), 0)
    const notYetTotal = allSummaries.reduce((sum, s) => sum + (s.not_yet || 0), 0)
    const checkDataTotal = allSummaries.reduce((sum, s) => sum + (s.check_data || 0), 0)

    // Overdue: คนที่ remainingDays <= 0 (ครบกำหนดแล้วแต่ยังไม่ได้เลื่อนระดับ)
    const allRowsRaw = Object.values(dataByLevel).flatMap(d => d.data || [])
    const overdueTotal = allRowsRaw.filter(r => r.remainingDays !== null && r.remainingDays !== undefined && r.remainingDays <= 0).length

    // Top 5 nearest deadline: concatenate all data, sort by remainingDays asc (null last), take 5
    const allRows = allRowsRaw
    allRows.sort((a, b) => {
      if (a.remainingDays === null || a.remainingDays === undefined) return 1
      if (b.remainingDays === null || b.remainingDays === undefined) return -1
      return a.remainingDays - b.remainingDays
    })
    const top5 = allRows.slice(0, 5)

    overviewData.value = {
      generalTotal,
      academicTotal,
      qualifiedTotal,
      notYetTotal,
      checkDataTotal,
      overdueTotal,
      top5,
    }
  } catch (err) {
    overviewError.value = err.message || 'ไม่สามารถโหลดข้อมูลภาพรวมได้'
  } finally {
    overviewLoading.value = false
  }
}

// Debounced search (Pitfall 3) — guards against Thai IME composition events
function onCompositionStart() { isComposing = true }
function onCompositionEnd() {
  isComposing = false
  onSearchInput()
}
function onSearchInput() {
  if (isComposing) return
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
  } else if (['support', 'management'].includes(newSection)) {
    // Placeholder sections -- do nothing
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
  if (isOverview.value || isPlaceholder.value) return
  // Reset offset and search when sub-tab changes (Pitfall 4)
  pagination.value.offset = 0
  searchQuery.value = ''
  fetchData()
})

// Initial load
onMounted(() => {
  if (props.section === 'overview') {
    fetchOverviewData()
  } else if (['support', 'management'].includes(props.section)) {
    // Placeholder -- do nothing
  } else {
    const tabs = subTabConfig[props.section]
    if (tabs && tabs.length > 0) {
      activeSubTab.value = tabs[0].level
    }
  }
})
</script>
