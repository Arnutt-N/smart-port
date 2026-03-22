<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <!-- Breadcrumb -->
    <nav class="flex items-center gap-2 text-sm text-gray-500 mb-4">
      <Home class="w-4 h-4" />
      <span>/</span>
      <span>การเทียบตำแหน่ง</span>
    </nav>

    <!-- Page Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">การเทียบตำแหน่ง</h1>
        <p class="text-sm text-gray-500 mt-1">ยื่นคำขอเทียบตำแหน่งและติดตามสถานะอนุมัติ</p>
      </div>
      <button
        @click="openCreate"
        class="flex items-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors"
      >
        <Plus class="w-4 h-4" /> ยื่นคำขอใหม่
      </button>
    </div>

    <!-- Stat Cards -->
    <SkeletonLoader v-if="loading && rows.length === 0" type="stat-cards" />
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard
        label="คำขอทั้งหมด"
        :value="pagination.total"
        :icon="FileText"
        icon-bg-class="bg-blue-50"
        icon-class="text-blue-600"
      />
      <StatCard
        label="รออนุมัติ"
        :value="statusCounts.pending"
        :icon="Clock"
        icon-bg-class="bg-amber-50"
        icon-class="text-amber-600"
      />
      <StatCard
        label="อนุมัติแล้ว"
        :value="statusCounts.approved"
        :icon="CheckCircle"
        icon-bg-class="bg-green-50"
        icon-class="text-green-600"
      />
      <StatCard
        label="ไม่อนุมัติ"
        :value="statusCounts.rejected"
        :icon="XCircle"
        icon-bg-class="bg-red-50"
        icon-class="text-red-600"
      />
    </div>

    <!-- Search Bar -->
    <div class="flex items-center gap-3 mb-4">
      <div class="relative flex-1">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search class="w-4 h-4 text-gray-400" />
        </div>
        <input
          v-model="searchQuery"
          @input="onSearchInput"
          @compositionstart="isComposing = true"
          @compositionend="onCompositionEnd"
          type="text"
          placeholder="ค้นหาชื่อ หรือตำแหน่ง..."
          class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
    </div>

    <!-- Loading State -->
    <SkeletonLoader v-if="loading && rows.length === 0" type="table" :rows="5" />

    <!-- Error State -->
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

    <!-- Data Table -->
    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ลำดับ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ชื่อ-สกุล</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ตำแหน่งจริง</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">เทียบเป็น</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันที่ขอ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สถานะ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันที่อนุมัติ</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, index) in rows"
              :key="row.equivalenceId"
              class="border-b border-gray-100 hover:bg-gray-50"
            >
              <td class="px-6 py-3 text-sm text-gray-700">{{ pagination.offset + index + 1 }}</td>
              <td class="px-6 py-3 text-sm text-gray-900 font-medium">{{ row.fullName }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.actualPosition }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">{{ row.equivalentType }}</td>
              <td class="px-6 py-3 text-sm text-gray-700">
                <div>{{ row.requestStartDateThai }} - {{ row.requestEndDateThai }}</div>
                <div class="text-xs text-gray-400">{{ row.requestTotalDays }} วัน</div>
              </td>
              <td class="px-6 py-3 text-sm">
                <StatusBadge :status="row.approvalStatus" />
              </td>
              <td class="px-6 py-3 text-sm text-gray-700">
                <template v-if="row.approvalStatus === 'APPROVED'">
                  <div>{{ row.approvedStartDateThai }} - {{ row.approvedEndDateThai }}</div>
                  <div class="text-xs text-gray-400">{{ row.approvedTotalDays }} วัน</div>
                </template>
                <template v-else>-</template>
              </td>
              <td class="px-6 py-3 text-sm">
                <div class="flex items-center gap-1">
                  <!-- PENDING: edit + approve + reject buttons -->
                  <template v-if="row.approvalStatus === 'PENDING'">
                    <button @click="openEdit(row)" class="p-1 text-gray-400 hover:text-blue-600 transition-colors" title="แก้ไข">
                      <Pencil class="w-4 h-4" />
                    </button>
                    <button @click="openApprove(row)" class="p-1 text-gray-400 hover:text-green-600 transition-colors" title="อนุมัติ">
                      <Check class="w-4 h-4" />
                    </button>
                    <button @click="confirmReject(row.equivalenceId)" class="p-1 text-gray-400 hover:text-red-600 transition-colors" title="ไม่อนุมัติ">
                      <X class="w-4 h-4" />
                    </button>
                  </template>
                  <!-- APPROVED/REJECTED: view only -->
                  <template v-else>
                    <button @click="openView(row)" class="p-1 text-gray-400 hover:text-blue-600 transition-colors" title="ดูรายละเอียด">
                      <Eye class="w-4 h-4" />
                    </button>
                  </template>
                </div>
              </td>
            </tr>
            <tr v-if="rows.length === 0 && !loading">
              <td colspan="8">
                <EmptyState
                  title="ไม่พบข้อมูล"
                  description="ยังไม่มีคำขอเทียบตำแหน่ง หรือไม่พบข้อมูลที่ตรงกับการค้นหา"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Pagination -->
    <PaginationBar
      v-if="pagination.total > 0"
      :total="pagination.total"
      :limit="pagination.limit"
      :offset="pagination.offset"
      @update:offset="val => { pagination.offset = val; fetchData() }"
    />

    <!-- ==================== Create/Edit Modal ==================== -->
    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" @click="closeModal"></div>
        <div class="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
          <div class="px-6 py-4 border-b border-gray-200">
            <h2 class="text-lg font-semibold text-gray-900">
              {{ editingRecord ? 'แก้ไขคำขอ' : 'ยื่นคำขอเทียบตำแหน่ง' }}
            </h2>
          </div>
          <div class="px-6 py-4 space-y-4">
            <!-- Personnel autocomplete -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">บุคลากร <span class="text-red-500">*</span></label>
              <div class="relative">
                <input
                  v-model="personnelSearch"
                  @input="onPersonnelSearch"
                  :disabled="!!editingRecord"
                  type="text"
                  placeholder="พิมพ์ชื่อเพื่อค้นหา..."
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  :class="[
                    formErrors.personnel_id ? 'border-red-300' : 'border-gray-300',
                    editingRecord ? 'bg-gray-100 cursor-not-allowed' : ''
                  ]"
                />
                <div
                  v-if="showPersonnelDropdown && personnelResults.length > 0"
                  class="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
                >
                  <button
                    v-for="person in personnelResults"
                    :key="person.personnel_id"
                    @click="selectPersonnel(person)"
                    class="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors"
                  >
                    {{ person.full_name }}
                  </button>
                </div>
              </div>
              <p v-if="formErrors.personnel_id" class="text-xs text-red-500 mt-1">{{ formErrors.personnel_id }}</p>
            </div>

            <!-- actual_position -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">ตำแหน่งจริง <span class="text-red-500">*</span></label>
              <input
                v-model="formData.actual_position"
                type="text"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                :class="formErrors.actual_position ? 'border-red-300' : 'border-gray-300'"
              />
              <p v-if="formErrors.actual_position" class="text-xs text-red-500 mt-1">{{ formErrors.actual_position }}</p>
            </div>

            <!-- equivalent_type -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">เทียบเป็นตำแหน่ง <span class="text-red-500">*</span></label>
              <input
                v-model="formData.equivalent_type"
                type="text"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                :class="formErrors.equivalent_type ? 'border-red-300' : 'border-gray-300'"
              />
              <p v-if="formErrors.equivalent_type" class="text-xs text-red-500 mt-1">{{ formErrors.equivalent_type }}</p>
            </div>

            <!-- request_start_date -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">วันเริ่มต้น (คำขอ) <span class="text-red-500">*</span></label>
              <input
                v-model="formData.request_start_date"
                type="date"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                :class="formErrors.request_start_date ? 'border-red-300' : 'border-gray-300'"
              />
              <p v-if="formErrors.request_start_date" class="text-xs text-red-500 mt-1">{{ formErrors.request_start_date }}</p>
            </div>

            <!-- request_end_date -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">วันสิ้นสุด (คำขอ) <span class="text-red-500">*</span></label>
              <input
                v-model="formData.request_end_date"
                type="date"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                :class="formErrors.request_end_date ? 'border-red-300' : 'border-gray-300'"
              />
              <p v-if="formErrors.request_end_date" class="text-xs text-red-500 mt-1">{{ formErrors.request_end_date }}</p>
            </div>

            <!-- approval_order_ref -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">อ้างอิงคำสั่ง</label>
              <input
                v-model="formData.approval_order_ref"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              @click="closeModal"
              class="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              @click="handleSave"
              :disabled="saving"
              class="px-4 py-2 text-sm text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {{ saving ? 'กำลังบันทึก...' : 'บันทึก' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ==================== Approve Modal ==================== -->
    <Teleport to="body">
      <div v-if="showApproveModal" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" @click="showApproveModal = false"></div>
        <div class="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
          <div class="px-6 py-4 border-b border-gray-200">
            <h2 class="text-lg font-semibold text-gray-900">อนุมัติการเทียบตำแหน่ง</h2>
          </div>
          <div class="px-6 py-4 space-y-4">
            <!-- Summary of record -->
            <div class="bg-gray-50 rounded-lg p-3 space-y-1">
              <p class="text-sm"><span class="font-medium text-gray-700">ชื่อ-สกุล:</span> {{ approvingRecord?.fullName }}</p>
              <p class="text-sm"><span class="font-medium text-gray-700">ตำแหน่งจริง:</span> {{ approvingRecord?.actualPosition }}</p>
              <p class="text-sm"><span class="font-medium text-gray-700">เทียบเป็น:</span> {{ approvingRecord?.equivalentType }}</p>
            </div>

            <!-- approved_start_date -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">วันเริ่มต้นที่อนุมัติ <span class="text-red-500">*</span></label>
              <input
                v-model="approveForm.approved_start_date"
                type="date"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <!-- approved_end_date -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">วันสิ้นสุดที่อนุมัติ <span class="text-red-500">*</span></label>
              <input
                v-model="approveForm.approved_end_date"
                type="date"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              @click="showApproveModal = false"
              class="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              @click="handleApprove"
              :disabled="saving"
              class="px-4 py-2 text-sm text-white bg-green-500 rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
            >
              {{ saving ? 'กำลังดำเนินการ...' : 'อนุมัติ' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ==================== Reject Confirmation Dialog ==================== -->
    <Teleport to="body">
      <div v-if="showRejectConfirm" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" @click="showRejectConfirm = false"></div>
        <div class="relative bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
          <div class="px-6 py-4 border-b border-gray-200">
            <h2 class="text-lg font-semibold text-gray-900">ยืนยันการไม่อนุมัติ</h2>
          </div>
          <div class="px-6 py-4">
            <p class="text-sm text-gray-600">คุณต้องการไม่อนุมัติคำขอนี้หรือไม่?</p>
          </div>
          <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              @click="showRejectConfirm = false"
              class="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              @click="handleReject"
              :disabled="saving"
              class="px-4 py-2 text-sm text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {{ saving ? 'กำลังดำเนินการ...' : 'ยืนยัน' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ==================== View Modal ==================== -->
    <Teleport to="body">
      <div v-if="showViewModal" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" @click="showViewModal = false"></div>
        <div class="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
          <div class="px-6 py-4 border-b border-gray-200">
            <h2 class="text-lg font-semibold text-gray-900">รายละเอียดคำขอเทียบตำแหน่ง</h2>
          </div>
          <div class="px-6 py-4 space-y-3">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <p class="text-xs text-gray-500">ชื่อ-สกุล</p>
                <p class="text-sm font-medium text-gray-900">{{ viewingRecord?.fullName }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">สถานะ</p>
                <StatusBadge v-if="viewingRecord" :status="viewingRecord.approvalStatus" />
              </div>
              <div>
                <p class="text-xs text-gray-500">ตำแหน่งจริง</p>
                <p class="text-sm text-gray-900">{{ viewingRecord?.actualPosition }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">เทียบเป็นตำแหน่ง</p>
                <p class="text-sm text-gray-900">{{ viewingRecord?.equivalentType }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">วันที่ขอ (เริ่มต้น)</p>
                <p class="text-sm text-gray-900">{{ viewingRecord?.requestStartDateThai }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">วันที่ขอ (สิ้นสุด)</p>
                <p class="text-sm text-gray-900">{{ viewingRecord?.requestEndDateThai }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">จำนวนวัน (คำขอ)</p>
                <p class="text-sm text-gray-900">{{ viewingRecord?.requestTotalDays }} วัน</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">อ้างอิงคำสั่ง</p>
                <p class="text-sm text-gray-900">{{ viewingRecord?.approvalOrderRef || '-' }}</p>
              </div>
            </div>

            <!-- Approval info (only if APPROVED) -->
            <template v-if="viewingRecord?.approvalStatus === 'APPROVED'">
              <hr class="border-gray-200" />
              <h3 class="text-sm font-semibold text-gray-700">ข้อมูลการอนุมัติ</h3>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <p class="text-xs text-gray-500">วันเริ่มต้นที่อนุมัติ</p>
                  <p class="text-sm text-gray-900">{{ viewingRecord?.approvedStartDateThai }}</p>
                </div>
                <div>
                  <p class="text-xs text-gray-500">วันสิ้นสุดที่อนุมัติ</p>
                  <p class="text-sm text-gray-900">{{ viewingRecord?.approvedEndDateThai }}</p>
                </div>
                <div>
                  <p class="text-xs text-gray-500">จำนวนวัน (อนุมัติ)</p>
                  <p class="text-sm text-gray-900">{{ viewingRecord?.approvedTotalDays }} วัน</p>
                </div>
                <div>
                  <p class="text-xs text-gray-500">อนุมัติโดย</p>
                  <p class="text-sm text-gray-900">{{ viewingRecord?.approvedByName || '-' }}</p>
                </div>
              </div>
            </template>
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
import { ref, computed, onMounted } from 'vue'
import { useEquivalence } from '@/composables/useEquivalence.js'
import { useApi } from '@/composables/useApi.js'
import { useUiStore } from '@/stores/ui.js'
import StatCard from '@/components/StatCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/EmptyState.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import {
  Home, Plus, Search, FileText, Clock, CheckCircle, XCircle,
  AlertCircle, Eye, Pencil, Check, X
} from 'lucide-vue-next'

const { fetchList, create, update, approve, reject } = useEquivalence()
const api = useApi()
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
const showModal = ref(false)
const editingRecord = ref(null)
const saving = ref(false)
const formErrors = ref({})

const defaultFormData = () => ({
  personnel_id: null,
  actual_position: '',
  equivalent_type: '',
  request_start_date: '',
  request_end_date: '',
  approval_order_ref: '',
})
const formData = ref(defaultFormData())

// Personnel autocomplete
const personnelSearch = ref('')
const personnelResults = ref([])
const showPersonnelDropdown = ref(false)
let personnelTimeout = null

// Approve modal state
const showApproveModal = ref(false)
const approvingRecord = ref(null)
const approveForm = ref({ approved_start_date: '', approved_end_date: '' })

// Reject dialog state
const showRejectConfirm = ref(false)
const rejectingId = ref(null)

// View modal state
const showViewModal = ref(false)
const viewingRecord = ref(null)

// Computed status counts from current rows
const statusCounts = computed(() => {
  const pending = rows.value.filter(r => r.approvalStatus === 'PENDING').length
  const approved = rows.value.filter(r => r.approvalStatus === 'APPROVED').length
  const rejected = rows.value.filter(r => r.approvalStatus === 'REJECTED').length
  return { pending, approved, rejected }
})

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

// ==================== Personnel autocomplete ====================

function onPersonnelSearch() {
  clearTimeout(personnelTimeout)
  if (!personnelSearch.value || personnelSearch.value.length < 2) {
    personnelResults.value = []
    showPersonnelDropdown.value = false
    return
  }
  personnelTimeout = setTimeout(async () => {
    try {
      const result = await api.get(`/civil-servants?search=${encodeURIComponent(personnelSearch.value)}&limit=10`)
      personnelResults.value = result.data || result || []
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
  showPersonnelDropdown.value = false
  formErrors.value.personnel_id = ''
}

// ==================== Create/Edit modal ====================

function openCreate() {
  editingRecord.value = null
  formData.value = defaultFormData()
  formErrors.value = {}
  personnelSearch.value = ''
  personnelResults.value = []
  showPersonnelDropdown.value = false
  showModal.value = true
}

function openEdit(record) {
  editingRecord.value = record
  formData.value = {
    personnel_id: record.personnelId,
    actual_position: record.actualPosition,
    equivalent_type: record.equivalentType,
    request_start_date: record.requestStartDate,
    request_end_date: record.requestEndDate,
    approval_order_ref: record.approvalOrderRef || '',
  }
  formErrors.value = {}
  personnelSearch.value = record.fullName
  showPersonnelDropdown.value = false
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingRecord.value = null
}

function validateForm() {
  const errors = {}
  if (!formData.value.personnel_id) errors.personnel_id = 'กรุณาเลือกบุคลากร'
  if (!formData.value.actual_position) errors.actual_position = 'กรุณากรอกตำแหน่งจริง'
  if (!formData.value.equivalent_type) errors.equivalent_type = 'กรุณากรอกตำแหน่งที่เทียบ'
  if (!formData.value.request_start_date) errors.request_start_date = 'กรุณาเลือกวันเริ่มต้น'
  if (!formData.value.request_end_date) errors.request_end_date = 'กรุณาเลือกวันสิ้นสุด'
  formErrors.value = errors
  return Object.keys(errors).length === 0
}

async function handleSave() {
  if (!validateForm()) return
  saving.value = true
  try {
    if (editingRecord.value) {
      await update(editingRecord.value.equivalenceId, formData.value)
      ui.showToast('อัปเดตสำเร็จ', 'success')
    } else {
      await create(formData.value)
      ui.showToast('ยื่นคำขอสำเร็จ', 'success')
    }
    closeModal()
    await fetchData()
  } catch (err) {
    ui.showToast(err.message || 'เกิดข้อผิดพลาด', 'error')
  } finally {
    saving.value = false
  }
}

// ==================== Approve ====================

function openApprove(record) {
  approvingRecord.value = record
  approveForm.value = {
    approved_start_date: record.requestStartDate || '',
    approved_end_date: record.requestEndDate || '',
  }
  showApproveModal.value = true
}

async function handleApprove() {
  if (!approveForm.value.approved_start_date || !approveForm.value.approved_end_date) {
    ui.showToast('กรุณาเลือกวันที่อนุมัติ', 'error')
    return
  }
  saving.value = true
  try {
    await approve(approvingRecord.value.equivalenceId, {
      approvedStartDate: approveForm.value.approved_start_date,
      approvedEndDate: approveForm.value.approved_end_date,
    })
    ui.showToast('อนุมัติสำเร็จ', 'success')
    showApproveModal.value = false
    approvingRecord.value = null
    await fetchData()
  } catch (err) {
    ui.showToast(err.message || 'เกิดข้อผิดพลาด', 'error')
  } finally {
    saving.value = false
  }
}

// ==================== Reject ====================

function confirmReject(id) {
  rejectingId.value = id
  showRejectConfirm.value = true
}

async function handleReject() {
  saving.value = true
  try {
    await reject(rejectingId.value)
    ui.showToast('ดำเนินการสำเร็จ', 'success')
    showRejectConfirm.value = false
    rejectingId.value = null
    await fetchData()
  } catch (err) {
    ui.showToast(err.message || 'เกิดข้อผิดพลาด', 'error')
  } finally {
    saving.value = false
  }
}

// ==================== View ====================

function openView(record) {
  viewingRecord.value = record
  showViewModal.value = true
}

// ==================== Init ====================

onMounted(() => {
  fetchData()
})
</script>
