<template>
  <div class="p-6 space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">
          ข้อมูลบุคลากร
        </h1>
        <p class="text-sm text-gray-500 mt-1">
          ค้นหา ดู และจัดการข้อมูลบุคลากรในระบบ (มาสเตอร์)
        </p>
      </div>
      <button
        v-if="isAdmin"
        type="button"
        class="btn-primary flex items-center gap-2 px-4 py-2 self-start"
        @click="openCreate"
      >
        <Plus class="w-4 h-4" />
        เพิ่มบุคลากร
      </button>
    </div>

    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div class="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div class="max-w-md flex-1">
          <ListSearchInput
            v-model="searchQuery"
            placeholder="ค้นหาชื่อ เลขบัตร หรือรหัสพนักงาน..."
            ime-guard
            @search="onSearchInput"
          />
        </div>
        <label
          v-if="isAdmin"
          class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none"
        >
          <input
            id="personnel-include-inactive"
            v-model="includeInactive"
            type="checkbox"
            class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            @change="onIncludeInactiveChange"
          >
          แสดงที่ปิดใช้งาน
        </label>
      </div>
    </div>

    <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div
        v-if="loading"
        class="py-12 text-center text-sm text-gray-500"
      >
        กำลังโหลดข้อมูล...
      </div>

      <div
        v-else-if="error"
        class="py-12 text-center"
      >
        <p class="text-sm text-red-600 mb-3">
          {{ error }}
        </p>
        <button
          type="button"
          class="btn-primary px-4 py-2"
          @click="fetchData"
        >
          ลองใหม่
        </button>
      </div>

      <EmptyState
        v-else-if="rows.length === 0"
        :icon="Users"
        title="ไม่พบบุคลากร"
        :description="searchQuery ? 'ไม่พบบุคลากรที่ตรงกับคำค้นหา' : 'ยังไม่มีบุคลากรในระบบ'"
      />

      <div
        v-else
        class="overflow-x-auto"
      >
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                ชื่อ-สกุล
              </th>
              <th
                v-if="isAdmin"
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase"
              >
                เลขบัตร
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                รหัสพนักงาน
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                ตำแหน่ง
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                หน่วยงาน
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                สถานะ
              </th>
              <th
                v-if="isAdmin"
                class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase"
              >
                จัดการ
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr
              v-for="row in rows"
              :key="row.personnelId"
              class="hover:bg-gray-50 transition-colors"
            >
              <td class="px-6 py-4 whitespace-nowrap">
                <RouterLink
                  :to="`/profile/${row.personnelId}`"
                  class="text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  {{ row.fullName }}
                </RouterLink>
              </td>
              <td
                v-if="isAdmin"
                class="px-6 py-4 whitespace-nowrap text-sm text-gray-700"
              >
                {{ row.citizenId || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                {{ row.employeeId || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                {{ row.currentPosition || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                {{ row.department || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span
                  class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full"
                  :class="row.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
                >
                  {{ row.isActive ? 'ใช้งาน' : 'ปิดใช้งาน' }}
                </span>
              </td>
              <td
                v-if="isAdmin"
                class="px-6 py-4 whitespace-nowrap text-right"
              >
                <TableRowActions :actions="rowActions(row)" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="!loading && !error && pagination.total > 0"
        class="px-6 pb-4"
      >
        <PaginationBar
          :total="pagination.total"
          :limit="pagination.limit"
          :offset="pagination.offset"
          @update:offset="onPageChange"
        />
      </div>
    </div>

    <!-- Create / Edit Modal -->
    <div
      v-if="showFormModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="personnel-form-title"
    >
      <div
        class="absolute inset-0 bg-black/40"
        @click="closeFormModal"
      />
      <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2
          id="personnel-form-title"
          class="text-lg font-semibold text-gray-900"
        >
          {{ viewingRow ? 'ดูข้อมูลบุคลากร' : (editingRow ? 'แก้ไขบุคลากร' : 'เพิ่มบุคลากรใหม่') }}
        </h2>

        <div class="space-y-3">
          <div>
            <label
              for="personnel-prefix"
              class="label"
            >คำนำหน้า</label>
            <select
              id="personnel-prefix"
              v-model="formData.prefixId"
              :disabled="!!viewingRow"
              class="input"
            >
              <option :value="null">
                — ไม่ระบุ —
              </option>
              <option
                v-for="p in prefixes"
                :key="p.prefix_id"
                :value="Number(p.prefix_id)"
              >
                {{ p.prefix_name_th }}
              </option>
            </select>
          </div>

          <div>
            <label
              for="personnel-first-name"
              class="label"
            >ชื่อ <span class="text-red-500">*</span></label>
            <input
              id="personnel-first-name"
              v-model="formData.firstName"
              type="text"
              :disabled="!!viewingRow"
              class="input"
            >
          </div>

          <div>
            <label
              for="personnel-last-name"
              class="label"
            >นามสกุล <span class="text-red-500">*</span></label>
            <input
              id="personnel-last-name"
              v-model="formData.lastName"
              type="text"
              :disabled="!!viewingRow"
              class="input"
            >
          </div>

          <div>
            <label
              for="personnel-citizen-id"
              class="label"
            >
              เลขบัตรประชาชน <span
                v-if="!editingRow && !viewingRow"
                class="text-red-500"
              >*</span>
            </label>
            <input
              id="personnel-citizen-id"
              v-model="formData.citizenId"
              type="text"
              maxlength="13"
              inputmode="numeric"
              :disabled="!!editingRow || !!viewingRow"
              class="input disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="13 หลัก"
            >
            <p
              v-if="editingRow"
              class="text-xs text-gray-400 mt-1"
            >
              เลขบัตรแก้ไขไม่ได้ — หากผิดให้ปิดใช้งานแล้วสร้างใหม่
            </p>
          </div>

          <div>
            <label
              for="personnel-employee-id"
              class="label"
            >รหัสพนักงาน</label>
            <input
              id="personnel-employee-id"
              v-model="formData.employeeId"
              type="text"
              :disabled="!!viewingRow"
              class="input"
              placeholder="(ไม่บังคับ)"
            >
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button
            v-if="viewingRow"
            type="button"
            class="btn-secondary px-4 py-2"
            @click="closeFormModal"
          >
            ปิด
          </button>
          <template v-else>
            <button
              type="button"
              class="btn-secondary px-4 py-2"
              @click="closeFormModal"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              :disabled="saving"
              class="btn-primary px-4 py-2"
              @click="submitForm"
            >
              {{ saving ? 'กำลังบันทึก...' : (editingRow ? 'บันทึก' : 'สร้างบุคลากร') }}
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- Toggle active confirm -->
    <div
      v-if="showToggleConfirm"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="personnel-toggle-title"
    >
      <div
        class="absolute inset-0 bg-black/40"
        @click="showToggleConfirm = false"
      />
      <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2
          id="personnel-toggle-title"
          class="text-lg font-semibold text-gray-900"
        >
          {{ togglingRow?.isActive ? 'ยืนยันการปิดใช้งาน' : 'ยืนยันการเปิดใช้งาน' }}
        </h2>
        <p class="text-sm text-gray-600">
          คุณต้องการ{{ togglingRow?.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน' }}
          <span class="font-medium text-gray-900">{{ togglingRow?.fullName }}</span> หรือไม่?
          <template v-if="togglingRow?.isActive">
            คนนี้จะไม่โผล่ในค้นหา/typeahead ตามปกติ แต่ประวัติรายการเวลายังอ้างอิงได้
          </template>
        </p>
        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="btn-secondary px-4 py-2"
            @click="showToggleConfirm = false"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            :disabled="saving"
            class="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
            :class="togglingRow?.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'"
            @click="submitToggleActive"
          >
            {{ saving ? 'กำลังดำเนินการ...' : (togglingRow?.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { usePersonnelMaster } from '@/composables/usePersonnelMaster.js'
import { useDebouncedCallback } from '@/composables/useDebouncedCallback.js'
import { useRequestSeq } from '@/composables/useRequestSeq.js'
import { useModalA11y } from '@/composables/useModalA11y.js'
import { useAuthStore } from '@/stores/auth.js'
import { useUiStore } from '@/stores/ui.js'
import { shouldOpenPersonnelMasterCreate } from '@/utils/personnelTypeaheadEmpty.js'
import { thaiCitizenIdError } from '@/utils/thaiCitizenId.js'
import ListSearchInput from '@/components/ListSearchInput.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import EmptyState from '@/components/EmptyState.vue'
import TableRowActions from '@/components/TableRowActions.vue'
import { Plus, Ban, CheckCircle, Users } from 'lucide-vue-next'

const { fetchList, fetchLookups, create, update } = usePersonnelMaster()
const auth = useAuthStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const { next: nextRequest } = useRequestSeq()

const isAdmin = computed(() => auth.isAdmin)

const loading = ref(false)
const error = ref(null)
const rows = ref([])
const pagination = ref({ total: 0, limit: 20, offset: 0, has_more: false })
const searchQuery = ref('')
const includeInactive = ref(false)
const prefixes = ref([])

const { run: scheduleSearch } = useDebouncedCallback(() => {
  pagination.value.offset = 0
  fetchData()
}, 300)

const showFormModal = ref(false)
const editingRow = ref(null)
const viewingRow = ref(null)
const saving = ref(false)

const defaultFormData = () => ({
  prefixId: null,
  firstName: '',
  lastName: '',
  citizenId: '',
  employeeId: '',
})
const formData = ref(defaultFormData())

const showToggleConfirm = ref(false)
const togglingRow = ref(null)

// N51: role="dialog" + Escape ปิด
useModalA11y(showFormModal, closeFormModal)
useModalA11y(showToggleConfirm, () => { showToggleConfirm.value = false })

function rowActions(row) {
  return [
    { key: 'view', label: 'ดูรายละเอียด', onClick: () => openView(row) },
    { key: 'edit', label: 'แก้ไข', onClick: () => openEdit(row) },
    {
      key: 'toggle',
      label: row.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน',
      icon: row.isActive ? Ban : CheckCircle,
      variant: row.isActive ? 'danger' : 'success',
      onClick: () => openToggleActive(row),
    },
  ]
}

async function fetchData() {
  const req = nextRequest()
  loading.value = true
  error.value = null
  try {
    const result = await fetchList({
      search: searchQuery.value,
      limit: pagination.value.limit,
      offset: pagination.value.offset,
      includeInactive: includeInactive.value,
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

function onPageChange(offset) {
  pagination.value.offset = offset
  fetchData()
}

function onSearchInput() {
  scheduleSearch()
}

function onIncludeInactiveChange() {
  pagination.value.offset = 0
  fetchData()
}

function openCreate() {
  editingRow.value = null
  viewingRow.value = null
  formData.value = defaultFormData()
  showFormModal.value = true
}

function openView(row) {
  viewingRow.value = row
  editingRow.value = null
  formData.value = {
    prefixId: row.prefixId != null ? Number(row.prefixId) : null,
    firstName: row.firstName || '',
    lastName: row.lastName || '',
    citizenId: row.citizenId || '',
    employeeId: row.employeeId || '',
  }
  showFormModal.value = true
}

function openEdit(row) {
  editingRow.value = row
  viewingRow.value = null
  formData.value = {
    prefixId: row.prefixId != null ? Number(row.prefixId) : null,
    firstName: row.firstName || '',
    lastName: row.lastName || '',
    citizenId: row.citizenId || '',
    employeeId: row.employeeId || '',
  }
  showFormModal.value = true
}

function closeFormModal() {
  showFormModal.value = false
  editingRow.value = null
  viewingRow.value = null
}

function validateForm() {
  if (!formData.value.firstName.trim() || !formData.value.lastName.trim()) {
    ui.showToast('กรุณาระบุชื่อและนามสกุล', 'error')
    return false
  }
  if (!editingRow.value) {
    const cidError = thaiCitizenIdError(formData.value.citizenId)
    if (cidError) {
      ui.showToast(cidError, 'error')
      return false
    }
  }
  return true
}

async function submitForm() {
  if (viewingRow.value) return
  if (!validateForm()) return
  saving.value = true
  try {
    if (editingRow.value) {
      await update(editingRow.value.personnelId, {
        firstName: formData.value.firstName.trim(),
        lastName: formData.value.lastName.trim(),
        employeeId: formData.value.employeeId.trim(),
        prefixId: formData.value.prefixId,
      })
      ui.showToast('บันทึกข้อมูลบุคลากรแล้ว', 'success')
    } else {
      await create({
        firstName: formData.value.firstName.trim(),
        lastName: formData.value.lastName.trim(),
        citizenId: formData.value.citizenId.trim(),
        employeeId: formData.value.employeeId.trim(),
        prefixId: formData.value.prefixId,
      })
      ui.showToast('สร้างบุคลากรแล้ว', 'success')
    }
    closeFormModal()
    fetchData()
  } catch (e) {
    ui.showToast(e.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
  } finally {
    saving.value = false
  }
}

function openToggleActive(row) {
  togglingRow.value = row
  showToggleConfirm.value = true
}

async function submitToggleActive() {
  saving.value = true
  try {
    const activating = !togglingRow.value.isActive
    await update(togglingRow.value.personnelId, { isActive: activating })
    ui.showToast(activating ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว', 'success')
    showToggleConfirm.value = false
    togglingRow.value = null
    fetchData()
  } catch (e) {
    ui.showToast(e.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    prefixes.value = await fetchLookups()
  } catch {
    prefixes.value = []
    ui.showToast('โหลดรายการคำนำหน้าไม่สำเร็จ', 'error')
  }
  const q = String(route.query.search ?? '').trim()
  if (q) {
    searchQuery.value = q
    pagination.value.offset = 0
  }
  fetchData()
  if (isAdmin.value && shouldOpenPersonnelMasterCreate(route.query)) {
    openCreate()
    router.replace({ query: {} })
  } else if (q) {
    router.replace({ query: {} })
  }
})
</script>
