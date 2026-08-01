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
</template>

<script setup>
import { getCurrentInstance, nextTick, ref, onMounted, onUnmounted, watch } from 'vue'
import AppSidebar from '@/components/AppSidebar.vue'
import AppTopbar from '@/components/AppTopbar.vue'

const instance = getCurrentInstance()
const mainElement = ref(null)
const sidebarOpen = ref(window.innerWidth >= 1024)
const blankDebugEnabled = sessionStorage.getItem('blankDebugSession') === '4975e3'

function handleResize() {
  sidebarOpen.value = window.innerWidth >= 1024
}

onMounted(() => window.addEventListener('resize', handleResize))
onUnmounted(() => window.removeEventListener('resize', handleResize))

watch(
  () => instance?.proxy?.$route?.path ?? window.location.pathname,
  async (path) => {
    await nextTick()
    const main = mainElement.value
    const style = main ? getComputedStyle(main) : null
    const centerElement = document.elementFromPoint?.(window.innerWidth / 2, window.innerHeight / 2)
    // #region agent log
    if (blankDebugEnabled) fetch('http://127.0.0.1:7593/ingest/2c3dac7b-bfe2-4e17-bf18-ee2af8b3d131',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4975e3'},body:JSON.stringify({sessionId:'4975e3',runId:'blank-v3',hypothesisId:'L,M',location:'AppLayout.vue:routeWatch',message:'main content after route update',data:{path,mainExists:!!main,textLength:(main?.textContent??'').trim().length,childCount:main?.childElementCount??-1,display:style?.display??null,visibility:style?.visibility??null,opacity:style?.opacity??null,width:main?.getBoundingClientRect().width??-1,height:main?.getBoundingClientRect().height??-1,centerTag:centerElement?.tagName??null,centerClass:String(centerElement?.className??'').slice(0,200)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  },
  { immediate: true, flush: 'post' },
)
</script>
