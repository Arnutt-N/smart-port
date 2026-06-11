<template>
  <div class="p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">จัดการผู้ใช้</h1>
        <p class="text-sm text-gray-500 mt-1">เพิ่ม แก้ไข และจัดการบัญชีผู้ใช้งานระบบ (เฉพาะผู้ดูแลระบบ)</p>
      </div>
      <button
        @click="openCreate"
        class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
      >
        <Plus class="w-4 h-4" />
        เพิ่มผู้ใช้
      </button>
    </div>

    <!-- Search -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div class="relative max-w-md">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search class="h-4 w-4 text-gray-400" />
        </div>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="ค้นหาชื่อผู้ใช้หรือชื่อ-สกุล..."
          class="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          @input="onSearchInput"
          @compositionstart="isComposing = true"
          @compositionend="onCompositionEnd"
        />
      </div>
    </div>

    <!-- Table -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div v-if="loading" class="py-12 text-center text-sm text-gray-500">กำลังโหลดข้อมูล...</div>

      <div v-else-if="error" class="py-12 text-center">
        <p class="text-sm text-red-600 mb-3">{{ error }}</p>
        <button @click="fetchData" class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors cursor-pointer">
          ลองใหม่
        </button>
      </div>

      <EmptyState
        v-else-if="rows.length === 0"
        :icon="Users"
        title="ไม่พบผู้ใช้"
        :description="searchQuery ? 'ไม่พบผู้ใช้ที่ตรงกับคำค้นหา' : 'ยังไม่มีผู้ใช้ในระบบ'"
      />

      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ชื่อผู้ใช้</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ชื่อ-สกุล</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">อีเมล</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สิทธิ์</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สถานะ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">เข้าใช้ล่าสุด</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">จัดการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="row in rows" :key="row.userId" class="hover:bg-gray-50 transition-colors">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">{{ row.username }}</div>
                <div v-if="row.mustChangePassword" class="flex items-center gap-1 text-xs text-amber-600 mt-0.5">
                  <KeyRound class="w-3 h-3" />
                  ยังไม่เปลี่ยนรหัสผ่าน
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ row.fullName }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ row.email || '-' }}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span
                  class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full"
                  :class="row.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'"
                >
                  {{ row.role === 'admin' ? 'Admin' : 'Operator' }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span
                  class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full"
                  :class="row.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
                >
                  {{ row.isActive ? 'ใช้งาน' : 'ปิดใช้งาน' }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ formatDateTime(row.lastLoginAt) }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-right">
                <div class="flex items-center justify-end gap-1">
                  <button @click="openEdit(row)" class="p-1 text-gray-400 hover:text-blue-600 transition-colors cursor-pointer" title="แก้ไข">
                    <Pencil class="w-4 h-4" />
                  </button>
                  <button @click="openResetPassword(row)" class="p-1 text-gray-400 hover:text-amber-600 transition-colors cursor-pointer" title="รีเซ็ตรหัสผ่าน">
                    <KeyRound class="w-4 h-4" />
                  </button>
                  <!-- Self-guard: ไม่แสดงปุ่มปิดบัญชีของตัวเอง -->
                  <button
                    v-if="row.userId !== auth.user?.id"
                    @click="openToggleActive(row)"
                    class="p-1 text-gray-400 transition-colors cursor-pointer"
                    :class="row.isActive ? 'hover:text-red-600' : 'hover:text-green-600'"
                    :title="row.isActive ? 'ปิดบัญชี' : 'เปิดใช้งานบัญชี'"
                  >
                    <component :is="row.isActive ? Ban : CheckCircle" class="w-4 h-4" />
                  </button>
                </div>
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
        <h2 class="text-lg font-semibold text-gray-900">{{ editingUser ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่' }}</h2>

        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">ชื่อผู้ใช้ <span v-if="!editingUser" class="text-red-500">*</span></label>
            <input
              v-model="formData.username"
              type="text"
              :disabled="!!editingUser"
              class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="เช่น somchai.j"
            />
            <p v-if="editingUser" class="text-xs text-gray-400 mt-1">ชื่อผู้ใช้แก้ไขไม่ได้</p>
          </div>

          <template v-if="!editingUser">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน <span class="text-red-500">*</span></label>
              <input
                v-model="formData.password"
                type="password"
                autocomplete="new-password"
                class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="อย่างน้อย 8 ตัวอักษร"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">ยืนยันรหัสผ่าน <span class="text-red-500">*</span></label>
              <input
                v-model="formData.passwordConfirm"
                type="password"
                autocomplete="new-password"
                class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </template>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">ชื่อ-สกุล <span class="text-red-500">*</span></label>
            <input
              v-model="formData.fullName"
              type="text"
              class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="เช่น สมชาย ใจดี"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
            <input
              v-model="formData.email"
              type="email"
              class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="(ไม่บังคับ)"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">สิทธิ์ <span class="text-red-500">*</span></label>
            <select
              v-model="formData.role"
              :disabled="isSelfEditing"
              class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="operator">Operator — บันทึกข้อมูล</option>
              <option value="admin">Admin — อนุมัติ + จัดการผู้ใช้</option>
            </select>
            <p v-if="isSelfEditing" class="text-xs text-gray-400 mt-1">ไม่สามารถแก้ไขสิทธิ์ของตนเองได้</p>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button @click="closeFormModal" class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
            ยกเลิก
          </button>
          <button
            @click="submitForm"
            :disabled="saving"
            class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {{ saving ? 'กำลังบันทึก...' : (editingUser ? 'บันทึก' : 'สร้างผู้ใช้') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Reset Password Modal -->
    <div v-if="showResetModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40" @click="closeResetModal"></div>
      <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 class="text-lg font-semibold text-gray-900">รีเซ็ตรหัสผ่าน</h2>
        <p class="text-sm text-gray-600">
          กำหนดรหัสผ่านใหม่ให้ <span class="font-medium text-gray-900">{{ resettingUser?.username }}</span>
          — ผู้ใช้จะต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งถัดไป
        </p>

        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">รหัสผ่านใหม่ <span class="text-red-500">*</span></label>
            <input
              v-model="resetForm.password"
              type="password"
              autocomplete="new-password"
              class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="อย่างน้อย 8 ตัวอักษร"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">ยืนยันรหัสผ่านใหม่ <span class="text-red-500">*</span></label>
            <input
              v-model="resetForm.passwordConfirm"
              type="password"
              autocomplete="new-password"
              class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button @click="closeResetModal" class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
            ยกเลิก
          </button>
          <button
            @click="submitResetPassword"
            :disabled="saving"
            class="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {{ saving ? 'กำลังดำเนินการ...' : 'รีเซ็ตรหัสผ่าน' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Toggle Active Confirm Modal -->
    <div v-if="showToggleConfirm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40" @click="showToggleConfirm = false"></div>
      <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 class="text-lg font-semibold text-gray-900">
          {{ togglingUser?.isActive ? 'ยืนยันการปิดบัญชี' : 'ยืนยันการเปิดใช้งานบัญชี' }}
        </h2>
        <p class="text-sm text-gray-600">
          คุณต้องการ{{ togglingUser?.isActive ? 'ปิด' : 'เปิดใช้งาน' }}บัญชี
          <span class="font-medium text-gray-900">{{ togglingUser?.username }}</span> หรือไม่?
          <template v-if="togglingUser?.isActive">ผู้ใช้นี้จะไม่สามารถเข้าสู่ระบบได้จนกว่าจะเปิดใช้งานอีกครั้ง</template>
        </p>
        <div class="flex justify-end gap-2 pt-2">
          <button @click="showToggleConfirm = false" class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
            ยกเลิก
          </button>
          <button
            @click="submitToggleActive"
            :disabled="saving"
            class="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
            :class="togglingUser?.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'"
          >
            {{ saving ? 'กำลังดำเนินการ...' : (togglingUser?.isActive ? 'ปิดบัญชี' : 'เปิดใช้งาน') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUsers } from '@/composables/useUsers.js'
import { useAuthStore } from '@/stores/auth.js'
import { useUiStore } from '@/stores/ui.js'
import PaginationBar from '@/components/PaginationBar.vue'
import EmptyState from '@/components/EmptyState.vue'
import { Plus, Search, Pencil, KeyRound, Ban, CheckCircle, Users } from 'lucide-vue-next'

const PASSWORD_MIN_LENGTH = 8

const { fetchList, create, update } = useUsers()
const auth = useAuthStore()
const ui = useUiStore()

// Data state
const loading = ref(false)
const error = ref(null)
const rows = ref([])
const pagination = ref({ total: 0, limit: 20, offset: 0, has_more: false })

// Search state with IME guard
const searchQuery = ref('')
const isComposing = ref(false)
let searchTimeout = null

// Create/Edit modal state
const showFormModal = ref(false)
const editingUser = ref(null)
const saving = ref(false)

const defaultFormData = () => ({
  username: '',
  password: '',
  passwordConfirm: '',
  fullName: '',
  email: '',
  role: 'operator',
})
const formData = ref(defaultFormData())

const isSelfEditing = computed(() => editingUser.value?.userId === auth.user?.id)

// Reset password modal state
const showResetModal = ref(false)
const resettingUser = ref(null)
const resetForm = ref({ password: '', passwordConfirm: '' })

// Toggle active confirm state
const showToggleConfirm = ref(false)
const togglingUser = ref(null)

// ==================== Data fetching ====================

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

function onPageChange(offset) {
  pagination.value.offset = offset
  fetchData()
}

// ==================== Search ====================

function onCompositionEnd() {
  isComposing.value = false
  onSearchInput()
}

function onSearchInput() {
  if (isComposing.value) return
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    pagination.value.offset = 0
    fetchData()
  }, 300)
}

// ==================== Create / Edit ====================

function openCreate() {
  editingUser.value = null
  formData.value = defaultFormData()
  showFormModal.value = true
}

function openEdit(row) {
  editingUser.value = row
  formData.value = {
    username: row.username,
    password: '',
    passwordConfirm: '',
    fullName: row.fullName,
    email: row.email || '',
    role: row.role,
  }
  showFormModal.value = true
}

function closeFormModal() {
  showFormModal.value = false
  editingUser.value = null
}

function validateForm() {
  if (!editingUser.value) {
    if (!formData.value.username.trim()) {
      ui.showToast('กรุณาระบุชื่อผู้ใช้', 'error')
      return false
    }
    if (formData.value.password.length < PASSWORD_MIN_LENGTH) {
      ui.showToast(`รหัสผ่านต้องมีความยาวอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`, 'error')
      return false
    }
    if (formData.value.password !== formData.value.passwordConfirm) {
      ui.showToast('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน', 'error')
      return false
    }
  }
  if (!formData.value.fullName.trim()) {
    ui.showToast('กรุณาระบุชื่อ-สกุล', 'error')
    return false
  }
  return true
}

async function submitForm() {
  if (!validateForm()) return
  saving.value = true
  try {
    if (editingUser.value) {
      await update(editingUser.value.userId, {
        fullName: formData.value.fullName,
        email: formData.value.email || null,
        role: formData.value.role,
      })
      ui.showToast('บันทึกข้อมูลผู้ใช้สำเร็จ', 'success')
    } else {
      await create({
        username: formData.value.username.trim(),
        password: formData.value.password,
        fullName: formData.value.fullName,
        email: formData.value.email || null,
        role: formData.value.role,
      })
      ui.showToast('สร้างผู้ใช้สำเร็จ', 'success')
    }
    closeFormModal()
    fetchData()
  } catch (e) {
    ui.showToast(e.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
  } finally {
    saving.value = false
  }
}

// ==================== Reset password ====================

function openResetPassword(row) {
  resettingUser.value = row
  resetForm.value = { password: '', passwordConfirm: '' }
  showResetModal.value = true
}

function closeResetModal() {
  showResetModal.value = false
  resettingUser.value = null
}

async function submitResetPassword() {
  if (resetForm.value.password.length < PASSWORD_MIN_LENGTH) {
    ui.showToast(`รหัสผ่านต้องมีความยาวอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`, 'error')
    return
  }
  if (resetForm.value.password !== resetForm.value.passwordConfirm) {
    ui.showToast('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน', 'error')
    return
  }
  saving.value = true
  try {
    await update(resettingUser.value.userId, { password: resetForm.value.password })
    ui.showToast('รีเซ็ตรหัสผ่านสำเร็จ — ผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งถัดไป', 'success')
    closeResetModal()
    fetchData()
  } catch (e) {
    ui.showToast(e.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
  } finally {
    saving.value = false
  }
}

// ==================== Toggle active ====================

function openToggleActive(row) {
  togglingUser.value = row
  showToggleConfirm.value = true
}

async function submitToggleActive() {
  saving.value = true
  try {
    const activating = !togglingUser.value.isActive
    await update(togglingUser.value.userId, { isActive: activating })
    ui.showToast(activating ? 'เปิดใช้งานบัญชีสำเร็จ' : 'ปิดบัญชีสำเร็จ', 'success')
    showToggleConfirm.value = false
    togglingUser.value = null
    fetchData()
  } catch (e) {
    ui.showToast(e.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
  } finally {
    saving.value = false
  }
}

// ==================== Helpers ====================

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value.replace(' ', 'T'))
  if (isNaN(date.getTime())) return '-'
  return date.toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(fetchData)
</script>
