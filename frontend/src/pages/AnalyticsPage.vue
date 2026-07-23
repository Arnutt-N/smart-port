<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">การวิเคราะห์ข้อมูล</h1>
        <p class="text-sm text-gray-500 mt-1">ภาพรวมเชิงสถิติของข้อมูลบุคลากรและผลงาน</p>
      </div>
      <button @click="fetchData" class="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
        <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
        <span>รีเฟรช</span>
      </button>
    </div>

    <SkeletonLoader v-if="loading && !loaded" type="stat-cards" />

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

    <template v-else>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="บุคลากรทั้งหมด" :value="totals.personnel.toLocaleString()" :icon="Users" icon-bg-class="bg-blue-50" icon-class="text-blue-600" />
        <StatCard label="ข้าราชการ" :value="totals.civilServants.toLocaleString()" :icon="UserCheck" icon-bg-class="bg-green-50" icon-class="text-green-600" />
        <StatCard label="รางวัล" :value="totals.awards.toLocaleString()" :icon="Award" icon-bg-class="bg-yellow-50" icon-class="text-yellow-600" />
        <StatCard label="เครื่องราชอิสริยาภรณ์" :value="totals.decorations.toLocaleString()" :icon="Medal" icon-bg-class="bg-purple-50" icon-class="text-purple-600" />
        <StatCard label="ผลงานและข้อเสนอ" :value="totals.workResults.toLocaleString()" :icon="FileText" icon-bg-class="bg-indigo-50" icon-class="text-indigo-600" />
        <StatCard label="เกษียณภายใน 12 เดือน" :value="totals.retirementUpcoming.toLocaleString()" :icon="CalendarClock" icon-bg-class="bg-orange-50" icon-class="text-orange-600" />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DistributionCard title="ผลงานตามสถานะ" :items="proposalsByStatus" bar-class="bg-indigo-500" />
        <DistributionCard title="รางวัลตามประเภท" :items="awardsByType" bar-class="bg-yellow-500" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, h } from 'vue'
import { useAnalytics } from '@/composables/useAnalytics.js'
import StatCard from '@/components/StatCard.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { Users, UserCheck, Award, Medal, FileText, CalendarClock, RefreshCw, AlertCircle } from 'lucide-vue-next'

// Inline distribution bar card — CSS bars, no chart library.
const DistributionCard = {
  props: { title: String, items: Array, barClass: { type: String, default: 'bg-blue-500' } },
  setup(props) {
    const max = computed(() => Math.max(1, ...props.items.map(i => i.count)))
    return () => h('div', { class: 'bg-white rounded-lg shadow-sm border border-gray-200 p-6' }, [
      h('h3', { class: 'text-lg font-semibold text-gray-900 mb-4' }, props.title),
      props.items.length === 0
        ? h('p', { class: 'text-sm text-gray-400 py-4 text-center' }, 'ไม่มีข้อมูล')
        : h('div', { class: 'space-y-3' }, props.items.map(item =>
            h('div', { key: item.label }, [
              h('div', { class: 'flex justify-between text-sm mb-1' }, [
                h('span', { class: 'text-gray-700' }, item.label),
                h('span', { class: 'font-medium text-gray-900 tabular-nums' }, item.count.toLocaleString()),
              ]),
              h('div', { class: 'h-2 bg-gray-100 rounded-full overflow-hidden' }, [
                h('div', {
                  class: `h-full rounded-full ${props.barClass}`,
                  style: { width: `${Math.round((item.count / max.value) * 100)}%` },
                }),
              ]),
            ]),
          )),
    ])
  },
}

const { fetchSummary } = useAnalytics()

const loading = ref(false)
const loaded = ref(false)
const error = ref(null)
const totals = ref({ personnel: 0, civilServants: 0, awards: 0, decorations: 0, workResults: 0, retirementUpcoming: 0 })
const proposalsByStatus = ref([])
const awardsByType = ref([])

async function fetchData() {
  loading.value = true
  error.value = null
  try {
    const result = await fetchSummary()
    totals.value = result.data.totals
    proposalsByStatus.value = result.data.proposalsByStatus
    awardsByType.value = result.data.awardsByType
    loaded.value = true
  } catch (err) {
    error.value = err.message || 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง'
  } finally {
    loading.value = false
  }
}

onMounted(fetchData)
</script>
