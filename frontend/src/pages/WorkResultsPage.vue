<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <div class="mb-2">
      <h1 class="text-2xl font-bold text-gray-900">ผลงานและข้อเสนอ</h1>
      <p class="text-sm text-gray-500 mt-1">ติดตามผลงานและข้อเสนอการปฏิบัติงานของข้าราชการ</p>
    </div>

    <!-- Filters -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
      <div class="relative flex-1">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search class="w-4 h-4 text-gray-400" />
        </div>
        <input
          v-model="searchQuery"
          @input="onSearchInput"
          type="text"
          placeholder="ค้นหาชื่อผลงาน หรือชื่อข้าราชการ..."
          class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <select
        v-model="statusFilter"
        @change="onFilterChange"
        class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="">ทุกสถานะ</option>
        <option value="draft">ร่าง</option>
        <option value="submitted">ส่งแล้ว</option>
        <option value="under_review">กำลังพิจารณา</option>
        <option value="approved">อนุมัติ</option>
        <option value="rejected">ไม่อนุมัติ</option>
      </select>
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
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ชื่อผลงาน</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ข้าราชการ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ประเภท</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันที่ส่ง</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สถานะ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ดู</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, index) in rows"
              :key="row.proposalId"
              class="border-b border-gray-100 hover:bg-gray-50"
            >
              <td class="px-6 py-3 text-sm text-gray-700">{{ pagination.offset + index + 1 }}</td>
              <td class="px-6 py-3 text-sm text-gray-900 font-medium">{{ row.title }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.servantName || '-' }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.proposalType || '-' }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.submissionDate || '-' }}</td>
              <td class="px-6 py-3 text-sm">
                <StatusBadge :status="row.status || 'draft'" />
              </td>
              <td class="px-6 py-3 text-sm">
                <button
                  @click="openView(row)"
                  class="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                  title="ดูรายละเอียด"
                >
                  <Eye class="w-4 h-4" />
                </button>
              </td>
            </tr>
            <tr v-if="rows.length === 0 && !loading">
              <td colspan="7">
                <EmptyState
                  title="ไม่พบข้อมูล"
                  description="ยังไม่มีผลงานหรือข้อเสนอในระบบ"
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
      <div v-if="showViewModal" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" @click="showViewModal = false"></div>
        <div class="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
          <div class="px-6 py-4 border-b border-gray-200">
            <h2 class="text-lg font-semibold text-gray-900">รายละเอียดผลงาน</h2>
          </div>
          <div class="px-6 py-4 space-y-3">
            <div>
              <p class="text-xs text-gray-500">ชื่อผลงาน</p>
              <p class="text-sm font-medium text-gray-900">{{ viewingRow?.title }}</p>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <p class="text-xs text-gray-500">ข้าราชการ</p>
                <p class="text-sm text-gray-900">{{ viewingRow?.servantName || '-' }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">สถานะ</p>
                <StatusBadge v-if="viewingRow" :status="viewingRow.status || 'draft'" />
              </div>
              <div>
                <p class="text-xs text-gray-500">ประเภท</p>
                <p class="text-sm text-gray-900">{{ viewingRow?.proposalType || '-' }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">วันที่ส่ง</p>
                <p class="text-sm text-gray-900">{{ viewingRow?.submissionDate || '-' }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">คะแนนประเมิน</p>
                <p class="text-sm text-gray-900">{{ viewingRow?.evaluationScore ?? '-' }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">ระดับการอนุมัติ</p>
                <p class="text-sm text-gray-900">{{ viewingRow?.approvalLevel || '-' }}</p>
              </div>
            </div>
            <div>
              <p class="text-xs text-gray-500">รายละเอียด</p>
              <p class="text-sm text-gray-900 whitespace-pre-line">{{ viewingRow?.description || '-' }}</p>
            </div>
            <div v-if="viewingRow?.impactDescription">
              <p class="text-xs text-gray-500">ผลกระทบ</p>
              <p class="text-sm text-gray-900 whitespace-pre-line">{{ viewingRow.impactDescription }}</p>
            </div>
            <div v-if="viewingRow?.quantitativeResult">
              <p class="text-xs text-gray-500">ผลเชิงปริมาณ</p>
              <p class="text-sm text-gray-900">{{ viewingRow.quantitativeResult }} {{ viewingRow.resultUnit || '' }}</p>
            </div>
          </div>
          <div class="px-6 py-4 border-t border-gray-200 flex justify-end">
            <button
              @click="showViewModal = false"
              class="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ปิด
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useWorkResults } from '@/composables/useWorkResults.js'
import StatusBadge from '@/components/StatusBadge.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/EmptyState.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import { AlertCircle, Eye, Search } from 'lucide-vue-next'

const { fetchList } = useWorkResults()

const loading = ref(false)
const error = ref(null)
const rows = ref([])
const pagination = ref({ total: 0, limit: 20, offset: 0, has_more: false })
const searchQuery = ref('')
const statusFilter = ref('')
let searchTimeout = null

const showViewModal = ref(false)
const viewingRow = ref(null)

function openView(row) {
  viewingRow.value = row
  showViewModal.value = true
}

async function fetchData() {
  loading.value = true
  error.value = null
  try {
    const result = await fetchList({
      search: searchQuery.value,
      status: statusFilter.value,
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

function onFilterChange() {
  pagination.value.offset = 0
  fetchData()
}

onMounted(fetchData)
</script>
