<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">การนับทวีคูณ</h1>
        <p class="text-sm text-gray-500 mt-1">บันทึกช่วงเวลาปฏิบัติงานในพื้นที่พิเศษและคำนวณวันทวีคูณ</p>
      </div>
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div class="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle class="w-4 h-4" />
          <span>ข้อมูล seed ชุดแรกยังรอเอกสารอ้างอิง</span>
        </div>
        <button
          class="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2"
          @click="openCreateModal"
        >
          <Plus class="w-4 h-4" />
          เพิ่มรายการ
        </button>
      </div>
    </div>

    <SkeletonLoader v-if="loading && rows.length === 0 && areas.length === 0" type="stat-cards" />
    <div v-else class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <StatCard
        label="รายการทวีคูณ"
        :value="recordSummary.total"
        :icon="FileText"
        icon-bg-class="bg-blue-50"
        icon-class="text-blue-600"
      />
      <StatCard
        label="วันทวีคูณรวม"
        :value="formatNumber(recordSummary.total_bonus_days)"
        :icon="Clock"
        icon-bg-class="bg-green-50"
        icon-class="text-green-600"
      />
      <StatCard
        label="พื้นที่ใน master data"
        :value="areaSummary.total"
        :icon="MapPinned"
        icon-bg-class="bg-slate-50"
        icon-class="text-slate-600"
      />
      <StatCard
        label="รออ้างอิงแหล่งที่มา"
        :value="areaSummary.source_pending"
        :icon="AlertTriangle"
        icon-bg-class="bg-amber-50"
        icon-class="text-amber-600"
      />
    </div>

    <div class="flex flex-col gap-3 md:flex-row">
      <div class="relative flex-1">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search class="w-4 h-4 text-gray-400" />
        </div>
        <input
          v-model="areaSearchQuery"
          type="text"
          id="multiplier-area-search"
          aria-label="ค้นหาพื้นที่พิเศษ จังหวัด อำเภอ หรือฐานประกาศ"
          placeholder="ค้นหา master data จากจังหวัด อำเภอ หรือฐานประกาศ..."
          class="input pl-10"
        />
      </div>
      <button
        class="inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
        @click="fetchData"
      >
        <RefreshCw class="w-4 h-4" />
        โหลดใหม่
      </button>
    </div>

    <SkeletonLoader v-if="loading && rows.length === 0 && areas.length === 0" type="table" :rows="5" />

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

    <template v-else>
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="border-b border-gray-100 px-6 py-4">
          <h2 class="text-base font-semibold text-gray-900">รายการบันทึกทวีคูณ</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ลำดับ</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ชื่อ-สกุล</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">พื้นที่</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ช่วงปฏิบัติงาน</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ช่วงที่นับได้</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">วันจริง</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">วันทวีคูณ</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">สุทธิ</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, index) in rows"
                :key="row.multiplierId"
                class="border-b border-gray-100 hover:bg-gray-50"
              >
                <td class="px-6 py-3 text-sm text-gray-700">{{ pagination.offset + index + 1 }}</td>
                <td class="px-6 py-3 text-sm text-gray-900 font-medium">{{ row.fullName || '-' }}</td>
                <td class="px-6 py-3 text-sm text-gray-700">{{ row.areaLabel }}</td>
                <td class="px-6 py-3 text-sm text-gray-700">{{ row.startDateThai }} - {{ row.endDateThai }}</td>
                <td class="px-6 py-3 text-sm text-gray-700">{{ row.eligibleStartDateThai }} - {{ row.eligibleEndDateThai }}</td>
                <td class="px-6 py-3 text-sm text-gray-700">{{ row.eligibleDays }}</td>
                <td class="px-6 py-3 text-sm text-gray-700">{{ formatNumber(row.bonusDays) }}</td>
                <td class="px-6 py-3 text-sm text-gray-700">
                  {{ row.netYears }} ปี {{ row.netMonths }} เดือน {{ row.netDayRemainder }} วัน
                </td>
                <td class="px-6 py-3 text-sm text-right">
                  <TableRowActions
                    :actions="isAdmin ? [
                      { key: 'edit', label: 'แก้ไข', onClick: () => openEditModal(row) },
                      { key: 'delete', label: 'ลบ', variant: 'danger', onClick: () => openDeleteConfirm(row) },
                    ] : [
                      { key: 'edit', label: 'แก้ไข', onClick: () => openEditModal(row) },
                    ]"
                  />
                </td>
              </tr>
              <tr v-if="rows.length === 0">
                <td colspan="9">
                  <EmptyState
                    title="ยังไม่มีรายการ"
                    description="เพิ่มรายการปฏิบัติงานในพื้นที่พิเศษเพื่อให้ระบบคำนวณวันทวีคูณ"
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
        @update:offset="onPageChange"
      />

      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 class="text-base font-semibold text-gray-900">Master data พื้นที่พิเศษ</h2>
          <RouterLink
            v-if="isAdmin"
            to="/settings/special-areas"
            class="text-sm text-primary-600 hover:text-primary-700"
          >
            จัดการพื้นที่ →
          </RouterLink>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">พื้นที่</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ฐานประกาศ</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">อัตรา</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">วันเริ่ม</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">วันสิ้นสุด</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">อ้างอิง</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="area in filteredAreas"
                :key="area.areaMultiplierId"
                class="border-b border-gray-100 hover:bg-gray-50"
              >
                <td class="px-6 py-3 text-sm text-gray-900 font-medium">{{ area.areaLabel }}</td>
                <td class="px-6 py-3 text-sm text-gray-700">{{ basisTypeLabel(area.basisType) }}</td>
                <td class="px-6 py-3 text-sm text-gray-700">{{ area.multiplierRatio }}%</td>
                <td class="px-6 py-3 text-sm text-gray-700">{{ area.effectiveStartDateThai }}</td>
                <td class="px-6 py-3 text-sm text-gray-700">{{ area.effectiveEndDateThai || 'ยังไม่มีวันสิ้นสุด' }}</td>
                <td class="px-6 py-3 text-sm">
                  <span
                    class="inline-flex items-center rounded px-2 py-1 text-xs font-medium"
                    :class="area.sourcePending ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'"
                  >
                    {{ area.sourcePending ? 'รอเอกสาร' : 'ยืนยันแล้ว' }}
                  </span>
                </td>
              </tr>
              <tr v-if="filteredAreas.length === 0">
                <td colspan="6">
                  <EmptyState
                    title="ไม่พบข้อมูล"
                    description="ไม่พบพื้นที่พิเศษที่ตรงกับเงื่อนไขค้นหา"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="multiplier-modal-title"
    >
      <div class="fixed inset-0 bg-black bg-opacity-50" @click="closeModal"></div>
      <div class="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h3 id="multiplier-modal-title" class="text-lg font-semibold text-gray-900">
            {{ isEditMode ? 'แก้ไขรายการทวีคูณ' : 'เพิ่มรายการทวีคูณ' }}
          </h3>
          <button class="text-gray-400 hover:text-gray-600" @click="closeModal" aria-label="ปิด">
            <X class="w-5 h-5" />
          </button>
        </div>

        <form class="p-6 space-y-4" @submit.prevent="handleSubmit">
          <div>
            <label for="multiplier-personnel-search" class="block text-sm font-medium text-gray-700 mb-1">บุคลากร <span class="text-red-500">*</span></label>
            <PersonnelTypeahead
              v-model="formData.personnel_id"
              :display-name="prefillName"
              input-id="multiplier-personnel-search"
              placeholder="พิมพ์ชื่อเพื่อค้นหา..."
            />
            <p v-if="formErrors.personnel_id" class="text-xs text-red-500 mt-1">กรุณาเลือกบุคลากร</p>
          </div>

          <div>
            <label for="multiplier-area-select" class="block text-sm font-medium text-gray-700 mb-1">พื้นที่พิเศษ <span class="text-red-500">*</span></label>
            <select
              id="multiplier-area-select"
              v-model="formData.area_multiplier_id"
              class="input"
              :class="formErrors.area_multiplier_id ? 'border-red-500' : 'border-gray-300'"
            >
              <option value="">เลือกพื้นที่</option>
              <option
                v-for="area in areas"
                :key="area.areaMultiplierId"
                :value="area.areaMultiplierId"
              >
                {{ area.areaLabel }} · {{ basisTypeLabel(area.basisType) }} · {{ area.multiplierRatio }}%
              </option>
            </select>
            <p v-if="formErrors.area_multiplier_id" class="text-xs text-red-500 mt-1">กรุณาเลือกพื้นที่พิเศษ</p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="multiplier-form-start" class="block text-sm font-medium text-gray-700 mb-1">วันเริ่มปฏิบัติงาน <span class="text-red-500">*</span></label>
              <ThaiDatePicker v-model="formData.start_date" id="multiplier-form-start" label="วันเริ่มปฏิบัติงาน" :error="formErrors.start_date ? 'กรุณาระบุวันเริ่ม' : ''" />
            </div>
            <div>
              <label for="multiplier-form-end" class="block text-sm font-medium text-gray-700 mb-1">วันสิ้นสุดปฏิบัติงาน <span class="text-red-500">*</span></label>
              <ThaiDatePicker v-model="formData.end_date" id="multiplier-form-end" label="วันสิ้นสุดปฏิบัติงาน" :error="formErrors.end_date ? 'กรุณาระบุวันสิ้นสุด' : ''" />
            </div>
          </div>

          <div>
            <label for="multiplier-proof-reference" class="block text-sm font-medium text-gray-700 mb-1">เอกสารอ้างอิง</label>
            <input
              id="multiplier-proof-reference"
              v-model="formData.proof_reference"
              type="text"
              class="input"
              placeholder="เลขคำสั่ง หนังสือรับรอง หรือหลักฐานประกอบ"
            />
          </div>

          <div>
            <label for="multiplier-description" class="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
            <textarea
              id="multiplier-description"
              v-model="formData.description"
              rows="3"
              class="input"
            ></textarea>
          </div>

          <div v-if="submitError" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {{ submitError }}
          </div>

          <div class="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              @click="closeModal"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              class="btn-primary px-4 py-2"
              :disabled="saving"
            >
              {{ saving ? 'กำลังบันทึก...' : 'บันทึก' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- Delete Confirmation Dialog → global ConfirmDialog -->
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useApi } from '@/composables/useApi.js'
import { useRequestSeq } from '@/composables/useRequestSeq.js'
import { useMultiplier } from '@/composables/useMultiplier.js'
import { useAuthStore } from '@/stores/auth.js'
import { useUiStore } from '@/stores/ui.js'
import { confirmDelete as confirmDeleteAction, confirmSave } from '@/composables/useConfirm.js'
import { applyPersonnelCreateQuery } from '@/utils/applyPersonnelCreateQuery.js'
import { PERSONNEL_CREATE_QUERY_UNAVAILABLE } from '@/utils/personnelCreateQuery.js'
import StatCard from '@/components/StatCard.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/EmptyState.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import ThaiDatePicker from '@/components/ThaiDatePicker.vue'
import TableRowActions from '@/components/TableRowActions.vue'
import PersonnelTypeahead from '@/components/PersonnelTypeahead.vue'
import {
  AlertCircle,
  Clock,
  FileText,
  MapPinned,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-vue-next'

const api = useApi()
const { fetchList, fetchAreas, create, update, remove } = useMultiplier()
const auth = useAuthStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const isAdmin = computed(() => auth.isAdmin)
const { next: nextRequest } = useRequestSeq()

const loading = ref(false)
const saving = ref(false)
const error = ref(null)
const submitError = ref('')
const rows = ref([])
const areas = ref([])
const recordSummary = ref({ total: 0, distinct_personnel: 0, total_effective_days: 0, total_bonus_days: 0 })
const areaSummary = ref({ total: 0, source_pending: 0 })
const pagination = ref({ total: 0, limit: 20, offset: 0, has_more: false })
const areaSearchQuery = ref('')
const showModal = ref(false)
const isEditMode = ref(false)
const editingId = ref(null)
const formErrors = ref({})
// Prefill display name for PersonnelTypeahead (edit modal + ?create=1 flow; narrowed in T1.3)
const prefillName = ref('')

const formData = ref(emptyForm())

const filteredAreas = computed(() => {
  const query = areaSearchQuery.value.trim().toLowerCase()
  if (!query) return areas.value

  return areas.value.filter((area) => {
    return [
      area.province,
      area.district,
      area.areaLabel,
      area.basisType,
      area.legalReference,
      area.sourceReference,
    ].some((value) => String(value || '').toLowerCase().includes(query))
  })
})

async function fetchData() {
  const req = nextRequest()
  loading.value = true
  error.value = null
  try {
    const [listResult, areaResult] = await Promise.all([
      fetchList({ limit: pagination.value.limit, offset: pagination.value.offset }),
      fetchAreas(),
    ])
    if (!req.isCurrent()) return
    rows.value = listResult.data
    recordSummary.value = listResult.summary
    pagination.value = listResult.pagination
    areas.value = areaResult.data
    areaSummary.value = areaResult.summary
  } catch (err) {
    if (!req.isCurrent()) return
    error.value = err.message || 'ไม่สามารถโหลดข้อมูลทวีคูณได้'
  } finally {
    if (req.isCurrent()) loading.value = false
  }
}

function onPageChange(offset) {
  pagination.value.offset = offset
  fetchData()
}

function openCreateModal() {
  isEditMode.value = false
  editingId.value = null
  formData.value = emptyForm()
  prefillName.value = ''
  formErrors.value = {}
  submitError.value = ''
  showModal.value = true
}

function openEditModal(row) {
  isEditMode.value = true
  editingId.value = row.multiplierId
  formData.value = {
    personnel_id: row.personnelId,
    area_multiplier_id: row.areaMultiplierId,
    start_date: row.startDate,
    end_date: row.endDate,
    proof_reference: row.proofReference || '',
    description: row.description || '',
  }
  prefillName.value = row.fullName || ''
  formErrors.value = {}
  submitError.value = ''
  showModal.value = true
}

async function openDeleteConfirm(row) {
  const detail = [
    row.fullName,
    row.areaLabel,
    `${row.startDateThai} - ${row.endDateThai}`,
    `วันทวีคูณ: ${formatNumber(row.bonusDays)} วัน`,
  ].filter(Boolean).join('\n')

  const ok = await confirmDeleteAction({
    message: 'คุณต้องการลบรายการทวีคูณนี้หรือไม่?',
    detail,
    confirmLabel: 'ลบรายการ',
  })
  if (!ok) return

  saving.value = true
  try {
    await remove(row.multiplierId)
    ui.showToast('ลบรายการแล้ว', 'success')
    await fetchData()
  } catch (err) {
    // toast แทน alert() — สไตล์เดียวกับหน้าอื่น และไม่บล็อกเธรด UI
    ui.showToast(err.message || 'ไม่สามารถลบรายการได้', 'error')
  } finally {
    saving.value = false
  }
}

function closeModal() {
  if (saving.value) return
  showModal.value = false
  isEditMode.value = false
  editingId.value = null
}

async function handleSubmit() {
  formErrors.value = validateForm()
  submitError.value = ''
  if (Object.keys(formErrors.value).length > 0) return

  if (isEditMode.value && editingId.value) {
    const ok = await confirmSave({
      message: 'คุณต้องการบันทึกการแก้ไขรายการทวีคูณนี้หรือไม่?',
    })
    if (!ok) return
  }

  saving.value = true
  try {
    const payload = {
      ...formData.value,
      personnel_id: Number(formData.value.personnel_id),
      area_multiplier_id: Number(formData.value.area_multiplier_id),
    }

    if (isEditMode.value && editingId.value) {
      await update(editingId.value, payload)
    } else {
      await create(payload)
    }

    showModal.value = false
    pagination.value.offset = 0
    ui.showToast('บันทึกรายการแล้ว', 'success')
    await fetchData()
  } catch (err) {
    submitError.value = err.message || 'ไม่สามารถบันทึกรายการทวีคูณได้'
  } finally {
    saving.value = false
  }
}

function validateForm() {
  const errors = {}
  if (!formData.value.personnel_id) errors.personnel_id = true
  if (!formData.value.area_multiplier_id) errors.area_multiplier_id = true
  if (!formData.value.start_date) errors.start_date = true
  if (!formData.value.end_date) errors.end_date = true
  if (formData.value.start_date && formData.value.end_date && formData.value.end_date < formData.value.start_date) {
    errors.end_date = true
  }
  return errors
}

function emptyForm() {
  return {
    personnel_id: null,
    area_multiplier_id: '',
    start_date: '',
    end_date: '',
    proof_reference: '',
    description: '',
  }
}

function basisTypeLabel(value) {
  const labels = {
    MARTIAL_LAW: 'กฎอัยการศึก',
    EMERGENCY_DECREE: 'พ.ร.ก.ฉุกเฉิน',
    OTHER: 'อื่น ๆ',
  }
  return labels[value] || value
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })
}

function onGlobalKeydown(e) {
  if (e.key === 'Escape' && showModal.value) closeModal()
}

onMounted(() => {
  fetchData()
  window.addEventListener('keydown', onGlobalKeydown)
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
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>
