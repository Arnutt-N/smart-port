<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <nav class="flex items-center gap-2 text-sm text-gray-500 mb-4">
      <Home class="w-4 h-4" />
      <span>/</span>
      <span>การนับทวีคูณ</span>
    </nav>

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
          class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
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
          placeholder="ค้นหา master data จากจังหวัด อำเภอ หรือฐานประกาศ..."
          class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
        class="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
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
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ลำดับ</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ชื่อ-สกุล</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">พื้นที่</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ช่วงปฏิบัติงาน</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ช่วงที่นับได้</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันจริง</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันทวีคูณ</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สุทธิ</th>
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
              </tr>
              <tr v-if="rows.length === 0">
                <td colspan="8">
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
        <div class="border-b border-gray-100 px-6 py-4">
          <h2 class="text-base font-semibold text-gray-900">Master data พื้นที่พิเศษ</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">พื้นที่</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ฐานประกาศ</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">อัตรา</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันเริ่ม</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันสิ้นสุด</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">อ้างอิง</th>
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

    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="fixed inset-0 bg-black bg-opacity-50" @click="closeModal"></div>
      <div class="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">เพิ่มรายการทวีคูณ</h3>
          <button class="text-gray-400 hover:text-gray-600" @click="closeModal">
            <X class="w-5 h-5" />
          </button>
        </div>

        <form class="p-6 space-y-4" @submit.prevent="handleSubmit">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">บุคลากร <span class="text-red-500">*</span></label>
            <div class="relative">
              <input
                v-model="personnelSearch"
                type="text"
                placeholder="พิมพ์ชื่อเพื่อค้นหา..."
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                :class="formErrors.personnel_id ? 'border-red-500' : 'border-gray-300'"
                @input="onPersonnelSearch"
                @compositionstart="isComposingPersonnel = true"
                @compositionend="onPersonnelCompositionEnd"
              />
              <div
                v-if="personnelResults.length > 0 && showPersonnelDropdown"
                class="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
              >
                <button
                  v-for="person in personnelResults"
                  :key="person.personnel_id"
                  type="button"
                  class="w-full px-4 py-2 text-left text-sm hover:bg-blue-50"
                  @click="selectPersonnel(person)"
                >
                  <span class="font-medium">{{ person.full_name }}</span>
                  <span class="text-gray-400 text-xs ml-2">{{ person.position_title || person.position_name || '' }}</span>
                </button>
              </div>
            </div>
            <p v-if="formErrors.personnel_id" class="text-xs text-red-500 mt-1">กรุณาเลือกบุคลากร</p>
            <p v-else-if="formData.personnel_id && personnelSearch" class="text-xs text-green-600 mt-1">เลือกแล้ว: {{ personnelSearch }}</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">พื้นที่พิเศษ <span class="text-red-500">*</span></label>
            <select
              v-model="formData.area_multiplier_id"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              <label class="block text-sm font-medium text-gray-700 mb-1">วันเริ่มปฏิบัติงาน <span class="text-red-500">*</span></label>
              <ThaiDatePicker v-model="formData.start_date" :error="formErrors.start_date ? 'กรุณาระบุวันเริ่ม' : ''" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">วันสิ้นสุดปฏิบัติงาน <span class="text-red-500">*</span></label>
              <ThaiDatePicker v-model="formData.end_date" :error="formErrors.end_date ? 'กรุณาระบุวันสิ้นสุด' : ''" />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">เอกสารอ้างอิง</label>
            <input
              v-model="formData.proof_reference"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="เลขคำสั่ง หนังสือรับรอง หรือหลักฐานประกอบ"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
            <textarea
              v-model="formData.description"
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
              :disabled="saving"
            >
              {{ saving ? 'กำลังบันทึก...' : 'บันทึก' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useApi } from '@/composables/useApi.js'
import { useMultiplier } from '@/composables/useMultiplier.js'
import StatCard from '@/components/StatCard.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/EmptyState.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import ThaiDatePicker from '@/components/ThaiDatePicker.vue'
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  FileText,
  Home,
  MapPinned,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-vue-next'

const api = useApi()
const { fetchList, fetchAreas, create } = useMultiplier()

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
const formErrors = ref({})
const personnelSearch = ref('')
const personnelResults = ref([])
const showPersonnelDropdown = ref(false)
const isComposingPersonnel = ref(false)
let personnelSearchTimeout = null

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
  loading.value = true
  error.value = null
  try {
    const [listResult, areaResult] = await Promise.all([
      fetchList({ limit: pagination.value.limit, offset: pagination.value.offset }),
      fetchAreas(),
    ])
    rows.value = listResult.data
    recordSummary.value = listResult.summary
    pagination.value = listResult.pagination
    areas.value = areaResult.data
    areaSummary.value = areaResult.summary
  } catch (err) {
    error.value = err.message || 'ไม่สามารถโหลดข้อมูลทวีคูณได้'
  } finally {
    loading.value = false
  }
}

function onPageChange(offset) {
  pagination.value.offset = offset
  fetchData()
}

function openCreateModal() {
  formData.value = emptyForm()
  personnelSearch.value = ''
  personnelResults.value = []
  showPersonnelDropdown.value = false
  formErrors.value = {}
  submitError.value = ''
  showModal.value = true
}

function closeModal() {
  if (saving.value) return
  showModal.value = false
}

async function handleSubmit() {
  formErrors.value = validateForm()
  submitError.value = ''
  if (Object.keys(formErrors.value).length > 0) return

  saving.value = true
  try {
    await create({
      ...formData.value,
      personnel_id: Number(formData.value.personnel_id),
      area_multiplier_id: Number(formData.value.area_multiplier_id),
    })
    showModal.value = false
    pagination.value.offset = 0
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

function onPersonnelSearch() {
  if (isComposingPersonnel.value) return
  queuePersonnelSearch()
}

function onPersonnelCompositionEnd() {
  isComposingPersonnel.value = false
  queuePersonnelSearch()
}

function queuePersonnelSearch() {
  formData.value.personnel_id = null
  clearTimeout(personnelSearchTimeout)
  const query = personnelSearch.value.trim()
  if (query.length < 2) {
    personnelResults.value = []
    showPersonnelDropdown.value = false
    return
  }
  personnelSearchTimeout = setTimeout(async () => {
    try {
      const result = await api.get(`/personnel?search=${encodeURIComponent(query)}&limit=10`)
      personnelResults.value = result.data || []
      showPersonnelDropdown.value = true
    } catch {
      personnelResults.value = []
      showPersonnelDropdown.value = false
    }
  }, 300)
}

function selectPersonnel(person) {
  formData.value.personnel_id = person.personnel_id
  personnelSearch.value = person.full_name
  personnelResults.value = []
  showPersonnelDropdown.value = false
  formErrors.value.personnel_id = false
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

onMounted(() => {
  fetchData()
})
</script>
