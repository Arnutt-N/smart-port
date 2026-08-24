<template>
  <div class="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">ตั้งค่า</h1>
      <p class="text-sm text-gray-500 mt-1">จัดการบัญชีผู้ใช้และการตั้งค่าระบบ</p>
    </div>

    <div class="flex gap-2 border-b border-gray-200">
      <button
        type="button"
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer"
        :class="tab === 'account' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'"
        @click="openAccountTab"
      >
        บัญชีของฉัน
      </button>
      <button
        v-if="auth.isSuperAdmin"
        type="button"
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer"
        :class="tab === 'permissions' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'"
        @click="openPermissionsTab"
      >
        สิทธิ์ระบบ
      </button>
    </div>

    <!-- Account tab -->
    <section v-if="tab === 'account'" class="space-y-8">
      <form class="rounded-xl border border-gray-200 bg-white p-6 space-y-4" @submit.prevent="saveProfile">
        <h2 class="text-lg font-semibold text-gray-900">ข้อมูลบัญชี</h2>
        <p class="text-sm text-gray-500">เปลี่ยนชื่อผู้ใช้ต้องยืนยันรหัสผ่านปัจจุบัน</p>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="settings-username">ชื่อผู้ใช้</label>
          <input
            id="settings-username"
            v-model="profileForm.username"
            type="text"
            required
            class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="settings-fullname">ชื่อ-นามสกุล</label>
          <input
            id="settings-fullname"
            v-model="profileForm.full_name"
            type="text"
            required
            class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="settings-email">อีเมล</label>
          <input
            id="settings-email"
            v-model="profileForm.email"
            type="email"
            class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <div v-if="usernameChanged">
          <label class="block text-sm font-medium text-gray-700 mb-1" for="settings-current-for-username">รหัสผ่านปัจจุบัน (ยืนยันเปลี่ยนชื่อผู้ใช้)</label>
          <input
            id="settings-current-for-username"
            v-model="profileForm.current_password"
            type="password"
            autocomplete="current-password"
            required
            class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <p v-if="profileError" role="alert" class="text-sm text-red-600">{{ profileError }}</p>

        <button
          type="submit"
          :disabled="savingProfile"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
        >
          {{ savingProfile ? 'กำลังบันทึก…' : 'บันทึกข้อมูลบัญชี' }}
        </button>
      </form>

      <form class="rounded-xl border border-gray-200 bg-white p-6 space-y-4" @submit.prevent="savePassword">
        <h2 class="text-lg font-semibold text-gray-900">เปลี่ยนรหัสผ่าน</h2>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="settings-current-password">รหัสผ่านปัจจุบัน</label>
          <input
            id="settings-current-password"
            v-model="passwordForm.current"
            type="password"
            autocomplete="current-password"
            required
            class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="settings-new-password">รหัสผ่านใหม่</label>
          <input
            id="settings-new-password"
            v-model="passwordForm.next"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
            class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="settings-confirm-password">ยืนยันรหัสผ่านใหม่</label>
          <input
            id="settings-confirm-password"
            v-model="passwordForm.confirm"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
            class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <p v-if="passwordError" role="alert" class="text-sm text-red-600">{{ passwordError }}</p>
        <button
          type="submit"
          :disabled="savingPassword"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
        >
          {{ savingPassword ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่' }}
        </button>
      </form>
    </section>

    <!-- Permissions tab -->
    <section v-else-if="tab === 'permissions' && auth.isSuperAdmin" class="space-y-4">
      <div class="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-gray-900">เมทริกซ์สิทธิ์ตามบทบาท</h2>
            <p class="text-sm text-gray-500 mt-1">
              ค่าเริ่มต้นจากโค้ด — เปลี่ยนค่าจะบันทึก override (* = มี override) · คืนค่าเริ่มต้นเมื่อติ๊กกลับให้ตรง default
            </p>
          </div>
          <div class="flex gap-2">
            <select
              id="settings-role-select"
              v-model="selectedRole"
              aria-label="เลือกบทบาทเพื่อดูเมทริกซ์สิทธิ์"
              class="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option v-for="role in matrixRoles" :key="role" :value="role">{{ role }}</option>
            </select>
            <button
              type="button"
              :disabled="savingMatrix || pendingOverrides.length === 0"
              class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
              @click="saveMatrix"
            >
              {{ savingMatrix ? 'กำลังบันทึก…' : `บันทึก (${pendingOverrides.length})` }}
            </button>
          </div>
        </div>

        <p v-if="matrixError" role="alert" class="text-sm text-red-600">{{ matrixError }}</p>
        <p v-if="matrixLoading" class="text-sm text-gray-500">กำลังโหลด…</p>

        <div v-else class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200 text-left text-gray-500">
                <th class="py-2 pr-4 font-medium">Resource</th>
                <th v-for="action in matrixActions" :key="action" class="py-2 px-2 font-medium text-center capitalize">
                  {{ action }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(resource, resourceIdx) in matrixResources"
                :key="resource"
                class="border-b border-gray-100"
              >
                <td class="py-2 pr-4 font-medium text-gray-800">{{ resource }}</td>
                <td
                  v-for="(action, actionIdx) in matrixActions"
                  :key="`${resource}-${action}`"
                  class="py-2 px-2 text-center"
                >
                  <input
                    :id="`settings-perm-${resourceIdx}-${actionIdx}`"
                    type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                    :aria-label="`สิทธิ์ ${action} ของบทบาท ${selectedRole} ในส่วน ${resource}`"
                    :checked="cellAllowed(selectedRole, action, resource)"
                    @change="toggleCell(selectedRole, action, resource, $event.target.checked)"
                  />
                  <span
                    v-if="cellHasOverride(selectedRole, action, resource)"
                    class="ml-1 text-[10px] text-amber-600"
                    title="มี override"
                  >*</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { useUiStore } from '@/stores/ui.js'
import { useApi } from '@/composables/useApi.js'
import { confirmSave } from '@/composables/useConfirm.js'
import { buildPendingOverride } from '@/utils/permissionOverridePending.js'

const auth = useAuthStore()
const ui = useUiStore()
const api = useApi()
const route = useRoute()
const router = useRouter()

const tab = ref(
  route.name === 'settings-permissions' || route.query.tab === 'permissions'
    ? 'permissions'
    : 'account'
)

const originalUsername = ref('')
const profileForm = reactive({
  username: '',
  full_name: '',
  email: '',
  current_password: '',
})
const profileError = ref('')
const savingProfile = ref(false)

const passwordForm = reactive({ current: '', next: '', confirm: '' })
const passwordError = ref('')
const savingPassword = ref(false)

const matrixLoading = ref(false)
const matrixError = ref('')
const savingMatrix = ref(false)
const matrixRoles = ref([])
const matrixActions = ref([])
const matrixResources = ref([])
const cellMap = ref({})
const pendingOverrides = ref([])
const selectedRole = ref('operator')

const usernameChanged = computed(
  () => profileForm.username.trim() !== originalUsername.value
)

function cellKey(role, action, resource) {
  return `${role}|${action}|${resource}`
}

function cellAllowed(role, action, resource) {
  return Boolean(cellMap.value[cellKey(role, action, resource)]?.allowed)
}

function cellHasOverride(role, action, resource) {
  return Boolean(cellMap.value[cellKey(role, action, resource)]?.has_override)
}

function toggleCell(role, action, resource, allowed) {
  const key = cellKey(role, action, resource)
  const prev = cellMap.value[key] || {}
  const defaultAllowed = Boolean(prev.default_allowed)
  const pending = buildPendingOverride(
    role,
    action,
    resource,
    allowed,
    defaultAllowed,
    Boolean(prev.has_override)
  )
  cellMap.value = {
    ...cellMap.value,
    [key]: {
      ...prev,
      allowed,
      has_override: pending ? !pending.reset : false,
    },
  }
  const rest = pendingOverrides.value.filter(
    (o) => !(o.role === role && o.action === action && o.resource === resource)
  )
  pendingOverrides.value = pending ? [...rest, pending] : rest
}

async function loadProfile() {
  const me = await auth.fetchMe()
  originalUsername.value = me.username || ''
  profileForm.username = me.username || ''
  profileForm.full_name = me.full_name || me.name || ''
  profileForm.email = me.email || ''
  profileForm.current_password = ''
}

async function saveProfile() {
  profileError.value = ''
  const ok = await confirmSave({ message: 'คุณต้องการบันทึกข้อมูลบัญชีหรือไม่?' })
  if (!ok) return

  savingProfile.value = true
  try {
    const payload = {
      username: profileForm.username.trim(),
      full_name: profileForm.full_name.trim(),
      email: profileForm.email.trim(),
    }
    if (usernameChanged.value) {
      payload.current_password = profileForm.current_password
    }
    await auth.updateMe(payload)
    originalUsername.value = profileForm.username.trim()
    profileForm.current_password = ''
    ui.showToast('บันทึกบัญชีสำเร็จ', 'success')
  } catch (err) {
    profileError.value = err.message || 'บันทึกไม่สำเร็จ'
  } finally {
    savingProfile.value = false
  }
}

async function savePassword() {
  passwordError.value = ''
  if (passwordForm.next !== passwordForm.confirm) {
    passwordError.value = 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน'
    return
  }
  const ok = await confirmSave({ message: 'คุณต้องการเปลี่ยนรหัสผ่านหรือไม่?' })
  if (!ok) return

  savingPassword.value = true
  try {
    await auth.changePassword(passwordForm.current, passwordForm.next)
    passwordForm.current = ''
    passwordForm.next = ''
    passwordForm.confirm = ''
    ui.showToast('เปลี่ยนรหัสผ่านสำเร็จ', 'success')
  } catch (err) {
    passwordError.value = err.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ'
  } finally {
    savingPassword.value = false
  }
}

async function loadMatrix() {
  matrixLoading.value = true
  matrixError.value = ''
  pendingOverrides.value = []
  try {
    const result = await api.get('/settings/permissions')
    const data = result.data || result
    matrixRoles.value = data.roles || []
    matrixActions.value = data.actions || []
    matrixResources.value = data.resources || []
    if (!selectedRole.value || !matrixRoles.value.includes(selectedRole.value)) {
      selectedRole.value = matrixRoles.value[0] || 'operator'
    }
    const next = {}
    for (const cell of data.cells || []) {
      next[cellKey(cell.role, cell.action, cell.resource)] = {
        allowed: Boolean(cell.allowed),
        has_override: Boolean(cell.has_override),
        default_allowed: Boolean(cell.default_allowed),
      }
    }
    cellMap.value = next
  } catch (err) {
    matrixError.value = err.message || 'โหลดเมทริกซ์ไม่สำเร็จ'
  } finally {
    matrixLoading.value = false
  }
}

async function openAccountTab() {
  tab.value = 'account'
  if (route.name !== 'settings-account') {
    await router.replace({ name: 'settings-account' })
  }
}

async function openPermissionsTab() {
  tab.value = 'permissions'
  if (route.name !== 'settings-permissions') {
    await router.replace({ name: 'settings-permissions' })
  }
  if (matrixResources.value.length === 0) {
    await loadMatrix()
  }
}

async function saveMatrix() {
  if (pendingOverrides.value.length === 0) return
  const ok = await confirmSave({ message: 'บันทึกการเปลี่ยนแปลงสิทธิ์ระบบหรือไม่?' })
  if (!ok) return
  savingMatrix.value = true
  matrixError.value = ''
  try {
    await api.put('/settings/permissions', { overrides: pendingOverrides.value })
    ui.showToast('บันทึกสิทธิ์ระบบสำเร็จ', 'success')
    await loadMatrix()
  } catch (err) {
    matrixError.value = err.message || 'บันทึกไม่สำเร็จ'
  } finally {
    savingMatrix.value = false
  }
}

onMounted(async () => {
  try {
    await loadProfile()
  } catch (err) {
    profileError.value = err.message || 'โหลดบัญชีไม่สำเร็จ'
  }
  if (tab.value === 'permissions' && auth.isSuperAdmin) {
    await loadMatrix()
  }
})
</script>
