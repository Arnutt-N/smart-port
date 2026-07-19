<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <!-- Breadcrumb -->
    <nav class="flex items-center gap-2 text-sm text-gray-500 mb-4">
      <Home class="w-4 h-4" />
      <span>/</span>
      <span>การนับแตกต่าง</span>
    </nav>

    <!-- Page Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">การนับแตกต่าง</h1>
        <p class="text-sm text-gray-500 mt-1">บันทึกประสบการณ์แตกต่าง 4 มิติ</p>
      </div>
      <button
        @click="openCreateModal"
        class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
      >
        <Plus class="w-4 h-4" />
        เพิ่มรายการ
      </button>
    </div>

    <!-- Stat Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <StatCard
        label="รายการทั้งหมด"
        :value="pagination.total"
        :icon="FileText"
        icon-bg-class="bg-blue-50"
        icon-class="text-blue-600"
      />
      <StatCard
        label="ผ่านเกณฑ์ (>=3 ต่าง)"
        :value="passCount"
        :icon="CheckCircle"
        icon-bg-class="bg-green-50"
        icon-class="text-green-600"
      />
      <StatCard
        label="ยังไม่ครบเกณฑ์"
        :value="notYetCount"
        :icon="AlertTriangle"
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
      action-label="ลองใหม่อีกครั้ง"
      @action="fetchData"
    />

    <!-- Data Table -->
    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ลำดับ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ชื่อ-สกุล</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">จาก</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ไป</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">จำนวนต่าง</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันครบ 3 ต่าง</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, index) in rows"
              :key="row.experienceId"
              class="border-b border-gray-100 hover:bg-gray-50"
            >
              <td class="px-6 py-3 text-sm text-gray-700">{{ pagination.offset + index + 1 }}</td>
              <td class="px-6 py-3 text-sm text-gray-900 font-medium">{{ row.fullName }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.fromJobSeries }} / {{ row.fromProvince }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.toJobSeries }} / {{ row.toProvince }}</td>
              <td class="px-6 py-3 text-sm">
                <template v-if="row.diffCount === 0">
                  <span class="text-gray-400">0/4</span>
                </template>
                <template v-else>
                  <span class="mr-1">{{ row.diffCount }}/4</span>
                  <StatusBadge :status="row.diffCount >= 3 ? 'DIFF_PASS' : 'DIFF_NOT_YET'" />
                </template>
              </td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.qualifiedDateThai || '-' }}</td>
              <td class="px-6 py-3 text-sm">
                <div class="flex items-center gap-2">
                  <button
                    @click="openEditModal(row)"
                    class="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                    title="แก้ไข"
                  >
                    <Pencil class="w-4 h-4" />
                  </button>
                  <button
                    @click="confirmDelete(row)"
                    class="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    title="ลบ"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="rows.length === 0 && !loading">
              <td colspan="7" class="px-6 py-12 text-center text-gray-500">
                <FileText class="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p class="font-medium">ไม่พบข้อมูล</p>
                <p class="text-sm mt-1">ยังไม่มีรายการแตกต่าง หรือไม่พบข้อมูลที่ตรงกับการค้นหา</p>
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
      <div class="fixed inset-0 bg-black bg-opacity-50" @click="closeModal"></div>
      <div class="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">
            {{ editingRow ? 'แก้ไขรายการแตกต่าง' : 'เพิ่มรายการแตกต่าง' }}
          </h3>
          <button @click="closeModal" class="text-gray-400 hover:text-gray-600">
            <X class="w-5 h-5" />
          </button>
        </div>

        <form @submit.prevent="handleSubmit" class="p-6 space-y-4">
          <!-- Personnel Autocomplete -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">บุคลากร <span class="text-red-500">*</span></label>
            <div class="relative">
              <input
                v-model="personnelSearch"
                @input="onPersonnelSearch"
                @compositionstart="isComposingPersonnel = true"
                @compositionend="onPersonnelCompositionEnd"
                type="text"
                placeholder="พิมพ์ชื่อเพื่อค้นหา..."
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                :class="{ 'border-red-500': validationErrors.personnel_id }"
              />
              <!-- Autocomplete dropdown -->
              <div
                v-if="personnelResults.length > 0 && showPersonnelDropdown"
                class="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
              >
                <button
                  v-for="person in personnelResults"
                  :key="person.personnel_id"
                  type="button"
                  @click="selectPersonnel(person)"
                  class="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2"
                >
                  <span class="font-medium">{{ person.full_name }}</span>
                  <span class="text-gray-400 text-xs">{{ person.position_title || '' }}</span>
                </button>
              </div>
            </div>
            <p v-if="validationErrors.personnel_id" class="text-red-500 text-xs mt-1">{{ validationErrors.personnel_id }}</p>
            <p v-if="formData.personnel_id && selectedPersonnelName" class="text-green-600 text-xs mt-1">เลือกแล้ว: {{ selectedPersonnelName }}</p>
          </div>

          <!-- Two-column From/To layout -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <!-- Left: จาก (From) -->
            <div class="space-y-3">
              <h4 class="font-medium text-gray-700 border-b pb-1">จาก (เดิม)</h4>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">สายงาน <span class="text-red-500">*</span></label>
                <input
                  v-model="formData.from_job_series"
                  type="text"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  :class="{ 'border-red-500': validationErrors.from_job_series }"
                />
                <p v-if="validationErrors.from_job_series" class="text-red-500 text-xs mt-1">{{ validationErrors.from_job_series }}</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">กลุ่มงาน</label>
                <input v-model="formData.from_work_group" type="text" class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">ส่วน/ฝ่าย</label>
                <input v-model="formData.from_division" type="text" class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">จังหวัด</label>
                <input v-model="formData.from_province" type="text" class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">วันเริ่มต้น <span class="text-red-500">*</span></label>
                <ThaiDatePicker
                  v-model="formData.from_start_date"
                  :error="validationErrors.from_start_date || ''"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">วันสิ้นสุด <span class="text-red-500">*</span></label>
                <ThaiDatePicker
                  v-model="formData.from_end_date"
                  :error="validationErrors.from_end_date || ''"
                />
              </div>
            </div>

            <!-- Right: ไป (To) -->
            <div class="space-y-3">
              <h4 class="font-medium text-gray-700 border-b pb-1">ไป (ใหม่)</h4>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">สายงาน <span class="text-red-500">*</span></label>
                <input
                  v-model="formData.to_job_series"
                  type="text"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  :class="{ 'border-red-500': validationErrors.to_job_series }"
                />
                <p v-if="validationErrors.to_job_series" class="text-red-500 text-xs mt-1">{{ validationErrors.to_job_series }}</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">กลุ่มงาน</label>
                <input v-model="formData.to_work_group" type="text" class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">ส่วน/ฝ่าย</label>
                <input v-model="formData.to_division" type="text" class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">จังหวัด</label>
                <input v-model="formData.to_province" type="text" class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">วันเริ่มต้น <span class="text-red-500">*</span></label>
                <ThaiDatePicker
                  v-model="formData.to_start_date"
                  :error="validationErrors.to_start_date || ''"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">วันสิ้นสุด <span class="text-red-500">*</span></label>
                <ThaiDatePicker
                  v-model="formData.to_end_date"
                  :error="validationErrors.to_end_date || ''"
                />
              </div>
            </div>
          </div>

          <!-- 4-dimension checklist -->
          <div class="mt-4 p-4 bg-gray-50 rounded-lg">
            <h4 class="font-medium text-gray-700 mb-3">ความแตกต่าง 4 มิติ</h4>
            <div class="grid grid-cols-2 gap-3">
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="formData.is_diff_job_series" class="rounded text-blue-500">
                <span>สายงานต่างกัน</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="formData.is_diff_org" class="rounded text-blue-500">
                <span>หน่วยงานต่างกัน</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="formData.is_diff_location" class="rounded text-blue-500">
                <span>พื้นที่ต่างกัน</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="formData.is_diff_work_nature" class="rounded text-blue-500">
                <span>ลักษณะงานต่างกัน</span>
              </label>
            </div>
            <!-- Live diff_count preview -->
            <div class="mt-3 flex items-center gap-2">
              <span class="text-sm text-gray-600">จำนวนต่าง:</span>
              <span class="font-bold text-lg">{{ diffCountPreview }}/4</span>
              <StatusBadge :status="diffCountPreview >= 3 ? 'DIFF_PASS' : 'DIFF_NOT_YET'" />
            </div>
          </div>

          <!-- Footer buttons -->
          <div class="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              @click="closeModal"
              class="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              :disabled="submitting"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {{ submitting ? 'กำลังบันทึก...' : (editingRow ? 'บันทึกการแก้ไข' : 'บันทึก') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirmation Dialog -->
    <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="fixed inset-0 bg-black bg-opacity-50" @click="showDeleteConfirm = false"></div>
      <div class="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div class="text-center">
          <AlertCircle class="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 class="text-lg font-semibold text-gray-900 mb-2">ยืนยันการลบ</h3>
          <p class="text-sm text-gray-600 mb-6">
            คุณต้องการลบรายการของ <span class="font-medium">{{ deletingRow?.fullName }}</span> ใช่หรือไม่?
          </p>
          <div class="flex justify-center gap-3">
            <button
              @click="showDeleteConfirm = false"
              class="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              @click="handleDelete"
              :disabled="submitting"
              class="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {{ submitting ? 'กำลังลบ...' : 'ลบรายการ' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useDiverse } from '@/composables/useDiverse.js'
import { useApi } from '@/composables/useApi.js'
import { useUiStore } from '@/stores/ui.js'
import StatCard from '@/components/StatCard.vue'
import ThaiDatePicker from '@/components/ThaiDatePicker.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/EmptyState.vue'
import {
  Home, Plus, Search, FileText, CheckCircle, AlertTriangle,
  AlertCircle, Pencil, Trash2, X
} from 'lucide-vue-next'

const { fetchList, create, update, remove } = useDiverse()
const api = useApi()
const ui = useUiStore()

// List state
const loading = ref(false)
const error = ref(null)
const rows = ref([])
const summary = ref(null)
const pagination = ref({ total: 0, limit: 20, offset: 0, has_more: false })

// Stat counts — ใช้ summary จาก backend (full dataset) ถ้ามี
const passCount = computed(() => {
  if (summary.value?.qualified_count != null) return summary.value.qualified_count
  return rows.value.filter(r => r.diffCount >= 3).length
})
const notYetCount = computed(() => {
  if (summary.value) return (summary.value.total || 0) - (summary.value.qualified_count || 0)
  return rows.value.filter(r => r.diffCount < 3).length
})

// Search with IME guard
const searchQuery = ref('')
const isComposing = ref(false)
let searchTimeout = null

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

// Modal state
const showModal = ref(false)
const editingRow = ref(null)
const submitting = ref(false)
const validationErrors = ref({})

const defaultFormData = () => ({
  personnel_id: null,
  from_job_series: '', from_work_group: '', from_division: '', from_province: '',
  from_start_date: '', from_end_date: '',
  to_job_series: '', to_work_group: '', to_division: '', to_province: '',
  to_start_date: '', to_end_date: '',
  is_diff_job_series: false, is_diff_org: false, is_diff_location: false, is_diff_work_nature: false,
})

const formData = ref(defaultFormData())

// Live diff_count preview
const diffCountPreview = computed(() => {
  return (formData.value.is_diff_job_series ? 1 : 0)
       + (formData.value.is_diff_org ? 1 : 0)
       + (formData.value.is_diff_location ? 1 : 0)
       + (formData.value.is_diff_work_nature ? 1 : 0)
})

// Personnel autocomplete
const personnelSearch = ref('')
const personnelResults = ref([])
const showPersonnelDropdown = ref(false)
const selectedPersonnelName = ref('')
const isComposingPersonnel = ref(false)
let personnelTimeout = null

function onPersonnelSearch() {
  if (isComposingPersonnel.value) return
  clearTimeout(personnelTimeout)
  personnelTimeout = setTimeout(async () => {
    if (personnelSearch.value.length < 2) {
      personnelResults.value = []
      showPersonnelDropdown.value = false
      return
    }
    try {
      const result = await api.get(`/personnel?search=${encodeURIComponent(personnelSearch.value)}&limit=10`)
      personnelResults.value = result.data || []
      showPersonnelDropdown.value = true
    } catch {
      personnelResults.value = []
    }
  }, 300)
}

function onPersonnelCompositionEnd() {
  isComposingPersonnel.value = false
  onPersonnelSearch()
}

function selectPersonnel(person) {
  formData.value.personnel_id = person.personnel_id
  selectedPersonnelName.value = person.full_name
  personnelSearch.value = person.full_name
  personnelResults.value = []
  showPersonnelDropdown.value = false
  validationErrors.value.personnel_id = ''
}

// Delete state
const showDeleteConfirm = ref(false)
const deletingRow = ref(null)

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
    summary.value = result.summary || null
    pagination.value = result.pagination
  } catch (err) {
    error.value = err.message || 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง'
  } finally {
    loading.value = false
  }
}

// Modal actions
function openCreateModal() {
  editingRow.value = null
  formData.value = defaultFormData()
  personnelSearch.value = ''
  selectedPersonnelName.value = ''
  validationErrors.value = {}
  showModal.value = true
}

function openEditModal(row) {
  editingRow.value = row
  formData.value = {
    personnel_id: row.personnelId,
    from_job_series: row.fromJobSeries || '',
    from_work_group: row.fromWorkGroup || '',
    from_division: row.fromDivision || '',
    from_province: row.fromProvince || '',
    from_start_date: row.fromStartDate || '',
    from_end_date: row.fromEndDate || '',
    to_job_series: row.toJobSeries || '',
    to_work_group: row.toWorkGroup || '',
    to_division: row.toDivision || '',
    to_province: row.toProvince || '',
    to_start_date: row.toStartDate || '',
    to_end_date: row.toEndDate || '',
    is_diff_job_series: !!row.isDiffJobSeries,
    is_diff_org: !!row.isDiffOrg,
    is_diff_location: !!row.isDiffLocation,
    is_diff_work_nature: !!row.isDiffWorkNature,
  }
  personnelSearch.value = row.fullName || ''
  selectedPersonnelName.value = row.fullName || ''
  validationErrors.value = {}
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingRow.value = null
  validationErrors.value = {}
}

function validateForm() {
  const errors = {}
  if (!formData.value.personnel_id) errors.personnel_id = 'กรุณาเลือกบุคลากร'
  if (!formData.value.from_job_series) errors.from_job_series = 'กรุณากรอกสายงาน'
  if (!formData.value.to_job_series) errors.to_job_series = 'กรุณากรอกสายงาน'
  if (!formData.value.from_start_date) errors.from_start_date = 'กรุณาระบุวันเริ่มต้น'
  if (!formData.value.from_end_date) errors.from_end_date = 'กรุณาระบุวันสิ้นสุด'
  if (!formData.value.to_start_date) errors.to_start_date = 'กรุณาระบุวันเริ่มต้น'
  if (!formData.value.to_end_date) errors.to_end_date = 'กรุณาระบุวันสิ้นสุด'
  validationErrors.value = errors
  return Object.keys(errors).length === 0
}

async function handleSubmit() {
  if (!validateForm()) return

  submitting.value = true
  try {
    // Convert boolean checkboxes to integers for API
    const payload = { ...formData.value }
    payload.is_diff_job_series = payload.is_diff_job_series ? 1 : 0
    payload.is_diff_org = payload.is_diff_org ? 1 : 0
    payload.is_diff_location = payload.is_diff_location ? 1 : 0
    payload.is_diff_work_nature = payload.is_diff_work_nature ? 1 : 0
    // CRITICAL: Never send diff_count -- it's a GENERATED column

    if (editingRow.value) {
      await update(editingRow.value.experienceId, payload)
      ui.showToast('แก้ไขรายการสำเร็จ', 'success')
    } else {
      await create(payload)
      ui.showToast('เพิ่มรายการสำเร็จ', 'success')
    }
    closeModal()
    await fetchData()
  } catch (err) {
    ui.showToast(err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
  } finally {
    submitting.value = false
  }
}

// Delete actions
function confirmDelete(row) {
  deletingRow.value = row
  showDeleteConfirm.value = true
}

async function handleDelete() {
  if (!deletingRow.value) return
  submitting.value = true
  try {
    await remove(deletingRow.value.experienceId)
    ui.showToast('ลบรายการสำเร็จ', 'success')
    showDeleteConfirm.value = false
    deletingRow.value = null
    await fetchData()
  } catch (err) {
    ui.showToast(err.message || 'ไม่สามารถลบรายการได้', 'error')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  fetchData()
})
</script>
