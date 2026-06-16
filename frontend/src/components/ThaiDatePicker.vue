<script setup>
// ThaiDatePicker — drop-in แทน <input type="date">
// แสดง/รับวันที่เป็น พ.ศ. (พิมพ์เอง วว/ดด/ปปปป + ปฏิทินไทย + decade grid)
// v-model in/out = 'Y-m-d' (ค.ศ.) เหมือน native date input ทุกประการ
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Calendar, ChevronLeft, ChevronRight, X, Check } from 'lucide-vue-next'
import {
  toBE, toCE, daysInMonth, thaiDow, toYMD, ymdToDate,
  partsFromYMD, formatThaiShort, parseParts,
  THAI_MONTHS_LONG, THAI_WEEKDAYS_SHORT,
} from '@/utils/thaiDate.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  error: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

// --- ช่องพิมพ์ วว/ดด/ปปปป(พ.ศ.) ---
const day = ref('')
const month = ref('')
const year = ref('')
const localError = ref('')
const localWarning = ref('')
const isEditing = ref(false)

const dayRef = ref(null)
const monthRef = ref(null)
const yearRef = ref(null)
const rootRef = ref(null)

function syncFromModel() {
  const parts = partsFromYMD(props.modelValue)
  day.value = parts.day
  month.value = parts.month
  year.value = parts.beYear
}
// sync ช่องจาก modelValue เฉพาะตอนผู้ใช้ไม่ได้กำลังพิมพ์ (กัน loop)
watch(() => props.modelValue, () => {
  if (!isEditing.value) syncFromModel()
}, { immediate: true })

const hasValue = computed(() => !!ymdToDate(props.modelValue))
const displayError = computed(() => props.error || localError.value)

function focusAndSelect(el) {
  nextTick(() => { el.value?.focus(); el.value?.select?.() })
}

// digit-only sanitize + auto-advance + commit เมื่อปีครบ
function onInput(field, e) {
  isEditing.value = true
  if (isOpen.value) isOpen.value = false
  const max = field === 'year' ? 4 : 2
  const clean = (e.target.value || '').replace(/\D/g, '').slice(0, max)
  if (field === 'day') {
    day.value = clean
    if (clean.length === 2) focusAndSelect(monthRef)
  } else if (field === 'month') {
    month.value = clean
    if (clean.length === 2) focusAndSelect(yearRef)
  } else {
    year.value = clean
  }
  if (field === 'year' && clean.length === 4 && day.value && month.value) {
    commit()
  }
}

function commit() {
  const res = parseParts(day.value, month.value, year.value)
  localWarning.value = res.warning || ''
  if (res.ok) {
    localError.value = ''
    if (res.ymd !== props.modelValue) emit('update:modelValue', res.ymd)
    isEditing.value = false
  } else {
    localError.value = res.error || ''
  }
}

function onBlur() {
  // commit เมื่อ focus ออกจาก component ทั้งก้อน
  setTimeout(() => {
    if (!rootRef.value || rootRef.value.contains(document.activeElement)) return
    isEditing.value = false
    const allEmpty = !day.value && !month.value && !year.value
    if (allEmpty) {
      localError.value = ''
      localWarning.value = ''
      if (props.modelValue) emit('update:modelValue', '')
    } else {
      commit()
    }
  }, 120)
}

function clearValue() {
  day.value = ''
  month.value = ''
  year.value = ''
  localError.value = ''
  localWarning.value = ''
  isEditing.value = false
  emit('update:modelValue', '')
}

// --- ปฏิทิน popup ---
const isOpen = ref(false)
const calendarView = ref('date') // 'date' | 'year'
const viewMonth = ref(firstOfThisMonth())
const yearGridStart = ref(0) // พ.ศ.

function firstOfThisMonth() {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), 1)
}

function openCalendar() {
  if (props.disabled) return
  const d = ymdToDate(props.modelValue)
  viewMonth.value = d ? new Date(d.getFullYear(), d.getMonth(), 1) : firstOfThisMonth()
  calendarView.value = 'date'
  isOpen.value = !isOpen.value
}

const viewMonthLabel = computed(() => THAI_MONTHS_LONG[viewMonth.value.getMonth()])
const viewYearBE = computed(() => toBE(viewMonth.value.getFullYear()))

function shiftMonth(delta) {
  const d = new Date(viewMonth.value)
  d.setMonth(d.getMonth() + delta)
  viewMonth.value = d
}

const dayCells = computed(() => {
  const y = viewMonth.value.getFullYear()
  const m = viewMonth.value.getMonth()
  const firstDow = thaiDow(new Date(y, m, 1))
  const count = daysInMonth(y, m + 1)
  const selected = ymdToDate(props.modelValue)
  const today = new Date()
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push({ key: `pad-${i}`, pad: true })
  for (let d = 1; d <= count; d++) {
    const isSel = selected && selected.getFullYear() === y && selected.getMonth() === m && selected.getDate() === d
    const isToday = today.getFullYear() === y && today.getMonth() === m && today.getDate() === d
    cells.push({ key: `d-${d}`, day: d, isSel, isToday })
  }
  return cells
})

function pickDay(d) {
  const picked = new Date(viewMonth.value.getFullYear(), viewMonth.value.getMonth(), d)
  isEditing.value = false
  localError.value = ''
  localWarning.value = ''
  emit('update:modelValue', toYMD(picked))
  isOpen.value = false
}

function openYearView() {
  const beNow = viewYearBE.value
  yearGridStart.value = beNow - (beNow % 12)
  calendarView.value = 'year'
}

function shiftDecade(delta) {
  yearGridStart.value += delta
}

const yearCells = computed(() => {
  const selected = ymdToDate(props.modelValue)
  const selBE = selected ? toBE(selected.getFullYear()) : null
  const cells = []
  for (let i = 0; i < 12; i++) {
    const be = yearGridStart.value + i
    cells.push({ be, isSel: selBE === be, isCurrent: viewYearBE.value === be })
  }
  return cells
})

function pickYear(be) {
  // normalize เป็นวันที่ 1 กัน month overflow (เช่นเปลี่ยนปีตอน viewMonth ชี้วันสิ้นเดือน)
  viewMonth.value = new Date(toCE(be), viewMonth.value.getMonth(), 1)
  calendarView.value = 'date'
}

function pickToday() {
  const t = new Date()
  isEditing.value = false
  localError.value = ''
  localWarning.value = ''
  emit('update:modelValue', toYMD(new Date(t.getFullYear(), t.getMonth(), t.getDate())))
  isOpen.value = false
}

const todayLabel = computed(() => formatThaiShort(toYMD(new Date())))

function closePopup() {
  isOpen.value = false
  calendarView.value = 'date'
}
function onDocPointer(e) {
  if (isOpen.value && rootRef.value && !rootRef.value.contains(e.target)) closePopup()
}
function onDocKeydown(e) {
  if (e.key === 'Escape' && isOpen.value) closePopup()
}
onMounted(() => {
  document.addEventListener('mousedown', onDocPointer)
  document.addEventListener('keydown', onDocKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocPointer)
  document.removeEventListener('keydown', onDocKeydown)
})
</script>

<template>
  <div ref="rootRef" class="relative w-full">
    <div
      class="flex items-center gap-1 w-full px-2 py-2 border rounded-lg text-sm bg-white transition-colors focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500"
      :class="displayError ? 'border-red-300' : 'border-gray-300'"
    >
      <input
        ref="dayRef" :value="day" type="text" inputmode="numeric" maxlength="2"
        placeholder="วว" aria-label="วัน" :disabled="disabled"
        class="w-9 text-center bg-transparent outline-none placeholder:text-gray-300 disabled:opacity-50"
        @input="onInput('day', $event)" @blur="onBlur" @focus="isEditing = true"
      />
      <span class="text-gray-300 select-none" aria-hidden="true">/</span>
      <input
        ref="monthRef" :value="month" type="text" inputmode="numeric" maxlength="2"
        placeholder="ดด" aria-label="เดือน" :disabled="disabled"
        class="w-9 text-center bg-transparent outline-none placeholder:text-gray-300 disabled:opacity-50"
        @input="onInput('month', $event)" @blur="onBlur" @focus="isEditing = true"
      />
      <span class="text-gray-300 select-none" aria-hidden="true">/</span>
      <input
        ref="yearRef" :value="year" type="text" inputmode="numeric" maxlength="4"
        placeholder="ปปปป" aria-label="ปี พ.ศ." :disabled="disabled"
        class="flex-1 min-w-[3rem] text-center bg-transparent outline-none placeholder:text-gray-300 disabled:opacity-50"
        @input="onInput('year', $event)" @blur="onBlur" @focus="isEditing = true"
      />
      <div class="flex items-center gap-0.5 shrink-0">
        <Check v-if="hasValue && !isEditing && !localError" class="w-4 h-4 text-emerald-500" aria-hidden="true" />
        <button
          v-if="hasValue" type="button" :disabled="disabled" aria-label="ล้างวันที่"
          class="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
          @click="clearValue"
        >
          <X class="w-4 h-4" />
        </button>
        <button
          type="button" :disabled="disabled" aria-haspopup="dialog" :aria-expanded="isOpen"
          aria-label="เปิดปฏิทินเลือกวันที่"
          class="p-1 rounded transition-colors disabled:opacity-50"
          :class="isOpen ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'"
          @click="openCalendar"
        >
          <Calendar class="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>

    <p v-if="localWarning && !displayError" class="text-xs text-amber-600 mt-1">{{ localWarning }}</p>
    <p v-if="displayError" class="text-xs text-red-500 mt-1">{{ displayError }}</p>

    <Transition name="tdp-pop">
      <div
        v-if="isOpen" role="dialog" aria-modal="true" aria-label="ปฏิทิน พ.ศ."
        class="absolute z-50 mt-2 right-0 w-[320px] max-w-[calc(100vw-2rem)] bg-white rounded-xl border border-gray-200 shadow-lg p-3"
      >
        <div class="flex items-center justify-between mb-3">
          <button
            type="button" class="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            :aria-label="calendarView === 'date' ? 'เดือนก่อนหน้า' : 'ช่วงปีก่อนหน้า'"
            @click="calendarView === 'date' ? shiftMonth(-1) : shiftDecade(-12)"
          >
            <ChevronLeft class="w-[18px] h-[18px] text-gray-600" />
          </button>
          <button
            v-if="calendarView === 'date'" type="button" aria-label="เลือกปี"
            class="flex-1 mx-1 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors font-semibold text-gray-900"
            @click="openYearView"
          >
            {{ viewMonthLabel }} <span class="text-blue-600">{{ viewYearBE }}</span>
          </button>
          <button
            v-else type="button" aria-label="กลับมุมมองวัน"
            class="flex-1 mx-1 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors font-semibold text-gray-900"
            @click="calendarView = 'date'"
          >
            {{ yearGridStart }} – {{ yearGridStart + 11 }}
          </button>
          <button
            type="button" class="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            :aria-label="calendarView === 'date' ? 'เดือนถัดไป' : 'ช่วงปีถัดไป'"
            @click="calendarView === 'date' ? shiftMonth(1) : shiftDecade(12)"
          >
            <ChevronRight class="w-[18px] h-[18px] text-gray-600" />
          </button>
        </div>

        <template v-if="calendarView === 'date'">
          <div class="grid grid-cols-7 gap-1 mb-1">
            <div
              v-for="(w, i) in THAI_WEEKDAYS_SHORT" :key="w"
              class="text-center text-xs font-medium py-1"
              :class="i >= 5 ? 'text-red-400' : 'text-gray-400'"
            >{{ w }}</div>
          </div>
          <div class="grid grid-cols-7 gap-1">
            <template v-for="cell in dayCells" :key="cell.key">
              <div v-if="cell.pad" />
              <button
                v-else type="button"
                class="h-9 w-9 rounded-lg text-sm font-medium transition-colors"
                :class="cell.isSel
                  ? 'bg-blue-600 text-white'
                  : cell.isToday
                    ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200'
                    : 'text-gray-700 hover:bg-gray-100'"
                :aria-label="`${cell.day} ${viewMonthLabel} ${viewYearBE}`"
                :aria-current="cell.isToday ? 'date' : undefined"
                @click="pickDay(cell.day)"
              >{{ cell.day }}</button>
            </template>
          </div>
        </template>
        <div v-else class="grid grid-cols-4 gap-2 py-1">
          <button
            v-for="yc in yearCells" :key="yc.be" type="button"
            class="h-11 rounded-lg text-sm font-medium transition-colors"
            :class="yc.isSel
              ? 'bg-blue-600 text-white'
              : yc.isCurrent
                ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200'
                : 'text-gray-700 hover:bg-gray-100'"
            :aria-label="`พ.ศ. ${yc.be}`"
            @click="pickYear(yc.be)"
          >{{ yc.be }}</button>
        </div>

        <div class="mt-3 pt-2 border-t border-gray-100 flex justify-center">
          <button
            type="button"
            class="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            @click="pickToday"
          >วันนี้ ({{ todayLabel }})</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tdp-pop-enter-active,
.tdp-pop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.tdp-pop-enter-from,
.tdp-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
