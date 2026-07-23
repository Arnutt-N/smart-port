<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">รางวัลและความดีความชอบ</h1>
        <p class="text-sm text-gray-500 mt-1">บันทึกและติดตามรางวัลที่ข้าราชการได้รับ</p>
      </div>
      <button
        v-if="isAdmin"
        @click="openCreate"
        class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Plus class="w-4 h-4" />
        เพิ่มรางวัล
      </button>
    </div>

    <div class="relative max-w-md">
      <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search class="w-4 h-4 text-gray-400" />
      </div>
      <input
        v-model="searchQuery"
        @input="onSearchInput"
        type="text"
        placeholder="ค้นหาชื่อรางวัล หรือชื่อข้าราชการ..."
        class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>

    <SkeletonLoader v-if="loading && rows.length === 0" type="table" :rows="5" />

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
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ลำดับ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ชื่อรางวัล</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ข้าราชการ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ประเภท</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ระดับ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันที่ได้รับ</th>
              <th v-if="isAdmin" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, index) in rows"
              :key="row.awardId"
              class="border-b border-gray-100 hover:bg-gray-50"
            >
              <td class="px-6 py-3 text-sm text-gray-700">{{ pagination.offset + index + 1 }}</td>
              <td class="px-6 py-3 text-sm text-gray-900 font-medium">{{ row.awardName }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.servantName || '-' }}</td>
              <td class="px-6 py-3 text-sm">
                <StatusBadge :status="row.awardType || 'general'" />
              </td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ awardLevelLabel(row.awardLevel) }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.awardedDate || '-' }}</td>
              <td v-if="isAdmin" class="px-6 py-3 text-right">
                <div class="flex items-center justify-end gap-1">
                  <button @click="openEdit(row)" class="p-1 text-gray-400 hover:text-blue-600 transition-colors" title="แก้ไข">
                    <Pencil class="w-4 h-4" />
                  </button>
                  <button @click="openDelete(row)" class="p-1 text-gray-400 hover:text-red-600 transition-colors" title="ลบ">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="rows.length === 0 && !loading">
              <td :colspan="isAdmin ? 7 : 6">
                <EmptyState title="ไม่พบข้อมูล" description="ยังไม่มีข้อมูลรางวัลในระบบ" />
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

    <!-- Create / Edit Modal -->
    <div v-if="showFormModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40" @click="closeFormModal"></div>
      <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 class="text-lg font-semibold text-gray-900">{{ editing ? 'แก้ไขรางวัล' : 'เพิ่มรางวัลใหม่' }}</h2>

        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">รหัสข้าราชการ (servant_id) <span class="text-red-500">*</span></label>
            <input v-model.number="form.servantId" type="number" min="1" class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">ชื่อรางวัล <span class="text-red-500">*</span></label>
            <input v-model="form.awardName" type="text" class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">ประเภท</label>
            <select v-model="form.awardType" class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="general">ทั่วไป</option>
              <option value="performance">ผลการปฏิบัติงาน</option>
              <option value="service">การบริการ</option>
              <option value="honor">เกียรติยศ</option>
              <option value="innovation">นวัตกรรม</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">ระดับ</label>
            <select v-model="form.awardLevel" class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-</option>
              <option value="department">ระดับกรม</option>
              <option value="ministry">ระดับกระทรวง</option>
              <option value="national">ระดับชาติ</option>
              <option value="international">ระดับนานาชาติ</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">วันที่ได้รับ</label>
            <ThaiDatePicker v-model="form.awardedDate" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">รายละเอียด</label>
            <textarea v-model="form.description" rows="3" class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button @click="closeFormModal" class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">ยกเลิก</button>
          <button
            @click="submitForm"
            :disabled="saving"
            class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {{ saving ? 'กำลังบันทึก...' : (editing ? 'บันทึก' : 'สร้าง') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirm -->
    <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40" @click="showDeleteConfirm = false"></div>
      <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 class="text-lg font-semibold text-gray-900">ยืนยันการลบ</h2>
        <p class="text-sm text-gray-600">
          คุณต้องการลบรางวัล <span class="font-medium text-gray-900">{{ deletingRow?.awardName }}</span> หรือไม่?
        </p>
        <div class="flex justify-end gap-2 pt-2">
          <button @click="showDeleteConfirm = false" class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">ยกเลิก</button>
          <button
            @click="submitDelete"
            :disabled="saving"
            class="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {{ saving ? 'กำลังลบ...' : 'ลบ' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAwards } from '@/composables/useAwards.js'
import { useAuthStore } from '@/stores/auth.js'
import { useUiStore } from '@/stores/ui.js'
import StatusBadge from '@/components/StatusBadge.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/EmptyState.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import ThaiDatePicker from '@/components/ThaiDatePicker.vue'
import { Plus, Search, Pencil, Trash2, AlertCircle } from 'lucide-vue-next'

const { fetchList, create, update, remove } = useAwards()
const auth = useAuthStore()
const ui = useUiStore()

const isAdmin = computed(() => auth.isAdmin)

const loading = ref(false)
const error = ref(null)
const rows = ref([])
const pagination = ref({ total: 0, limit: 20, offset: 0, has_more: false })
const searchQuery = ref('')
let searchTimeout = null

const showFormModal = ref(false)
const editing = ref(null)
const saving = ref(false)
const defaultForm = () => ({ servantId: null, awardName: '', awardType: 'general', awardLevel: '', awardedDate: '', description: '' })
const form = ref(defaultForm())

const showDeleteConfirm = ref(false)
const deletingRow = ref(null)

const LEVEL_LABELS = {
  department: 'ระดับกรม', ministry: 'ระดับกระทรวง', national: 'ระดับชาติ', international: 'ระดับนานาชาติ',
}
function awardLevelLabel(level) {
  return LEVEL_LABELS[level] || '-'
}

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

function onSearchInput() {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    pagination.value.offset = 0
    fetchData()
  }, 300)
}

function openCreate() {
  editing.value = null
  form.value = defaultForm()
  showFormModal.value = true
}

function openEdit(row) {
  editing.value = row
  form.value = {
    servantId: row.servantId,
    awardName: row.awardName,
    awardType: row.awardType || 'general',
    awardLevel: row.awardLevel || '',
    awardedDate: row.awardedDate || '',
    description: row.description || '',
  }
  showFormModal.value = true
}

function closeFormModal() {
  showFormModal.value = false
  editing.value = null
}

function validate() {
  if (!form.value.servantId) {
    ui.showToast('กรุณาระบุรหัสข้าราชการ', 'error')
    return false
  }
  if (!form.value.awardName.trim()) {
    ui.showToast('กรุณาระบุชื่อรางวัล', 'error')
    return false
  }
  return true
}

async function submitForm() {
  if (!validate()) return
  saving.value = true
  try {
    const payload = {
      servantId: form.value.servantId,
      awardName: form.value.awardName.trim(),
      awardType: form.value.awardType,
      awardLevel: form.value.awardLevel || null,
      awardedDate: form.value.awardedDate || null,
      description: form.value.description || null,
    }
    if (editing.value) {
      await update(editing.value.awardId, payload)
      ui.showToast('บันทึกรางวัลสำเร็จ', 'success')
    } else {
      await create(payload)
      ui.showToast('เพิ่มรางวัลสำเร็จ', 'success')
    }
    closeFormModal()
    fetchData()
  } catch (e) {
    ui.showToast(e.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
  } finally {
    saving.value = false
  }
}

function openDelete(row) {
  deletingRow.value = row
  showDeleteConfirm.value = true
}

async function submitDelete() {
  saving.value = true
  try {
    await remove(deletingRow.value.awardId)
    ui.showToast('ลบรางวัลสำเร็จ', 'success')
    showDeleteConfirm.value = false
    deletingRow.value = null
    fetchData()
  } catch (e) {
    ui.showToast(e.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
  } finally {
    saving.value = false
  }
}

onMounted(fetchData)
</script>
