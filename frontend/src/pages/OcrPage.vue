<template>
  <div class="p-6 space-y-6">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-bold text-gray-800">แปลงเอกสาร PDF</h1>
      <p class="text-sm text-gray-500">
        อัปโหลดไฟล์ PDF เพื่อแปลงเป็น Markdown — รองรับเอกสารภาษาไทย
      </p>
    </header>

    <!-- Upload -->
    <section class="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div
        role="button"
        tabindex="0"
        :aria-label="file ? `ไฟล์ที่เลือก: ${file.name}` : 'เลือกหรือลากไฟล์ PDF มาวางที่นี่'"
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
          accept=".pdf"
          class="hidden"
          @change="onPick"
        />
        <FileText class="w-10 h-10 mx-auto text-gray-400" />
        <p v-if="file" class="mt-3 text-sm font-medium text-gray-700">{{ file.name }}</p>
        <p v-else class="mt-3 text-sm text-gray-600">
          ลากไฟล์มาวาง หรือ <span class="text-blue-600 font-medium">คลิกเพื่อเลือก</span>
        </p>
        <p class="mt-1 text-xs text-gray-400">รองรับ .pdf ขนาดไม่เกิน 50MB</p>
      </div>

      <div class="flex items-center gap-3">
        <button
          :disabled="!file || busy"
          class="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          @click="submit"
        >
          <Loader2 v-if="busy" class="w-4 h-4 animate-spin" />
          <Upload v-else class="w-4 h-4" />
          {{ busy ? 'กำลังแปลง…' : 'แปลงเอกสาร' }}
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

    <!-- Result -->
    <section ref="resultEl" aria-live="polite" tabindex="-1" class="outline-none">
      <div
        v-if="status === 'success' && result"
        class="bg-white rounded-xl border border-green-200 p-5 space-y-4"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-green-700">
            <CheckCircle2 class="w-5 h-5" />
            <h2 class="text-sm font-semibold">แปลงสำเร็จ</h2>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-400">
              {{ result.meta?.pages ?? '?' }} หน้า · {{ engineLabel }}
            </span>
            <button
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
              :class="copyError ? 'text-red-700 bg-red-50 hover:bg-red-100' : 'text-blue-700 bg-blue-50 hover:bg-blue-100'"
              @click="copyMarkdown"
            >
              <Copy class="w-3.5 h-3.5" />
              {{ copyError ? 'คัดลอกไม่สำเร็จ' : (copied ? 'คัดลอกแล้ว' : 'คัดลอก') }}
            </button>
            <button
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              @click="downloadMarkdown"
            >
              <Download class="w-3.5 h-3.5" />
              ดาวน์โหลด
            </button>
          </div>
        </div>

        <div class="flex gap-1 border-b border-gray-200">
          <button
            class="px-3 py-1.5 text-xs font-medium border-b-2 transition-colors"
            :class="tab === 'preview' ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'"
            @click="tab = 'preview'"
          >
            Preview
          </button>
          <button
            class="px-3 py-1.5 text-xs font-medium border-b-2 transition-colors"
            :class="tab === 'raw' ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'"
            @click="tab = 'raw'"
          >
            Markdown
          </button>
        </div>

        <!-- Preview เป็น plain text (ไม่ใช้ v-html) — กัน XSS จากเนื้อหา OCR -->
        <pre
          v-if="tab === 'preview'"
          class="prose prose-sm max-w-none max-h-[600px] overflow-y-auto p-4 bg-gray-50 rounded-lg text-sm text-gray-800 whitespace-pre-wrap break-words"
        >{{ previewText }}</pre>
        <pre
          v-if="tab === 'raw'"
          class="max-h-[600px] overflow-y-auto p-4 bg-gray-50 rounded-lg text-xs text-gray-800 whitespace-pre-wrap break-words"
        >{{ result.markdown }}</pre>
      </div>

      <div
        v-else-if="status === 'error'"
        class="bg-white rounded-xl border border-red-200 p-5"
      >
        <div class="flex items-center gap-2 text-red-700">
          <AlertCircle class="w-5 h-5" />
          <h2 class="text-sm font-semibold">แปลงไม่สำเร็จ</h2>
        </div>
        <p class="mt-3 text-sm text-red-600 bg-red-50 rounded px-3 py-2">{{ errorMsg }}</p>
        <button class="mt-4 px-4 py-2 text-sm text-gray-500 hover:text-gray-700" @click="retry">
          ลองใหม่
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'
import { useApi } from '@/composables/useApi.js'
import {
  Upload, FileText, Loader2, CheckCircle2, AlertCircle, Copy, Download,
} from 'lucide-vue-next'

const MAX_BYTES = 50 * 1024 * 1024

const api = useApi()

const inputEl = ref(null)
const resultEl = ref(null)
const file = ref(null)
const dragging = ref(false)
const status = ref('idle')
const errorMsg = ref('')
const result = ref(null)
const tab = ref('preview')
const copied = ref(false)
const copyError = ref(false)
let copiedTimer = null
let copyErrorTimer = null

function clearFeedbackTimers() {
  if (copiedTimer != null) {
    clearTimeout(copiedTimer)
    copiedTimer = null
  }
  if (copyErrorTimer != null) {
    clearTimeout(copyErrorTimer)
    copyErrorTimer = null
  }
}

onBeforeUnmount(clearFeedbackTimers)

const busy = computed(() => status.value === 'uploading')

const engineLabel = computed(() => {
  const e = result.value?.engine
  if (e === 'docling') return 'Docling'
  if (e === 'pypdfium2_textlayer') return 'Text Layer'
  if (e === 'rapidocr') return 'RapidOCR'
  return e || ''
})

/** Preview ที่อ่านง่ายขึ้นเล็กน้อย โดยไม่สร้าง HTML */
const previewText = computed(() => {
  const md = result.value?.markdown || ''
  return md
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
})

function openPicker() {
  inputEl.value?.click()
}

function onPick(e) {
  pick(e.target.files?.[0] ?? null)
  e.target.value = ''
}

function onDrop(e) {
  dragging.value = false
  if (busy.value) return
  pick(e.dataTransfer?.files?.[0] ?? null)
}

function pick(f) {
  if (!f) return
  if (!f.name.toLowerCase().endsWith('.pdf')) {
    showError('รองรับเฉพาะไฟล์ PDF')
    return
  }
  if (f.size > MAX_BYTES) {
    showError('ไฟล์ใหญ่เกิน 50MB')
    return
  }
  file.value = f
  status.value = 'idle'
  errorMsg.value = ''
  result.value = null
}

async function submit() {
  if (!file.value || busy.value) return
  status.value = 'uploading'
  errorMsg.value = ''
  result.value = null
  copied.value = false

  const form = new FormData()
  form.append('file', file.value)

  let res
  try {
    res = await api.uploadResponse('/ocr/convert', form)
  } catch {
    showError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่')
    return
  }

  const body = await res.json().catch(() => ({ error: res.statusText || 'เกิดข้อผิดพลาด' }))

  if (res.ok && body && typeof body.markdown === 'string') {
    result.value = body
    tab.value = 'preview'
    status.value = 'success'
  } else {
    showError(body?.error || 'แปลงเอกสารไม่สำเร็จ')
  }
  await focusResult()
}

async function copyMarkdown() {
  clearFeedbackTimers()
  copied.value = false
  copyError.value = false
  try {
    await navigator.clipboard.writeText(result.value?.markdown || '')
    copied.value = true
    copiedTimer = setTimeout(() => {
      copiedTimer = null
      copied.value = false
    }, 2000)
  } catch {
    copyError.value = true
    copyErrorTimer = setTimeout(() => {
      copyErrorTimer = null
      copyError.value = false
    }, 2500)
  }
}

function downloadMarkdown() {
  const name = (file.value?.name || 'document').replace(/\.pdf$/i, '') + '.md'
  const blob = new Blob([result.value?.markdown || ''], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function showError(msg) {
  errorMsg.value = msg
  result.value = null
  status.value = 'error'
  focusResult()
}

async function focusResult() {
  await nextTick()
  resultEl.value?.focus()
}

function reset() {
  clearFeedbackTimers()
  file.value = null
  status.value = 'idle'
  errorMsg.value = ''
  result.value = null
  copied.value = false
  copyError.value = false
}

function retry() {
  status.value = 'idle'
  errorMsg.value = ''
  result.value = null
  copied.value = false
  copyError.value = false
}
</script>
