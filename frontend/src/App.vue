<template>
  <Transition name="nav-progress">
    <div v-if="isNavigating" class="nav-progress-bar" role="progressbar" aria-label="กำลังโหลดหน้า" />
  </Transition>
  <RouterView v-slot="{ Component }">
    <Suspense timeout="0">
      <component :is="Component" />
      <template #fallback>
        <div class="min-h-screen flex items-center justify-center px-6 bg-slate-950 text-slate-100">
          <div class="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl shadow-slate-950/40 backdrop-blur">
            <div class="mx-auto mb-4 h-14 w-14 animate-pulse rounded-2xl bg-blue-500/90" />
            <h1 class="text-lg font-semibold">กำลังโหลด Smart Port</h1>
            <p class="mt-2 text-sm text-slate-300">ระบบกำลังเตรียมหน้าแรกให้พร้อมใช้งาน</p>
          </div>
        </div>
      </template>
    </Suspense>
  </RouterView>
  <ToastContainer />
</template>

<script setup>
import ToastContainer from '@/components/ToastContainer.vue'
import { useNavProgress } from '@/composables/useNavProgress.js'

const { isNavigating } = useNavProgress()
</script>

<style scoped>
.nav-progress-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 9999;
  background: linear-gradient(90deg, #0ea5e9, #6366f1);
  transform-origin: left;
  animation: nav-progress-slide 1.2s ease-in-out infinite;
}

@keyframes nav-progress-slide {
  0% { transform: scaleX(0); opacity: 1; }
  60% { transform: scaleX(0.75); opacity: 1; }
  100% { transform: scaleX(1); opacity: 0.4; }
}

/* หน่วงการโผล่ 150ms — navigation เร็วๆ จะไม่เห็นแถบกระพริบ */
.nav-progress-enter-active { transition: opacity 100ms ease 150ms; }
.nav-progress-enter-from { opacity: 0; }
.nav-progress-leave-active { transition: opacity 120ms ease; }
.nav-progress-leave-to { opacity: 0; }
</style>
