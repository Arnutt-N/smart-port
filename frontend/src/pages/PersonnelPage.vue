<template>
  <div class="p-6 space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">ข้อมูลบุคลากร</h1>
        <p class="text-sm text-gray-500 mt-1">ค้นหา ดู และจัดการข้อมูลบุคลากรในระบบ (มาสเตอร์)</p>
      </div>
      <button
        v-if="isAdmin"
        type="button"
        @click="openCreate"
        class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer self-start"
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
        <label v-if="isAdmin" class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            v-model="includeInactive"
            type="checkbox"
            class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            @change="onIncludeInactiveChange"
          />
          แสดงที่ปิดใช้งาน
        </label>
      </div>
    </div>

    <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div v-if="loading" class="py-12 text-center text-sm text-gray-500">กำลังโหลดข้อมูล...</div>

      <div v-else-if="error" class="py-12 text-center">
        <p class="text-sm text-red-600 mb-3">{{ error }}</p>
        <button
          type="button"
          @click="fetchData"
          class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors cursor-pointer"
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

      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ชื่อ-สกุล</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">เลขบัตร</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">รหัสพนักงาน</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ตำแหน่ง</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">หน่วยงาน</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สถานะ</th>
              <th v-if="isAdmin" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">จัดการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="row in rows" :key="row.personnelId" class="hover:bg-gray-50 transition-colors">
              <td class="px-6 py-4 whitespace-nowrap">
                <RouterLink
                  :to="`/profile/${row.personnelId}`"
                  class="text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  {{ row.fullName }}
                </RouterLink>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{{ row.citizenId || '-' }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{{ row.employeeId || '-' }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{{ row.currentPosition || '-' }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{{ row.department || '-' }}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span
                  class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full"
                  :class="row.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
                >
                  {{ row.isActive ? 'ใช้งาน' : 'ปิดใช้งาน' }}
                </span>
              </td>
              <td v-if="isAdmin" class="px-6 py-4 whitespace-nowrap text-right">
                <TableRowActions :actions="rowActions(row)" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!loading && !error && pagination.total > 0" class="px-6 pb-4">
        <PaginationBar
          :total="pagination.total"
          :limit="pagination.limit"
          :offset="pagination.offset"
          @update:offset="onPageChange"
        />
      </div>
    </div>

    <!-- Create / Edit Modal -->
    <div v-if="showFormModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40" @click="closeFormModal"></div>
      <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 class="text-lg font-semibold text-gray-900">
          {{ editingRow ? 'แก้ไขบุคลากร' : 'เพิ่มบุคลากรใหม่' }}
        </h2>

        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">คำนำหน้า</label>
            <select
              v-model="formData.prefixId"
              class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option :value="null">— ไม่ระบุ —</option>
              <option v-for="p in prefixes" :key="p.prefix_id" :value="Number(p.prefix_id)">
                {{ p.prefix_name_th }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">ชื่อ <span class="text-red-500">*</span></label>
            <input
              v-model="formData.firstName"
              type="text"
              class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">นามสกุล <span class="text-red-500">*</span></label>
            <input
              v-model="formData.lastName"
              type="text"
              class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              เลขบัตรประชาชน <span v-if="!editingRow" class="text-red-500">*</span>
            </label>
            <input
              v-model="formData.citizenId"
              type="text"
              maxlength="13"
              inputmode="numeric"
              :disabled="!!editingRow"
              class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="13 หลัก"
            />
            <p v-if="editingRow" class="text-xs text-gray-400 mt-1">เลขบัตรแก้ไขไม่ได้ — หากผิดให้ปิดใช้งานแล้วสร้างใหม่</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">รหัสพนักงาน</label>
            <input
              v-model="formData.employeeId"
              type="text"
              class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="(ไม่บังคับ)"
            />
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            @click="closeFormModal"
            class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            @click="submitForm"
            :disabled="saving"
            class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {{ saving ? 'กำลังบันทึก...' : (editingRow ? 'บันทึก' : 'สร้างบุคลากร') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Toggle active confirm -->
    <div v-if="showToggleConfirm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40" @click="showToggleConfirm = false"></div>
      <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 class="text-lg font-semibold text-gray-900">
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
            @click="showToggleConfirm = false"
            class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            @click="submitToggleActive"
            :disabled="saving"
            class="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
            :class="togglingRow?.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'"
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
import { useAuthStore } from '@/stores/auth.js'
import { useUiStore } from '@/stores/ui.js'
import { shouldOpenPersonnelMasterCreate } from '@/utils/personnelTypeaheadEmpty.js'
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

function rowActions(row) {
  return [
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
  formData.value = defaultFormData()
  showFormModal.value = true
}

function openEdit(row) {
  editingRow.value = row
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
}

function validateForm() {
  if (!formData.value.firstName.trim() || !formData.value.lastName.trim()) {
    ui.showToast('กรุณาระบุชื่อและนามสกุล', 'error')
    return false
  }
  if (!editingRow.value) {
    const cid = formData.value.citizenId.trim()
    if (!/^\d{13}$/.test(cid)) {
      ui.showToast('เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก', 'error')
      return false
    }
  }
  return true
}

async function submitForm() {
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
      ui.showToast('บันทึกข้อมูลบุคลากรสำเร็จ', 'success')
    } else {
      await create({
        firstName: formData.value.firstName.trim(),
        lastName: formData.value.lastName.trim(),
        citizenId: formData.value.citizenId.trim(),
        employeeId: formData.value.employeeId.trim(),
        prefixId: formData.value.prefixId,
      })
      ui.showToast('สร้างบุคลากรสำเร็จ', 'success')
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
    ui.showToast(activating ? 'เปิดใช้งานสำเร็จ' : 'ปิดใช้งานสำเร็จ', 'success')
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
  fetchData()
  if (isAdmin.value && shouldOpenPersonnelMasterCreate(route.query)) {
    openCreate()
    router.replace({ query: {} })
  }
})
</script>
