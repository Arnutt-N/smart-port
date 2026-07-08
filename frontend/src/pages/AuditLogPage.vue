<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <nav class="flex items-center gap-2 text-sm text-gray-500 mb-4">
      <Home class="w-4 h-4" />
      <span>/</span>
      <span>ประวัติการเปลี่ยนแปลง</span>
    </nav>

    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">ประวัติการเปลี่ยนแปลง (Audit Log)</h1>
        <p class="text-sm text-gray-500 mt-1">บันทึกการสร้าง แก้ไข และลบข้อมูลสำคัญในระบบ</p>
      </div>
      <button
        class="inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
        @click="fetchData"
      >
        <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
        โหลดใหม่
      </button>
    </div>

    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">ตาราง</label>
          <select
            v-model="filters.table"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            @change="fetchData"
          >
            <option value="">ทั้งหมด</option>
            <option value="multiplier_experience">การนับทวีคูณ</option>
            <option value="special_area_multiplier">พื้นที่พิเศษ</option>
            <option value="personnel">บุคลากร</option>
            <option value="users">ผู้ใช้งาน</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">การกระทำ</label>
          <select
            v-model="filters.action"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            @change="fetchData"
          >
            <option value="">ทั้งหมด</option>
            <option value="CREATE">สร้าง</option>
            <option value="UPDATE">แก้ไข</option>
            <option value="DELETE">ลบ</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">ผู้ดำเนินการ</label>
          <input
            v-model="filters.userId"
            type="number"
            placeholder="User ID"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            @input="fetchData"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">จำนวนต่อหน้า</label>
          <select
            v-model="pagination.limit"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            @change="fetchData"
          >
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </div>
      </div>
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
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">เวลา</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ผู้ดำเนินการ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">การกระทำ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ตาราง</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Record ID</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.audit_id"
              class="border-b border-gray-100 hover:bg-gray-50"
            >
              <td class="px-6 py-3 text-sm text-gray-700">{{ formatDateTime(row.created_at) }}</td>
              <td class="px-6 py-3 text-sm">
                <div class="text-gray-900 font-medium">{{ row.full_name || row.username || '-' }}</div>
                <div class="text-xs text-gray-500">ID: {{ row.user_id }}</div>
              </td>
              <td class="px-6 py-3 text-sm">
                <span
                  class="inline-flex px-2 py-1 text-xs font-semibold rounded-full"
                  :class="actionBadgeClass(row.action)"
                >
                  {{ actionLabel(row.action) }}
                </span>
              </td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ tableName(row.table_name) }}</td>
              <td class="px-6 py-3 text-sm text-gray-500">{{ row.record_id || '-' }}</td>
              <td class="px-6 py-3 text-sm">
                <button
                  class="text-blue-600 hover:text-blue-800 text-xs font-medium"
                  @click="showDetail(row)"
                >
                  ดูรายละเอียด
                </button>
              </td>
            </tr>
            <tr v-if="rows.length === 0">
              <td colspan="6">
                <EmptyState
                  title="ไม่พบประวัติการเปลี่ยนแปลง"
                  description="ยังไม่มีการบันทึกการเปลี่ยนแปลงในระบบ"
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

    <!-- Detail Modal -->
    <div
      v-if="selectedRow"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click.self="selectedRow = null"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">รายละเอียดการเปลี่ยนแปลง</h3>
          <button @click="selectedRow = null" class="text-gray-400 hover:text-gray-600">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="px-6 py-4 overflow-y-auto max-h-[60vh]">
          <dl class="space-y-3">
            <div>
              <dt class="text-sm font-medium text-gray-500">เวลา</dt>
              <dd class="text-sm text-gray-900">{{ formatDateTime(selectedRow.created_at) }}</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">ผู้ดำเนินการ</dt>
              <dd class="text-sm text-gray-900">{{ selectedRow.full_name || selectedRow.username }} (ID: {{ selectedRow.user_id }})</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">IP Address</dt>
              <dd class="text-sm text-gray-900">{{ selectedRow.ip_address || '-' }}</dd>
            </div>
            <div v-if="selectedRow.before_value">
              <dt class="text-sm font-medium text-gray-500">ก่อนแก้ไข</dt>
              <dd class="text-sm text-gray-900 font-mono bg-gray-50 p-3 rounded-lg overflow-x-auto">
                <pre>{{ JSON.stringify(selectedRow.before_value, null, 2) }}</pre>
              </dd>
            </div>
            <div v-if="selectedRow.after_value">
              <dt class="text-sm font-medium text-gray-500">หลังแก้ไข</dt>
              <dd class="text-sm text-gray-900 font-mono bg-gray-50 p-3 rounded-lg overflow-x-auto">
                <pre>{{ JSON.stringify(selectedRow.after_value, null, 2) }}</pre>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Home, RefreshCw, AlertCircle, X } from 'lucide-vue-next'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/EmptyState.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import { useApi } from '@/composables/useApi.js'

const api = useApi()

const loading = ref(false)
const error = ref('')
const rows = ref([])
const selectedRow = ref(null)

const filters = ref({
  table: '',
  action: '',
  userId: '',
})

const pagination = ref({
  total: 0,
  limit: 50,
  offset: 0,
})

async function fetchData() {
  loading.value = true
  error.value = ''

  try {
    const params = new URLSearchParams({
      limit: pagination.value.limit,
      offset: pagination.value.offset,
    })

    if (filters.value.table) params.append('table', filters.value.table)
    if (filters.value.action) params.append('action', filters.value.action)
    if (filters.value.userId) params.append('user_id', filters.value.userId)

    const result = await api.get(`/audit?${params}`)
    rows.value = result.data || []
    pagination.value.total = result.pagination?.total || 0
  } catch (err) {
    error.value = err.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล'
  } finally {
    loading.value = false
  }
}

function onPageChange(newOffset) {
  pagination.value.offset = newOffset
  fetchData()
}

function showDetail(row) {
  selectedRow.value = row
}

function actionLabel(action) {
  const labels = {
    CREATE: 'สร้าง',
    UPDATE: 'แก้ไข',
    DELETE: 'ลบ',
  }
  return labels[action] || action
}

function actionBadgeClass(action) {
  const classes = {
    CREATE: 'bg-green-100 text-green-800',
    UPDATE: 'bg-blue-100 text-blue-800',
    DELETE: 'bg-red-100 text-red-800',
  }
  return classes[action] || 'bg-gray-100 text-gray-800'
}

function tableName(table) {
  const names = {
    multiplier_experience: 'การนับทวีคูณ',
    special_area_multiplier: 'พื้นที่พิเศษ',
    personnel: 'บุคลากร',
    users: 'ผู้ใช้งาน',
  }
  return names[table] || table
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(() => {
  fetchData()
})
</script>
