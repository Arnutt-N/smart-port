<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <div class="flex items-center justify-between mb-2">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">
          ผลงานและข้อเสนอ
        </h1>
        <p class="text-sm text-gray-500 mt-1">
          ติดตามผลงานและข้อเสนอการปฏิบัติงานของข้าราชการ
        </p>
      </div>
      <button
        v-if="isAdmin"
        class="btn-primary flex items-center gap-2 px-4 py-2"
        @click="openCreate"
      >
        <Plus class="w-4 h-4" />
        เพิ่มผลงาน
      </button>
    </div>

    <!-- Filters -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
      <ListSearchInput
        v-model="searchQuery"
        placeholder="ค้นหาชื่อผลงาน หรือชื่อข้าราชการ..."
        ime-guard
        @search="onSearchInput"
      />
      <select
        id="work-results-status-filter"
        v-model="statusFilter"
        aria-label="กรองผลงานตามสถานะ"
        class="input"
        @change="onFilterChange"
      >
        <option value="">
          ทุกสถานะ
        </option>
        <option value="draft">
          ร่าง
        </option>
        <option value="submitted">
          ส่งแล้ว
        </option>
        <option value="under_review">
          กำลังพิจารณา
        </option>
        <option value="approved">
          อนุมัติ
        </option>
        <option value="rejected">
          ไม่อนุมัติ
        </option>
      </select>
    </div>

    <SkeletonLoader
      v-if="loading && rows.length === 0"
      type="table"
      :rows="5"
    />

    <EmptyState
      v-else-if="error"
      :icon="AlertCircle"
      title="เกิดข้อผิดพลาด"
      :description="error"
    >
      <button
        class="btn-primary mt-4"
        @click="fetchData"
      >
        ลองใหม่อีกครั้ง
      </button>
    </EmptyState>

    <div
      v-else
      class="bg-white rounded-lg shadow overflow-hidden"
    >
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                ลำดับ
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                ชื่อผลงาน
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                ข้าราชการ
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                ประเภท
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                วันที่ส่ง
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                สถานะ
              </th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                จัดการ
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, index) in rows"
              :key="row.proposalId"
              class="border-b border-gray-100 hover:bg-gray-50"
            >
              <td class="px-6 py-3 text-sm text-gray-700">
                {{ pagination.offset + index + 1 }}
              </td>
              <td class="px-6 py-3 text-sm text-gray-900 font-medium">
                {{ row.title }}
              </td>
              <td class="px-6 py-3 text-sm text-gray-700">
                {{ row.personnelName || '-' }}
              </td>
              <td class="px-6 py-3 text-sm text-gray-700">
                {{ row.proposalType || '-' }}
              </td>
              <td class="px-6 py-3 text-sm text-gray-700">
                {{ row.submissionDate || '-' }}
              </td>
              <td class="px-6 py-3 text-sm">
                <StatusBadge :status="row.status || 'draft'" />
              </td>
              <td class="px-6 py-3 text-sm text-right">
                <TableRowActions :actions="rowActions(row)" />
              </td>
            </tr>
            <tr v-if="rows.length === 0 && !loading">
              <td colspan="7">
                <EmptyState
                  title="ไม่พบข้อมูล"
                  description="ยังไม่มีผลงานหรือข้อเสนอในระบบ"
                  :action-label="isAdmin ? 'เพิ่มผลงาน' : undefined"
                  @action="openCreate"
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

    <!-- View Modal -->
    <Teleport to="body">
      <div
        v-if="showViewModal"
        class="fixed inset-0 z-50 flex items-center justify-center"
      >
        <div
          class="absolute inset-0 bg-black/50"
          @click="showViewModal = false"
        />
        <div class="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
          <div class="px-6 py-4 border-b border-gray-200">
            <h2 class="text-lg font-semibold text-gray-900">
              รายละเอียดผลงาน
            </h2>
          </div>
          <div class="px-6 py-4 space-y-3">
            <div>
              <p class="text-xs text-gray-500">
                ชื่อผลงาน
              </p>
              <p class="text-sm font-medium text-gray-900">
                {{ viewingRow?.title }}
              </p>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <p class="text-xs text-gray-500">
                  ข้าราชการ
                </p>
                <p class="text-sm text-gray-900">
                  {{ viewingRow?.personnelName || '-' }}
                </p>
              </div>
              <div>
                <p class="text-xs text-gray-500">
                  สถานะ
                </p>
                <StatusBadge
                  v-if="viewingRow"
                  :status="viewingRow.status || 'draft'"
                />
              </div>
              <div>
                <p class="text-xs text-gray-500">
                  ประเภท
                </p>
                <p class="text-sm text-gray-900">
                  {{ viewingRow?.proposalType || '-' }}
                </p>
              </div>
              <div>
                <p class="text-xs text-gray-500">
                  วันที่ส่ง
                </p>
                <p class="text-sm text-gray-900">
                  {{ viewingRow?.submissionDate || '-' }}
                </p>
              </div>
              <div>
                <p class="text-xs text-gray-500">
                  คะแนนประเมิน
                </p>
                <p class="text-sm text-gray-900">
                  {{ viewingRow?.evaluationScore ?? '-' }}
                </p>
              </div>
              <div>
                <p class="text-xs text-gray-500">
                  ระดับการอนุมัติ
                </p>
                <p class="text-sm text-gray-900">
                  {{ viewingRow?.approvalLevel || '-' }}
                </p>
              </div>
            </div>
            <div>
              <p class="text-xs text-gray-500">
                รายละเอียด
              </p>
              <p class="text-sm text-gray-900 whitespace-pre-line">
                {{ viewingRow?.description || '-' }}
              </p>
            </div>
            <div v-if="viewingRow?.impactDescription">
              <p class="text-xs text-gray-500">
                ผลกระทบ
              </p>
              <p class="text-sm text-gray-900 whitespace-pre-line">
                {{ viewingRow.impactDescription }}
              </p>
            </div>
            <div v-if="viewingRow?.quantitativeResult">
              <p class="text-xs text-gray-500">
                ผลเชิงปริมาณ
              </p>
              <p class="text-sm text-gray-900">
                {{ viewingRow.quantitativeResult }} {{ viewingRow.resultUnit || '' }}
              </p>
            </div>
          </div>
          <div class="px-6 py-4 border-t border-gray-200 flex justify-end">
            <button
              class="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              @click="showViewModal = false"
            >
              ปิด
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <div
      v-if="showFormModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        class="absolute inset-0 bg-black/40"
        @click="closeFormModal"
      />
      <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 class="text-lg font-semibold text-gray-900">
          {{ editing ? 'แก้ไขผลงาน' : 'เพิ่มผลงานใหม่' }}
        </h2>

        <div class="space-y-3">
          <div>
            <label
              for="work-results-personnel-id"
              class="label"
            >รหัสข้าราชการ (personnel_id) <span class="text-red-500">*</span></label>
            <input
              id="work-results-personnel-id"
              v-model.number="form.personnelId"
              type="number"
              min="1"
              class="input"
            >
          </div>
          <div>
            <label
              for="work-results-title"
              class="label"
            >ชื่อผลงาน <span class="text-red-500">*</span></label>
            <input
              id="work-results-title"
              v-model="form.title"
              type="text"
              class="input"
            >
          </div>
          <div>
            <label
              for="work-results-type"
              class="label"
            >ประเภท</label>
            <select
              id="work-results-type"
              v-model="form.proposalType"
              class="input"
            >
              <option value="improvement">
                การปรับปรุง
              </option>
              <option value="innovation">
                นวัตกรรม
              </option>
              <option value="research">
                งานวิจัย
              </option>
              <option value="service">
                การบริการ
              </option>
              <option value="other">
                อื่น ๆ
              </option>
            </select>
          </div>
          <div>
            <label
              for="work-results-submission-date"
              class="label"
            >วันที่ส่ง <span class="text-red-500">*</span></label>
            <ThaiDatePicker
              id="work-results-submission-date"
              v-model="form.submissionDate"
              label="วันที่ส่งผลงาน"
            />
          </div>
          <div>
            <label
              for="work-results-status"
              class="label"
            >สถานะ</label>
            <select
              id="work-results-status"
              v-model="form.status"
              class="input"
            >
              <option value="draft">
                ร่าง
              </option>
              <option value="submitted">
                ส่งแล้ว
              </option>
              <option value="under_review">
                กำลังพิจารณา
              </option>
              <option value="approved">
                อนุมัติ
              </option>
              <option value="rejected">
                ไม่อนุมัติ
              </option>
            </select>
          </div>
          <div>
            <label
              for="work-results-description"
              class="label"
            >รายละเอียด</label>
            <textarea
              id="work-results-description"
              v-model="form.description"
              rows="3"
              class="input"
            />
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button
            class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            @click="closeFormModal"
          >
            ยกเลิก
          </button>
          <button
            :disabled="saving"
            class="btn-primary px-4 py-2"
            @click="submitForm"
          >
            {{ saving ? 'กำลังบันทึก...' : (editing ? 'บันทึก' : 'สร้าง') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useWorkResults } from '@/composables/useWorkResults.js'
import { useDebouncedCallback } from '@/composables/useDebouncedCallback.js'
import { useRequestSeq } from '@/composables/useRequestSeq.js'
import { useAuthStore } from '@/stores/auth.js'
import { useUiStore } from '@/stores/ui.js'
import { confirmDelete as confirmDeleteAction, confirmSave } from '@/composables/useConfirm.js'
import { buildStandardRowActions } from '@/utils/tableRowActions.js'
import ListSearchInput from '@/components/ListSearchInput.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/EmptyState.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import ThaiDatePicker from '@/components/ThaiDatePicker.vue'
import TableRowActions from '@/components/TableRowActions.vue'
import { AlertCircle, Plus } from 'lucide-vue-next'

const { fetchList, create, update, remove } = useWorkResults()
const auth = useAuthStore()
const ui = useUiStore()
const { next: nextRequest } = useRequestSeq()
const isAdmin = computed(() => auth.isAdmin)

const loading = ref(false)
const error = ref(null)
const rows = ref([])
const pagination = ref({ total: 0, limit: 20, offset: 0, has_more: false })
const searchQuery = ref('')
const { run: scheduleSearch } = useDebouncedCallback(() => {
  pagination.value.offset = 0
  fetchData()
}, 300)
const statusFilter = ref('')

const showViewModal = ref(false)
const viewingRow = ref(null)
const showFormModal = ref(false)
const editing = ref(null)
const saving = ref(false)
const defaultForm = () => ({
  personnelId: null,
  title: '',
  proposalType: 'improvement',
  submissionDate: '',
  status: 'draft',
  description: '',
})
const form = ref(defaultForm())

function rowActions(row) {
  return buildStandardRowActions({
    onView: () => openView(row),
    onEdit: isAdmin.value ? () => openEdit(row) : undefined,
    onDelete: () => openDelete(row),
    canDelete: isAdmin.value,
  })
}

function openView(row) {
  viewingRow.value = row
  showViewModal.value = true
}

function openCreate() {
  editing.value = null
  form.value = defaultForm()
  showFormModal.value = true
}

function openEdit(row) {
  editing.value = row
  form.value = {
    personnelId: row.personnelId,
    title: row.title || '',
    proposalType: row.proposalType || 'improvement',
    submissionDate: row.submissionDate || '',
    status: row.status || 'draft',
    description: row.description || '',
  }
  showFormModal.value = true
}

function closeFormModal() {
  showFormModal.value = false
  editing.value = null
}

function validate() {
  if (!form.value.personnelId) {
    ui.showToast('กรุณาระบุรหัสข้าราชการ', 'error')
    return false
  }
  if (!form.value.title.trim()) {
    ui.showToast('กรุณาระบุชื่อผลงาน', 'error')
    return false
  }
  if (!form.value.submissionDate) {
    ui.showToast('กรุณาระบุวันที่ส่ง', 'error')
    return false
  }
  return true
}

async function submitForm() {
  if (!validate()) return
  if (editing.value) {
    const ok = await confirmSave({ message: 'คุณต้องการบันทึกการแก้ไขผลงานนี้หรือไม่?' })
    if (!ok) return
  }
  saving.value = true
  try {
    const payload = {
      personnelId: form.value.personnelId,
      title: form.value.title.trim(),
      proposalType: form.value.proposalType,
      submissionDate: form.value.submissionDate,
      status: form.value.status,
      description: form.value.description || null,
    }
    if (editing.value) {
      await update(editing.value.proposalId, payload)
      ui.showToast('บันทึกผลงานแล้ว', 'success')
    } else {
      await create(payload)
      ui.showToast('เพิ่มผลงานแล้ว', 'success')
    }
    closeFormModal()
    fetchData()
  } catch (e) {
    ui.showToast(e.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
  } finally {
    saving.value = false
  }
}

async function openDelete(row) {
  const ok = await confirmDeleteAction({
    message: `คุณต้องการลบผลงาน ${row.title || ''} หรือไม่?`,
    detail: 'การลบจะไม่สามารถยกเลิกได้',
  })
  if (!ok) return
  saving.value = true
  try {
    await remove(row.proposalId)
    ui.showToast('ลบผลงานแล้ว', 'success')
    fetchData()
  } catch (e) {
    ui.showToast(e.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
  } finally {
    saving.value = false
  }
}

async function fetchData() {
  const req = nextRequest()
  loading.value = true
  error.value = null
  try {
    const result = await fetchList({
      search: searchQuery.value,
      status: statusFilter.value,
      limit: pagination.value.limit,
      offset: pagination.value.offset,
    })
    if (!req.isCurrent()) return
    rows.value = result.data
    pagination.value = result.pagination
  } catch (err) {
    if (!req.isCurrent()) return
    error.value = err.message || 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง'
  } finally {
    if (req.isCurrent()) loading.value = false
  }
}

function onSearchInput() {
  scheduleSearch()
}

function onFilterChange() {
  pagination.value.offset = 0
  fetchData()
}

onMounted(fetchData)
</script>
