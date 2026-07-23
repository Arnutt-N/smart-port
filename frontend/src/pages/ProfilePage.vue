<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <div class="mb-2">
      <h1 class="text-2xl font-bold text-gray-900">{{ isDetail ? 'โปรไฟล์ข้าราชการ' : 'โปรไฟล์ของฉัน' }}</h1>
      <p class="text-sm text-gray-500 mt-1">
        {{ isDetail ? 'ข้อมูลประวัติข้าราชการ' : 'ข้อมูลบัญชีผู้ใช้งานของคุณ' }}
      </p>
    </div>

    <SkeletonLoader v-if="loading" type="card" />

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

    <!-- Account (my profile) -->
    <div v-else-if="!isDetail && account" class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 max-w-2xl">
      <div class="flex items-center gap-4 mb-6">
        <div class="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
          <User class="w-8 h-8 text-blue-600" />
        </div>
        <div>
          <p class="text-lg font-semibold text-gray-900">{{ account.fullName }}</p>
          <p class="text-sm text-gray-500">{{ account.username }}</p>
        </div>
      </div>
      <dl class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <dt class="text-xs text-gray-500">อีเมล</dt>
          <dd class="text-sm text-gray-900">{{ account.email || '-' }}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-500">สิทธิ์</dt>
          <dd class="text-sm text-gray-900">{{ account.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ปฏิบัติงาน' }}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-500">สถานะ</dt>
          <dd class="text-sm text-gray-900">{{ account.isActive ? 'ใช้งาน' : 'ปิดใช้งาน' }}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-500">เข้าใช้ล่าสุด</dt>
          <dd class="text-sm text-gray-900">{{ formatDateTime(account.lastLoginAt) }}</dd>
        </div>
      </dl>
    </div>

    <!-- Servant detail -->
    <div v-else-if="isDetail && servant" class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 max-w-2xl">
      <div class="flex items-center gap-4 mb-6">
        <img
          v-if="servant.photoPath"
          :src="servant.photoPath"
          alt="รูปข้าราชการ"
          class="w-20 h-20 rounded-lg object-cover border border-gray-200"
        />
        <div v-else class="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center">
          <User class="w-10 h-10 text-gray-400" />
        </div>
        <div>
          <p class="text-lg font-semibold text-gray-900">{{ servant.fullName }}</p>
          <p class="text-sm text-gray-500">รหัสพนักงาน: {{ servant.employeeId }}</p>
        </div>
      </div>
      <dl class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <dt class="text-xs text-gray-500">วันเกิด</dt>
          <dd class="text-sm text-gray-900">{{ servant.birthDate || '-' }}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-500">วันบรรจุ</dt>
          <dd class="text-sm text-gray-900">{{ servant.appointmentDate || '-' }}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-500">วันเกษียณ</dt>
          <dd class="text-sm text-gray-900">{{ servant.retirementDate || '-' }}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-500">สถานะ</dt>
          <dd class="text-sm text-gray-900">{{ servant.servantStatus || '-' }}</dd>
        </div>
      </dl>
    </div>

    <EmptyState
      v-else
      :icon="User"
      title="ไม่พบข้อมูล"
      description="ไม่พบข้อมูลโปรไฟล์ที่ต้องการ"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useProfile } from '@/composables/useProfile.js'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { User, AlertCircle } from 'lucide-vue-next'

const route = useRoute()
const { fetchMe, fetchById } = useProfile()

const loading = ref(false)
const error = ref(null)
const account = ref(null)
const servant = ref(null)

const isDetail = computed(() => !!route.params.id)

async function fetchData() {
  loading.value = true
  error.value = null
  account.value = null
  servant.value = null
  try {
    if (isDetail.value) {
      const result = await fetchById(route.params.id)
      servant.value = result.data
    } else {
      const result = await fetchMe()
      account.value = result.data
    }
  } catch (err) {
    error.value = err.message || 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง'
  } finally {
    loading.value = false
  }
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value.replace(' ', 'T'))
  if (isNaN(date.getTime())) return '-'
  return date.toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

watch(() => route.params.id, fetchData)
onMounted(fetchData)
</script>
