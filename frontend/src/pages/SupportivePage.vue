<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <!-- Breadcrumb -->
    <nav class="flex items-center gap-2 text-sm text-gray-500 mb-4">
      <Home class="w-4 h-4" />
      <span>/</span>
      <span>การนับเกื้อกูล</span>
    </nav>

    <!-- Page Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">การนับเกื้อกูล</h1>
        <p class="text-sm text-gray-500 mt-1">บันทึกวันเกื้อกูลต่อบุคคล</p>
      </div>
      <button
        class="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
        @click="openCreate"
      >
        <Plus class="w-4 h-4" />
        เพิ่มรายการ
      </button>
    </div>

    <!-- Stat Cards -->
    <SkeletonLoader v-if="loading && rows.length === 0" type="stat-cards" />
    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <StatCard
        label="รายการทั้งหมด"
        :value="pagination.total"
        :icon="FileText"
        icon-bg-class="bg-blue-50"
        icon-class="text-blue-600"
      />
      <StatCard
        label="จำนวนบุคลากร"
        :value="distinctPersonnelCount"
        :icon="Users"
        icon-bg-class="bg-green-50"
        icon-class="text-green-600"
      />
      <StatCard
        label="เพิ่มล่าสุด"
        :value="recentCount"
        :icon="Clock"
        icon-bg-class="bg-amber-50"
        icon-class="text-amber-600"
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
          @compositionstart="isComposing = true"
          @compositionend="onCompositionEnd"
          type="text"
          placeholder="ค้นหาชื่อ หรือสายงาน..."
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
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สายงานที่เกื้อกูล</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันเริ่มต้น</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันสิ้นสุด</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">จำนวนวัน</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">อัตราลดทอน</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันที่ได้</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, index) in rows"
              :key="row.supportiveId"
              class="border-b border-gray-100 hover:bg-gray-50"
            >
              <td class="px-6 py-3 text-sm text-gray-700">{{ pagination.offset + index + 1 }}</td>
              <td class="px-6 py-3 text-sm text-gray-900 font-medium">{{ row.fullName }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.jobSeriesName }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.startDateThai }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.endDateThai }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.totalDays }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.ratioPercent }}%</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.effectiveDays }}</td>
              <td class="px-6 py-3 text-sm">
                <div class="flex items-center gap-2">
                  <button
                    class="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                    title="แก้ไข"
                    @click="openEdit(row)"
                  >
                    <Pencil class="w-4 h-4" />
                  </button>
                  <button
                    class="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    title="ลบ"
                    @click="confirmDelete(row.supportiveId)"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="rows.length === 0 && !loading">
              <td colspan="9">
                <EmptyState
                  title="ไม่พบข้อมูล"
                  description="ยังไม่มีข้อมูลการนับเกื้อกูล หรือไม่พบข้อมูลที่ตรงกับการค้นหา"
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

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="fixed inset-0 bg-black/50" @click="closeModal"></div>
      <div class="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">
          {{ editingRecord ? 'แก้ไขรายการ' : 'เพิ่มรายการใหม่' }}
        </h2>

        <form @submit.prevent="handleSave" class="space-y-4">
          <!-- บุคลากร -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">บุคลากร</label>
            <div v-if="editingRecord" class="px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-700">
              {{ editingRecord.fullName }}
            </div>
            <div v-else class="relative">
              <input
                v-model="personnelSearch"
                @input="onPersonnelInput"
                type="text"
                placeholder="พิมพ์ชื่อเพื่อค้นหาบุคลากร..."
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                :class="formErrors.personnel_id ? 'border-red-500' : 'border-gray-300'"
              />
              <!-- Autocomplete dropdown -->
              <div
                v-if="showPersonnelDropdown && personnelResults.length > 0"
                class="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto"
              >
                <button
                  v-for="person in personnelResults"
                  :key="person.servant_id"
                  type="button"
                  class="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors"
                  @click="selectPersonnel(person)"
                >
                  {{ person.full_name }}
                </button>
              </div>
              <p v-if="formErrors.personnel_id" class="text-xs text-red-500 mt-1">กรุณาเลือกบุคลากร</p>
            </div>
          </div>

          <!-- สายงานหลัก -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">สายงานหลัก</label>
            <input
              v-model="formData.primary_series_name"
              type="text"
              placeholder="ระบุสายงานหลัก"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              :class="formErrors.primary_series_name ? 'border-red-500' : 'border-gray-300'"
            />
            <p v-if="formErrors.primary_series_name" class="text-xs text-red-500 mt-1">กรุณาระบุสายงานหลัก</p>
          </div>

          <!-- สายงานที่เกื้อกูล -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">สายงานที่เกื้อกูล</label>
            <input
              v-model="formData.job_series_name"
              type="text"
              placeholder="ระบุสายงานที่เกื้อกูล"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              :class="formErrors.job_series_name ? 'border-red-500' : 'border-gray-300'"
            />
            <p v-if="formErrors.job_series_name" class="text-xs text-red-500 mt-1">กรุณาระบุสายงานที่เกื้อกูล</p>
          </div>

          <!-- วันเริ่มต้น -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">วันเริ่มต้น</label>
            <input
              v-model="formData.start_date"
              type="date"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              :class="formErrors.start_date ? 'border-red-500' : 'border-gray-300'"
            />
            <p v-if="formErrors.start_date" class="text-xs text-red-500 mt-1">กรุณาระบุวันเริ่มต้น</p>
          </div>

          <!-- วันสิ้นสุด -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">วันสิ้นสุด</label>
            <input
              v-model="formData.end_date"
              type="date"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              :class="formErrors.end_date ? 'border-red-500' : 'border-gray-300'"
            />
            <p v-if="formErrors.end_date" class="text-xs text-red-500 mt-1">กรุณาระบุวันสิ้นสุด</p>
          </div>

          <!-- หมายเหตุ -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ (ไม่บังคับ)</label>
            <textarea
              v-model="formData.description"
              rows="3"
              placeholder="ระบุหมายเหตุ (ถ้ามี)"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            ></textarea>
          </div>

          <!-- Footer Buttons -->
          <div class="flex justify-end gap-3 pt-2">
            <button
              type="button"
              class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              @click="closeModal"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              :disabled="saving"
              class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {{ saving ? 'กำลังบันทึก...' : 'บันทึก' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirmation Dialog -->
    <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="fixed inset-0 bg-black/50" @click="showDeleteConfirm = false"></div>
      <div class="relative bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">ยืนยันการลบ</h3>
        <p class="text-sm text-gray-600 mb-6">คุณต้องการลบรายการนี้หรือไม่?</p>
        <div class="flex justify-end gap-3">
          <button
            class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            @click="showDeleteConfirm = false"
          >
            ยกเลิก
          </button>
          <button
            class="px-4 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition-colors"
            @click="handleDelete"
          >
            ลบ
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSupportive } from '@/composables/useSupportive.js'
import { useApi } from '@/composables/useApi.js'
import { useUiStore } from '@/stores/ui.js'
import StatCard from '@/components/StatCard.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/EmptyState.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import { Home, Plus, Search, FileText, Users, Clock, AlertCircle, Pencil, Trash2 } from 'lucide-vue-next'

const { fetchList, create, update, remove } = useSupportive()
const api = useApi()
const ui = useUiStore()

// Data state
const loading = ref(false)
const error = ref(null)
const rows = ref([])
const pagination = ref({ total: 0, limit: 20, offset: 0 })

// Search with Thai IME guard
const searchQuery = ref('')
const isComposing = ref(false)
let searchTimeout = null

// Modal state
const showModal = ref(false)
const editingRecord = ref(null)
const saving = ref(false)

const defaultFormData = () => ({
  personnel_id: null,
  primary_series_name: '',
  job_series_name: '',
  start_date: '',
  end_date: '',
  description: '',
})

const formData = ref(defaultFormData())
const formErrors = ref({})

// Personnel autocomplete state
const personnelSearch = ref('')
const personnelResults = ref([])
const showPersonnelDropdown = ref(false)
let personnelTimeout = null

// Delete confirmation state
const showDeleteConfirm = ref(false)
const deletingId = ref(null)

// Computed stats
const distinctPersonnelCount = computed(() => {
  const ids = new Set(rows.value.map(r => r.personnelId))
  return ids.size
})

const recentCount = computed(() => {
  // นับรายการที่เพิ่มในเดือนปัจจุบัน (ใช้ startDate เป็นตัวอ้างอิง)
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const count = rows.value.filter(r => {
    if (!r.startDate) return false
    const d = new Date(r.startDate)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  }).length
  return count || 'N/A'
})

// Fetch data
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
    pagination.value = result.pagination
  } catch (err) {
    error.value = err.message || 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง'
  } finally {
    loading.value = false
  }
}

// Search with debounce and Thai IME guard
function onSearchInput() {
  if (isComposing.value) return
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    pagination.value.offset = 0
    fetchData()
  }, 300)
}

function onCompositionEnd() {
  isComposing.value = false
  onSearchInput()
}

// Modal: Create
function openCreate() {
  editingRecord.value = null
  formData.value = defaultFormData()
  formErrors.value = {}
  personnelSearch.value = ''
  personnelResults.value = []
  showPersonnelDropdown.value = false
  showModal.value = true
}

// Modal: Edit
function openEdit(record) {
  editingRecord.value = record
  formData.value = {
    personnel_id: record.personnelId,
    primary_series_name: record.primarySeriesName || '',
    job_series_name: record.jobSeriesName || '',
    start_date: record.startDate || '',
    end_date: record.endDate || '',
    description: record.description || '',
  }
  formErrors.value = {}
  showModal.value = true
}

// Modal: Close
function closeModal() {
  showModal.value = false
  formErrors.value = {}
}

// Form validation
function validateForm() {
  const errors = {}
  if (!formData.value.personnel_id) errors.personnel_id = true
  if (!formData.value.primary_series_name.trim()) errors.primary_series_name = true
  if (!formData.value.job_series_name.trim()) errors.job_series_name = true
  if (!formData.value.start_date) errors.start_date = true
  if (!formData.value.end_date) errors.end_date = true
  formErrors.value = errors
  return Object.keys(errors).length === 0
}

// Save (create or update)
async function handleSave() {
  if (!validateForm()) return
  saving.value = true
  try {
    if (editingRecord.value) {
      await update(editingRecord.value.supportiveId, formData.value)
      ui.showToast('อัปเดตสำเร็จ', 'success')
    } else {
      await create(formData.value)
      ui.showToast('บันทึกสำเร็จ', 'success')
    }
    closeModal()
    fetchData()
  } catch (err) {
    ui.showToast(err.message || 'เกิดข้อผิดพลาด', 'error')
  } finally {
    saving.value = false
  }
}

// Delete
function confirmDelete(id) {
  deletingId.value = id
  showDeleteConfirm.value = true
}

async function handleDelete() {
  try {
    await remove(deletingId.value)
    ui.showToast('ลบสำเร็จ', 'success')
    showDeleteConfirm.value = false
    fetchData()
  } catch (err) {
    ui.showToast(err.message || 'เกิดข้อผิดพลาด', 'error')
  }
}

// Personnel autocomplete
function onPersonnelInput() {
  clearTimeout(personnelTimeout)
  formData.value.personnel_id = null
  const val = personnelSearch.value.trim()
  if (!val) {
    personnelResults.value = []
    showPersonnelDropdown.value = false
    return
  }
  personnelTimeout = setTimeout(async () => {
    try {
      const result = await api.get(`/civil-servants?search=${encodeURIComponent(val)}&limit=10`)
      personnelResults.value = result.data || result || []
      showPersonnelDropdown.value = true
    } catch {
      personnelResults.value = []
      showPersonnelDropdown.value = false
    }
  }, 300)
}

function selectPersonnel(person) {
  formData.value.personnel_id = person.servant_id
  personnelSearch.value = person.full_name
  personnelResults.value = []
  showPersonnelDropdown.value = false
}

onMounted(() => {
  fetchData()
})
</script>
