<template>
  <div
    v-if="sidebarOpen"
    class="fixed inset-0 bg-black/50 z-20 lg:hidden"
    @click="sidebarOpen = false"
  />

  <AppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />

  <div class="lg:ml-64 transition-all duration-300">
    <AppTopbar @toggle-sidebar="sidebarOpen = !sidebarOpen" />
    <main ref="mainElement" class="min-h-[calc(100vh-4rem)] bg-gray-50">
      <!-- แสดง loading แทนพื้นที่ว่างเมื่อ RouterView ยังไม่มี component; ไม่ใช้ out-in -->
      <RouterView v-slot="{ Component }">
        <component :is="Component" v-if="Component" :key="$route.path" />
        <div
          v-else
          class="flex min-h-[40vh] items-center justify-center px-6 text-sm text-gray-500"
        >
          กำลังโหลดหน้า...
        </div>
      </RouterView>
    </main>
  </div>

  <div
    v-if="blankDebugEnabled"
    class="fixed bottom-2 right-2 z-50 max-w-[90vw] rounded bg-black/90 px-3 py-2 font-mono text-[11px] text-lime-300 shadow-lg"
  >
    {{ debugSnapshot }}
  </div>
</template>

<script setup>
import { getCurrentInstance, nextTick, ref, onMounted, onUnmounted, watch } from 'vue'
import AppSidebar from '@/components/AppSidebar.vue'
import AppTopbar from '@/components/AppTopbar.vue'

const instance = getCurrentInstance()
const mainElement = ref(null)
const sidebarOpen = ref(window.innerWidth >= 1024)
const blankDebugEnabled = sessionStorage.getItem('blankDebugSession') === '4975e3'
const debugSnapshot = ref('debug: waiting for route')
let mainObserver = null

function handleResize() {
  sidebarOpen.value = window.innerWidth >= 1024
}

function captureMain(reason, path = window.location.pathname) {
  const main = mainElement.value
  const style = main ? getComputedStyle(main) : null
  const centerElement = document.elementFromPoint?.(window.innerWidth / 2, window.innerHeight / 2)
  const data = {
    reason,
    path,
    mainExists: !!main,
    textLength: (main?.textContent ?? '').trim().length,
    childCount: main?.childElementCount ?? -1,
    display: style?.display ?? null,
    visibility: style?.visibility ?? null,
    opacity: style?.opacity ?? null,
    width: main?.getBoundingClientRect().width ?? -1,
    height: main?.getBoundingClientRect().height ?? -1,
    centerTag: centerElement?.tagName ?? null,
  }
  debugSnapshot.value = `${path} | text=${data.textLength} child=${data.childCount} | ${data.display}/${data.visibility}/${data.opacity} | center=${data.centerTag ?? '-'}`
  console.warn('[blankDebug]', data)
  // #region agent log
  fetch('http://127.0.0.1:7593/ingest/2c3dac7b-bfe2-4e17-bf18-ee2af8b3d131',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4975e3'},body:JSON.stringify({sessionId:'4975e3',runId:'blank-v4',hypothesisId:'L,M',location:'AppLayout.vue:captureMain',message:'main content state',data,timestamp:Date.now()})}).catch(()=>{});
  // #endregion
}

onMounted(async () => {
  window.addEventListener('resize', handleResize)
  if (!blankDebugEnabled) return
  await nextTick()
  captureMain('mounted')
  mainObserver = new MutationObserver(() => {
    const main = mainElement.value
    if (!main || main.childElementCount === 0 || !(main.textContent ?? '').trim()) {
      captureMain('blank-mutation')
    }
  })
  if (mainElement.value) {
    mainObserver.observe(mainElement.value, { childList: true, subtree: true })
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  mainObserver?.disconnect()
})

watch(
  () => instance?.proxy?.$route?.path ?? window.location.pathname,
  async (path) => {
    if (!blankDebugEnabled) return
    await nextTick()
    captureMain('route', path)
  },
  { immediate: true, flush: 'post' },
)
</script>
