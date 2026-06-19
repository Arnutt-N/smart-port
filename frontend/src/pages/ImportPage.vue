<template>
  <div class="p-6 space-y-6">
    <!-- Header -->
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-bold text-gray-800">นำเข้าข้อมูลบุคลากร</h1>
      <p class="text-sm text-gray-500">
        อัปโหลดไฟล์ Excel (.xlsx) เพื่อนำเข้าข้อมูลข้าราชการระดับบริหาร/อำนวยการ —
        กรอกตามเทมเพลตเพื่อความถูกต้อง
      </p>
    </header>

    <!-- Step 1: ดาวน์โหลดเทมเพลต -->
    <section class="bg-white rounded-xl border border-gray-200 p-5">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-sm font-semibold text-gray-700">1. ดาวน์โหลดเทมเพลต</h2>
          <p class="text-xs text-gray-500 mt-1">
            กรอกข้อมูลในไฟล์เทมเพลต (ชีต Personnel / Diverse / Equivalence / History) แล้วบันทึกเป็น .xlsx
          </p>
        </div>
        <a
          :href="templateUrl"
          download
          class="shrink-0 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <Download class="w-4 h-4" />
          ดาวน์โหลดเทมเพลต
        </a>
      </div>
    </section>

    <!-- Step 2: อัปโหลด -->
    <section class="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h2 class="text-sm font-semibold text-gray-700">2. อัปโหลดไฟล์</h2>

      <!-- Dropzone -->
      <div
        role="button"
        tabindex="0"
        :aria-label="file ? `ไฟล์ที่เลือก: ${file.name}` : 'เลือกหรือลากไฟล์ .xlsx มาวางที่นี่'"
        :aria-disabled="busy"
        class="border-2 border-dashed rounded-xl px-6 py-10 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        :class="[
          busy ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
          dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50',
        ]"
        @click="!busy && openPicker()"
        @keydown.enter.prevent="!busy && openPicker()"
        @keydown.space.prevent="!busy && openPicker()"
        @dragover.prevent="!busy && (dragging = true)"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <input
          ref="inputEl"
          type="file"
          accept=".xlsx"
          class="hidden"
          @change="onPick"
        />
        <FileSpreadsheet class="w-10 h-10 mx-auto text-gray-400" />
        <p v-if="file" class="mt-3 text-sm font-medium text-gray-700">{{ file.name }}</p>
        <p v-else class="mt-3 text-sm text-gray-600">
          ลากไฟล์มาวาง หรือ <span class="text-blue-600 font-medium">คลิกเพื่อเลือก</span>
        </p>
        <p class="mt-1 text-xs text-gray-400">รองรับ .xlsx ขนาดไม่เกิน 5MB</p>
      </div>

      <div class="flex items-center gap-3">
        <button
          :disabled="!file || busy"
          class="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          @click="submit"
        >
          <Loader2 v-if="busy" class="w-4 h-4 animate-spin" />
          <Upload v-else class="w-4 h-4" />
          {{ busy ? 'กำลังนำเข้า…' : 'นำเข้าข้อมูล' }}
        </button>
        <button
          v-if="file && !busy"
          class="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700"
          @click="reset"
        >
          ล้าง
        </button>
      </div>
    </section>

    <!-- Step 3: ผลลัพธ์ (aria-live เพื่อ screen reader) -->
    <section ref="resultEl" aria-live="polite" tabindex="-1" class="outline-none">
      <!-- สำเร็จ -->
      <div
        v-if="status === 'success' && summary"
        class="bg-white rounded-xl border border-green-200 p-5"
      >
        <div class="flex items-center gap-2 text-green-700">
          <CheckCircle2 class="w-5 h-5" />
          <h2 class="text-sm font-semibold">นำเข้าสำเร็จ</h2>
        </div>
        <dl class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div v-for="s in summaryItems" :key="s.key" class="bg-gray-50 rounded-lg p-3 text-center">
            <dt class="text-xs text-gray-500">{{ s.label }}</dt>
            <dd class="text-xl font-bold text-gray-800">{{ s.value }}</dd>
          </div>
        </dl>
        <div class="flex items-center gap-3 mt-5">
          <RouterLink
            to="/candidates"
            class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
          >
            ดูบัญชีรายชื่อ
            <ArrowRight class="w-4 h-4" />
          </RouterLink>
          <button class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700" @click="reset">
            นำเข้าไฟล์ใหม่
          </button>
        </div>
      </div>

      <!-- ผิดพลาด -->
      <div
        v-else-if="status === 'error'"
        class="bg-white rounded-xl border border-red-200 p-5"
      >
        <div class="flex items-center gap-2 text-red-700">
          <AlertCircle class="w-5 h-5" />
          <h2 class="text-sm font-semibold">นำเข้าไม่สำเร็จ ({{ errors.length }} รายการ)</h2>
        </div>
        <ul class="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
          <li
            v-for="(err, i) in errors"
            :key="i"
            class="text-sm text-red-600 bg-red-50 rounded px-3 py-1.5"
          >
            {{ err }}
          </li>
        </ul>
        <button class="mt-4 px-4 py-2 text-sm text-gray-500 hover:text-gray-700" @click="reset">
          ลองใหม่
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import {
  Download, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, ArrowRight,
} from 'lucide-vue-next'

const MAX_BYTES = 5 * 1024 * 1024
const API_BASE = import.meta.env.VITE_API_URL || '/api'
// cache-bust เทมเพลตเมื่อ deploy ใหม่ (อัปเดต query เมื่อแก้คอลัมน์)
const templateUrl = '/import-template.xlsx?v=2026-06-19'

const router = useRouter()
const auth = useAuthStore()

const inputEl = ref(null)
const resultEl = ref(null)
const file = ref(null)
const dragging = ref(false)
const status = ref('idle') // idle | uploading | success | error
const errors = ref([])
const summary = ref(null)

const busy = computed(() => status.value === 'uploading')

const summaryItems = computed(() => {
  const s = summary.value || {}
  return [
    { key: 'personnel', label: 'บุคลากร', value: s.personnel ?? 0 },
    { key: 'diverse', label: '3 ต่าง', value: s.diverse ?? 0 },
    { key: 'equivalence', label: 'เทียบตำแหน่ง', value: s.equivalence ?? 0 },
    { key: 'history', label: 'ประวัติ', value: s.history ?? 0 },
  ]
})

function openPicker() {
  inputEl.value?.click()
}

function onPick(e) {
  pick(e.target.files?.[0] ?? null)
  e.target.value = '' // เลือกไฟล์เดิมซ้ำได้
}

function onDrop(e) {
  dragging.value = false
  if (busy.value) return
  pick(e.dataTransfer?.files?.[0] ?? null)
}

function pick(f) {
  if (!f) return
  if (!f.name.toLowerCase().endsWith('.xlsx')) {
    showError(['รองรับเฉพาะไฟล์ .xlsx'])
    return
  }
  if (f.size > MAX_BYTES) {
    showError(['ไฟล์ใหญ่เกิน 5MB'])
    return
  }
  file.value = f
  status.value = 'idle'
  errors.value = []
  summary.value = null
}

async function submit() {
  if (!file.value || busy.value) return
  status.value = 'uploading'
  errors.value = []
  summary.value = null

  const form = new FormData()
  form.append('file', file.value)

  const headers = {}
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`

  let res
  try {
    res = await fetch(`${API_BASE}/import/executive`, { method: 'POST', body: form, headers })
  } catch {
    // network error / timeout — fetch ไม่ throw จาก HTTP status แต่ throw จาก network
    showError(['เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่'])
    return
  }

  if (res.status === 401) {
    auth.logout()
    router.push('/login')
    return
  }

  // กัน non-JSON (เช่น 413 จาก nginx เป็น HTML, 500/502)
  const body = await res.json().catch(() => ({ errors: [res.statusText || 'เกิดข้อผิดพลาด'] }))

  if (res.ok && body.success) {
    summary.value = body.summary || {}
    status.value = 'success'
  } else {
    showError(body.errors?.length ? body.errors : [body.error || 'นำเข้าไม่สำเร็จ'])
  }
  await focusResult()
}

function showError(list) {
  errors.value = list
  summary.value = null
  status.value = 'error'
  focusResult()
}

async function focusResult() {
  await nextTick()
  resultEl.value?.focus()
}

function reset() {
  file.value = null
  status.value = 'idle'
  errors.value = []
  summary.value = null
}
</script>
