<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <nav class="flex items-center gap-2 text-sm text-gray-500 mb-4">
      <Home class="w-4 h-4" />
      <span>/</span>
      <RouterLink to="/time-multiplier" class="hover:text-gray-700">การนับทวีคูณ</RouterLink>
      <span>/</span>
      <span>จัดการพื้นที่พิเศษ</span>
    </nav>

    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">จัดการพื้นที่พิเศษ (ทวีคูณ)</h1>
        <p class="text-sm text-gray-500 mt-1">
          เพิ่มพื้นที่และกำหนดอัตราทวีคูณ — ข้อมูลเดิมแก้ไขไม่ได้ หากผิดให้ปิดใช้งานแล้วเพิ่มรายการใหม่แทน
        </p>
      </div>
      <button
        class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
        @click="openCreateModal"
      >
        <Plus class="w-4 h-4" />
        เพิ่มพื้นที่
      </button>
    </div>

    <SkeletonLoader v-if="loading && areas.length === 0" type="stat-cards" />
    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatCard
        label="พื้นที่ทั้งหมด"
        :value="areas.length"
        :icon="MapPinned"
        icon-bg-class="bg-blue-50"
        icon-class="text-blue-600"
      />
      <StatCard
        label="ใช้งานอยู่"
        :value="activeCount"
        :icon="CheckCircle2"
        icon-bg-class="bg-green-50"
        icon-class="text-green-600"
      />
      <StatCard
        label="รออ้างอิงแหล่งที่มา"
        :value="pendingCount"
        :icon="AlertTriangle"
        icon-bg-class="bg-amber-50"
        icon-class="text-amber-600"
      />
    </div>

    <div
      v-if="actionError"
      class="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      <span>{{ actionError }}</span>
      <button class="text-red-500 hover:text-red-700" aria-label="ปิดข้อความ" @click="actionError = ''">
        <X class="w-4 h-4" />
      </button>
    </div>

    <SkeletonLoader v-if="loading && areas.length === 0" type="table" :rows="5" />

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
      <div class="border-b border-gray-100 px-6 py-4">
        <h2 class="text-base font-semibold text-gray-900">พื้นที่พิเศษทั้งหมด (รวมที่ปิดใช้งาน)</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">พื้นที่</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ฐานประกาศ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">อัตรา</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ช่วงมีผล</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">อ้างอิง</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สถานะ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="area in areas"
              :key="area.areaMultiplierId"
              class="border-b border-gray-100 hover:bg-gray-50"
              :class="{ 'opacity-60': !area.isActive }"
            >
              <td class="px-6 py-3 text-sm text-gray-900 font-medium">{{ area.areaLabel }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ basisTypeLabel(area.basisType) }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ area.multiplierRatio }}%</td>
              <td class="px-6 py-3 text-sm text-gray-700">
                {{ area.effectiveStartDateThai }} - {{ area.effectiveEndDateThai || 'ไม่กำหนด' }}
              </td>
              <td class="px-6 py-3 text-sm">
                <span
                  class="inline-flex items-center rounded px-2 py-1 text-xs font-medium"
                  :class="area.sourcePending ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'"
                >
                  {{ area.sourcePending ? 'รอเอกสาร' : 'ยืนยันแล้ว' }}
                </span>
              </td>
              <td class="px-6 py-3 text-sm">
                <span
                  class="inline-flex items-center rounded px-2 py-1 text-xs font-medium"
                  :class="area.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'"
                >
                  {{ area.isActive ? 'ใช้งาน' : 'ปิดใช้งาน' }}
                </span>
              </td>
              <td class="px-6 py-3 text-sm">
                <button
                  class="px-3 py-1 rounded-md border text-xs transition-colors disabled:opacity-50"
                  :class="area.isActive
                    ? 'border-red-200 text-red-600 hover:bg-red-50'
                    : 'border-green-200 text-green-600 hover:bg-green-50'"
                  :disabled="togglingId === area.areaMultiplierId"
                  @click="toggleStatus(area)"
                >
                  {{ togglingId === area.areaMultiplierId ? 'กำลังบันทึก...' : area.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน' }}
                </button>
              </td>
            </tr>
            <tr v-if="areas.length === 0">
              <td colspan="7">
                <EmptyState
                  title="ยังไม่มีพื้นที่พิเศษ"
                  description="กดปุ่ม เพิ่มพื้นที่ เพื่อสร้าง master data รายการแรก"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="area-modal-title"
    >
      <div class="fixed inset-0 bg-black bg-opacity-50" @click="closeModal"></div>
      <div class="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h3 id="area-modal-title" class="text-lg font-semibold text-gray-900">เพิ่มพื้นที่พิเศษ</h3>
          <button class="text-gray-400 hover:text-gray-600" aria-label="ปิด" @click="closeModal">
            <X class="w-5 h-5" />
          </button>
        </div>

        <form class="p-6 space-y-4" @submit.prevent="handleSubmit">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">จังหวัด <span class="text-red-500">*</span></label>
              <input
                v-model="formData.province"
                type="text"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                :class="formErrors.province ? 'border-red-500' : 'border-gray-300'"
              />
              <p v-if="formErrors.province" class="text-xs text-red-500 mt-1">กรุณาระบุจังหวัด</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">อำเภอ</label>
              <input
                v-model="formData.district"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="เว้นว่าง = ทั้งจังหวัด"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">ฐานประกาศ <span class="text-red-500">*</span></label>
              <input
                v-model="formData.basis_type"
                type="text"
                list="basis-type-options"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                :class="formErrors.basis_type ? 'border-red-500' : 'border-gray-300'"
                placeholder="เช่น MARTIAL_LAW"
              />
              <datalist id="basis-type-options">
                <option v-for="basis in basisOptions" :key="basis" :value="basis" />
              </datalist>
              <p v-if="formErrors.basis_type" class="text-xs text-red-500 mt-1">กรุณาระบุฐานประกาศ</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">อัตราทวีคูณ (%) <span class="text-red-500">*</span></label>
              <input
                v-model="formData.multiplier_ratio"
                type="number"
                min="100"
                max="999.99"
                step="0.01"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                :class="formErrors.multiplier_ratio ? 'border-red-500' : 'border-gray-300'"
              />
              <div class="flex gap-2 mt-2">
                <button
                  v-for="preset in RATIO_PRESETS"
                  :key="preset"
                  type="button"
                  class="px-2 py-1 rounded border text-xs transition-colors"
                  :class="Number(formData.multiplier_ratio) === preset
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'"
                  @click="formData.multiplier_ratio = preset"
                >
                  {{ preset }}%
                </button>
              </div>
              <p v-if="formErrors.multiplier_ratio" class="text-xs text-red-500 mt-1">อัตราต้องอยู่ระหว่าง 100 ถึง 999.99</p>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">วันเริ่มมีผล <span class="text-red-500">*</span></label>
              <ThaiDatePicker
                v-model="formData.effective_start_date"
                :error="formErrors.effective_start_date ? 'กรุณาระบุวันเริ่มมีผล' : ''"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">วันสิ้นสุด (เว้นว่าง = ไม่กำหนด)</label>
              <ThaiDatePicker
                v-model="formData.effective_end_date"
                :error="formErrors.effective_end_date ? 'วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่ม' : ''"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">อ้างอิงกฎหมาย</label>
            <input
              v-model="formData.legal_reference"
              type="text"
              maxlength="300"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="ประกาศ/คำสั่งที่รองรับอัตรานี้ — เว้นว่างจะติดสถานะรอเอกสาร"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">แหล่งที่มา</label>
            <input
              v-model="formData.source_reference"
              type="text"
              maxlength="500"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="เอกสาร/หนังสือเวียน/ลิงก์อ้างอิง"
            />
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useMultiplier } from '@/composables/useMultiplier.js'
import StatCard from '@/components/StatCard.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/EmptyState.vue'
import ThaiDatePicker from '@/components/ThaiDatePicker.vue'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Home,
  MapPinned,
  Plus,
  X,
} from 'lucide-vue-next'

const { fetchAreas, createArea, setAreaStatus } = useMultiplier()

const RATIO_PRESETS = [150, 200, 300]

const loading = ref(false)
const saving = ref(false)
const togglingId = ref(null)
const error = ref(null)        // โหลดข้อมูลไม่ได้ทั้งหน้า
const actionError = ref('')    // toggle ล้มเหลว — banner ไม่บังตาราง
const submitError = ref('')
const areas = ref([])
const showModal = ref(false)
const formErrors = ref({})
const formData = ref(emptyForm())

const activeCount = computed(() => areas.value.filter((area) => area.isActive).length)
const pendingCount = computed(() => areas.value.filter((area) => area.sourcePending).length)
const basisOptions = computed(() => [...new Set(areas.value.map((area) => area.basisType).filter(Boolean))])

async function fetchData() {
  loading.value = true
  error.value = null
  try {
    const result = await fetchAreas({ activeOnly: false })
    areas.value = result.data
  } catch (err) {
    error.value = err.message || 'ไม่สามารถโหลดข้อมูลพื้นที่พิเศษได้'
  } finally {
    loading.value = false
  }
}

async function toggleStatus(area) {
  const nextActive = !area.isActive
  const message = nextActive
    ? `เปิดใช้งาน "${area.areaLabel}" อีกครั้ง?`
    : `ปิดใช้งาน "${area.areaLabel}"?\nพื้นที่ที่ปิดจะไม่ขึ้นให้เลือกตอนบันทึกรายการใหม่ — รายการที่บันทึกไปแล้วไม่ได้รับผลกระทบ`
  if (!window.confirm(message)) return

  togglingId.value = area.areaMultiplierId
  actionError.value = ''
  try {
    await setAreaStatus(area.areaMultiplierId, nextActive)
    await fetchData()
  } catch (err) {
    actionError.value = err.message || 'ไม่สามารถเปลี่ยนสถานะพื้นที่ได้'
  } finally {
    togglingId.value = null
  }
}

function openCreateModal() {
  formData.value = emptyForm()
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
    await createArea({
      ...formData.value,
      multiplier_ratio: Number(formData.value.multiplier_ratio),
    })
    showModal.value = false
    await fetchData()
  } catch (err) {
    submitError.value = err.message || 'ไม่สามารถเพิ่มพื้นที่ได้'
  } finally {
    saving.value = false
  }
}

function validateForm() {
  const errors = {}
  if (!formData.value.province.trim()) errors.province = true
  if (!formData.value.basis_type.trim()) errors.basis_type = true
  const ratio = Number(formData.value.multiplier_ratio)
  if (!Number.isFinite(ratio) || ratio < 100 || ratio > 999.99) errors.multiplier_ratio = true
  if (!formData.value.effective_start_date) errors.effective_start_date = true
  if (
    formData.value.effective_start_date &&
    formData.value.effective_end_date &&
    formData.value.effective_end_date < formData.value.effective_start_date
  ) {
    errors.effective_end_date = true
  }
  return errors
}

function emptyForm() {
  return {
    province: '',
    district: '',
    basis_type: '',
    multiplier_ratio: 200,
    effective_start_date: '',
    effective_end_date: '',
    legal_reference: '',
    source_reference: '',
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

function onGlobalKeydown(e) {
  if (e.key === 'Escape' && showModal.value) closeModal()
}

onMounted(() => {
  fetchData()
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>
