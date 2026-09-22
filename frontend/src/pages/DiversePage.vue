<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">การนับแตกต่าง</h1>
        <p class="text-sm text-gray-500 mt-1">บันทึกประสบการณ์แตกต่าง 4 มิติ</p>
      </div>
      <button
        @click="openCreateModal"
        class="btn-primary flex items-center gap-2 px-4 py-2"
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

    <div class="flex items-center gap-3 mb-4">
      <ListSearchInput
        v-model="searchQuery"
        placeholder="ค้นหาชื่อ หรือสายงาน..."
        ime-guard
        @search="onSearchInput"
      />
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
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ลำดับ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ชื่อ-สกุล</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">จาก</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ไป</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">จำนวนต่าง</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">วันครบ 3 ต่าง</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">จัดการ</th>
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
              <td class="px-6 py-3 text-sm text-right">
                <TableRowActions :actions="rowActions(row)" />
              </td>
            </tr>
            <tr v-if="rows.length === 0 && !loading">
              <td colspan="7" class="px-0 py-0">
                <EmptyState
                  title="ไม่พบข้อมูล"
                  description="ยังไม่มีรายการแตกต่าง หรือไม่พบข้อมูลที่ตรงกับการค้นหา"
                  action-label="เพิ่มรายการ"
                  @action="openCreateModal"
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
      <div class="fixed inset-0 bg-black bg-opacity-50" @click="closeModal"></div>
      <div class="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">
            {{ editingRecord ? 'แก้ไขรายการแตกต่าง' : 'เพิ่มรายการแตกต่าง' }}
          </h3>
          <button @click="closeModal" class="text-gray-400 hover:text-gray-600">
            <X class="w-5 h-5" />
          </button>
        </div>

        <form @submit.prevent="handleSubmit" class="p-6 space-y-4">
          <!-- Personnel Autocomplete -->
          <div>
            <label for="diverse-personnel-search" class="block text-sm font-medium text-gray-700 mb-1">บุคลากร <span class="text-red-500">*</span></label>
            <PersonnelTypeahead
              v-model="formData.personnel_id"
              :display-name="prefillName"
              input-id="diverse-personnel-search"
              placeholder="พิมพ์ชื่อเพื่อค้นหา..."
            />
            <p v-if="validationErrors.personnel_id" class="text-red-500 text-xs mt-1">{{ validationErrors.personnel_id }}</p>
            <p v-if="formData.personnel_id && selectedPersonnelName" class="text-green-600 text-xs mt-1">เลือกแล้ว: {{ selectedPersonnelName }}</p>
          </div>

          <!-- Two-column From/To layout -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <!-- Left: จาก (From) -->
            <div class="space-y-3">
              <h4 class="font-medium text-gray-700 border-b pb-1">จาก (เดิม)</h4>
              <div>
                <label for="diverse-from-job-series" class="block text-sm font-medium text-gray-700 mb-1">สายงาน <span class="text-red-500">*</span></label>
                <input
                  v-model="formData.from_job_series"
                  type="text"
                  id="diverse-from-job-series"
                  class="input"
                  :class="{ 'border-red-500': validationErrors.from_job_series }"
                />
                <p v-if="validationErrors.from_job_series" class="text-red-500 text-xs mt-1">{{ validationErrors.from_job_series }}</p>
              </div>
              <div>
                <label for="diverse-from-work-group" class="block text-sm font-medium text-gray-700 mb-1">กลุ่มงาน</label>
                <input v-model="formData.from_work_group" id="diverse-from-work-group" type="text" class="input" />
              </div>
              <div>
                <label for="diverse-from-division" class="block text-sm font-medium text-gray-700 mb-1">ส่วน/ฝ่าย</label>
                <input v-model="formData.from_division" id="diverse-from-division" type="text" class="input" />
              </div>
              <div>
                <label for="diverse-from-province" class="block text-sm font-medium text-gray-700 mb-1">จังหวัด</label>
                <input v-model="formData.from_province" id="diverse-from-province" type="text" class="input" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">วันเริ่มต้น <span class="text-red-500">*</span></label>
                <ThaiDatePicker
                  v-model="formData.from_start_date"
                  id="diverse-from-start-date"
                  label="วันเริ่มต้น (จาก)"
                  :error="validationErrors.from_start_date || ''"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">วันสิ้นสุด <span class="text-red-500">*</span></label>
                <ThaiDatePicker
                  v-model="formData.from_end_date"
                  id="diverse-from-end-date"
                  label="วันสิ้นสุด (จาก)"
                  :error="validationErrors.from_end_date || ''"
                />
              </div>
            </div>

            <!-- Right: ไป (To) -->
            <div class="space-y-3">
              <h4 class="font-medium text-gray-700 border-b pb-1">ไป (ใหม่)</h4>
              <div>
                <label for="diverse-to-job-series" class="block text-sm font-medium text-gray-700 mb-1">สายงาน <span class="text-red-500">*</span></label>
                <input
                  v-model="formData.to_job_series"
                  type="text"
                  id="diverse-to-job-series"
                  class="input"
                  :class="{ 'border-red-500': validationErrors.to_job_series }"
                />
                <p v-if="validationErrors.to_job_series" class="text-red-500 text-xs mt-1">{{ validationErrors.to_job_series }}</p>
              </div>
              <div>
                <label for="diverse-to-work-group" class="block text-sm font-medium text-gray-700 mb-1">กลุ่มงาน</label>
                <input v-model="formData.to_work_group" id="diverse-to-work-group" type="text" class="input" />
              </div>
              <div>
                <label for="diverse-to-division" class="block text-sm font-medium text-gray-700 mb-1">ส่วน/ฝ่าย</label>
                <input v-model="formData.to_division" id="diverse-to-division" type="text" class="input" />
              </div>
              <div>
                <label for="diverse-to-province" class="block text-sm font-medium text-gray-700 mb-1">จังหวัด</label>
                <input v-model="formData.to_province" id="diverse-to-province" type="text" class="input" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">วันเริ่มต้น <span class="text-red-500">*</span></label>
                <ThaiDatePicker
                  v-model="formData.to_start_date"
                  id="diverse-to-start-date"
                  label="วันเริ่มต้น (ไป)"
                  :error="validationErrors.to_start_date || ''"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">วันสิ้นสุด <span class="text-red-500">*</span></label>
                <ThaiDatePicker
                  v-model="formData.to_end_date"
                  id="diverse-to-end-date"
                  label="วันสิ้นสุด (ไป)"
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
                <input id="diverse-diff-job-series" type="checkbox" v-model="formData.is_diff_job_series" class="rounded text-primary-600">
                <span>สายงานต่างกัน</span>
              </label>
              <label class="flex items-center gap-2">
                <input id="diverse-diff-org" type="checkbox" v-model="formData.is_diff_org" class="rounded text-primary-600">
                <span>หน่วยงานต่างกัน</span>
              </label>
              <label class="flex items-center gap-2">
                <input id="diverse-diff-location" type="checkbox" v-model="formData.is_diff_location" class="rounded text-primary-600">
                <span>พื้นที่ต่างกัน</span>
              </label>
              <label class="flex items-center gap-2">
                <input id="diverse-diff-work-nature" type="checkbox" v-model="formData.is_diff_work_nature" class="rounded text-primary-600">
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
              class="btn-primary px-4 py-2"
            >
              {{ submitting ? 'กำลังบันทึก...' : (editingRecord ? 'บันทึกการแก้ไข' : 'บันทึก') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDiverse } from '@/composables/timeEntryCrud.js'
import { useDebouncedCallback } from '@/composables/useDebouncedCallback.js'
import { useListPage } from '@/composables/useListPage.js'
import { useApi } from '@/composables/useApi.js'
import { useAuthStore } from '@/stores/auth.js'
import { useUiStore } from '@/stores/ui.js'
import { confirmDelete as confirmDeleteAction, confirmSave } from '@/composables/useConfirm.js'
import { buildStandardRowActions } from '@/utils/tableRowActions.js'
import { applyPersonnelCreateQuery } from '@/utils/applyPersonnelCreateQuery.js'
import { PERSONNEL_CREATE_QUERY_UNAVAILABLE } from '@/utils/personnelCreateQuery.js'
import PageBreadcrumb from '@/components/PageBreadcrumb.vue'
import ListSearchInput from '@/components/ListSearchInput.vue'
import StatCard from '@/components/StatCard.vue'
import ThaiDatePicker from '@/components/ThaiDatePicker.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/EmptyState.vue'
import TableRowActions from '@/components/TableRowActions.vue'
import PersonnelTypeahead from '@/components/PersonnelTypeahead.vue'
import {
  Plus, FileText, CheckCircle, AlertTriangle,
  AlertCircle, X
} from 'lucide-vue-next'

const { fetchList, create, update, remove } = useDiverse()
const {
  loading,
  error,
  rows,
  summary,
  pagination,
  searchQuery,
  showModal,
  editingRecord,
  fetchData,
  openCreate: shellOpenCreate,
  openEdit: shellOpenEdit,
  closeModal: shellCloseModal,
  removeAndRefetch,
} = useListPage({ fetcher: { fetchList, remove } })
const api = useApi()
const auth = useAuthStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

// operator สร้าง/แก้ไขได้ แต่ลบไม่ได้ — ซ่อนปุ่มลบไม่ให้กดแล้วเจอ 403
const isAdmin = computed(() => auth.isAdmin)

function rowActions(row) {
  return buildStandardRowActions({
    onEdit: () => openEditModal(row),
    onDelete: () => confirmDelete(row),
    canDelete: isAdmin.value,
  })
}

// List state

// Stat counts — ใช้ summary จาก backend (full dataset) ถ้ามี
const passCount = computed(() => {
  if (summary.value?.qualified_count != null) return summary.value.qualified_count
  return rows.value.filter(r => r.diffCount >= 3).length
})
const notYetCount = computed(() => {
  if (summary.value) return (summary.value.total || 0) - (summary.value.qualified_count || 0)
  return rows.value.filter(r => r.diffCount < 3).length
})

const { run: scheduleSearch } = useDebouncedCallback(() => {
  pagination.value.offset = 0
  fetchData()
}, 300)

function onSearchInput() {
  scheduleSearch()
}

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

// Prefill display name for PersonnelTypeahead (edit modal + ?create=1 flow; narrowed in T1.3)
const prefillName = ref('')
const selectedPersonnelName = ref('') // feeds the kept "เลือกแล้ว" line (M2)


// Modal actions
function openCreateModal() {
  formData.value = defaultFormData()
  prefillName.value = ''
  selectedPersonnelName.value = ''
  validationErrors.value = {}
  shellOpenCreate()
}

function openEditModal(row) {
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
  prefillName.value = row.fullName || ''
  selectedPersonnelName.value = row.fullName || ''
  validationErrors.value = {}
  shellOpenEdit(row)
}

function closeModal() {
  validationErrors.value = {}
  shellCloseModal()
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

  if (editingRecord.value) {
    const ok = await confirmSave({
      message: 'คุณต้องการบันทึกการแก้ไขรายการแตกต่างนี้หรือไม่?',
    })
    if (!ok) return
  }

  submitting.value = true
  try {
    // Convert boolean checkboxes to integers for API
    const payload = { ...formData.value }
    payload.is_diff_job_series = payload.is_diff_job_series ? 1 : 0
    payload.is_diff_org = payload.is_diff_org ? 1 : 0
    payload.is_diff_location = payload.is_diff_location ? 1 : 0
    payload.is_diff_work_nature = payload.is_diff_work_nature ? 1 : 0
    // CRITICAL: Never send diff_count -- it's a GENERATED column

    if (editingRecord.value) {
      await update(editingRecord.value.experienceId, payload)
      ui.showToast('แก้ไขรายการแล้ว', 'success')
    } else {
      await create(payload)
      ui.showToast('เพิ่มรายการแล้ว', 'success')
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
async function confirmDelete(row) {
  const ok = await confirmDeleteAction({
    message: `คุณต้องการลบรายการของ ${row.fullName || 'รายการนี้'} ใช่หรือไม่?`,
    detail: 'การลบจะไม่สามารถยกเลิกได้',
    confirmLabel: 'ลบรายการ',
  })
  if (!ok) return
  submitting.value = true
  try {
    await removeAndRefetch(row.experienceId)
    ui.showToast('ลบรายการแล้ว', 'success')
  } catch (err) {
    ui.showToast(err.message || 'ไม่สามารถลบรายการได้', 'error')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  fetchData()
  void applyPersonnelCreateQuery({
    route,
    router,
    openCreate: openCreateModal,
    get: (url) => api.get(url),
    onUnavailable: (reason) => ui.showToast(PERSONNEL_CREATE_QUERY_UNAVAILABLE[reason], 'error'),
  }).then((person) => {
    if (!person) return
    formData.value.personnel_id = person.personnel_id
    prefillName.value = person.full_name ?? ''
    selectedPersonnelName.value = person.full_name ?? ''
  })
})
</script>
