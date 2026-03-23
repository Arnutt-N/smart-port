<template>
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
</script>
