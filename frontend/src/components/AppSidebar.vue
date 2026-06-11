<template>
  <aside
    class="w-64 bg-gray-800 h-screen fixed left-0 top-0 z-30 transform transition-transform duration-300 ease-in-out flex flex-col sidebar-scroll"
    style="overflow-y: overlay;"
    :class="open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
  >
    <!-- Header: logo ชิดซ้าย, ชื่อแบรนด์กึ่งกลาง -->
    <div class="relative flex items-center h-16 min-h-16 bg-gray-900">
      <div class="absolute left-4">
        <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
          <BookOpen class="w-4 h-4 text-white" />
        </div>
      </div>
      <span class="text-lg font-bold text-white tracking-tight w-full text-center">ระบบสมุดพก</span>
      <button @click="$emit('close')" class="lg:hidden absolute right-3 text-gray-400 hover:text-white transition-colors cursor-pointer" aria-label="ปิดเมนู">
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Navigation -->
    <nav class="mt-8 px-4 space-y-2 flex-1">
      <template v-for="item in menuItems" :key="item.id">
        <!-- Item with submenu -->
        <div v-if="item.children">
          <button
            @click="toggleSubmenu(item.id)"
            class="w-full flex items-center px-4 py-3 text-left rounded-lg transition-all duration-200 cursor-pointer"
            :class="isParentActive(item)
              ? 'bg-blue-600/10 text-blue-400 border-l-3 border-blue-400'
              : 'text-gray-300 hover:bg-gray-700/50 hover:text-white hover:translate-x-0.5 transition-all duration-150'"
          >
            <component :is="item.icon" class="w-5 h-5 mr-3" />
            <span class="text-sm font-medium flex-1">{{ item.label }}</span>
            <ChevronRight
              class="w-4 h-4 transition-transform duration-200"
              :class="{ 'rotate-90': openSubmenus.has(item.id) }"
            />
          </button>
          <div v-show="openSubmenus.has(item.id)" class="ml-8 mt-2 space-y-1">
            <RouterLink
              v-for="child in item.children"
              :key="child.id"
              :to="child.to"
              class="w-full flex items-center px-3 py-2 text-left rounded-lg transition-all duration-200"
              :class="route.path === child.to
                ? 'bg-blue-500/10 text-blue-400 font-medium'
                : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'"
            >
              <span class="w-2 h-2 bg-current rounded-full mr-3 opacity-60"></span>
              <span class="text-xs font-medium">{{ child.label }}</span>
            </RouterLink>
          </div>
        </div>

        <!-- Simple item -->
        <RouterLink
          v-else
          :to="item.to"
          class="flex items-center px-4 py-3 rounded-lg transition-all duration-200 cursor-pointer"
          :class="route.path === item.to
            ? 'bg-blue-600/10 text-blue-400 border-l-3 border-blue-400'
            : 'text-gray-300 hover:bg-gray-700/50 hover:text-white hover:translate-x-0.5 transition-all duration-150'"
        >
          <component :is="item.icon" class="w-5 h-5 mr-3" />
          <span class="text-sm font-medium">{{ item.label }}</span>
        </RouterLink>
      </template>
    </nav>

    <!-- User Card -->
    <div class="p-4">
      <div class="bg-gray-700 rounded-lg p-4">
        <div class="flex items-center space-x-3">
          <div class="relative">
            <div class="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
              <span class="text-white font-medium">{{ auth.user?.name?.charAt(0) || 'A' }}</span>
            </div>
            <div class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-700"></div>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <p class="text-white text-sm font-medium truncate">{{ auth.user?.name || 'ผู้ใช้' }}</p>
              <span class="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded font-medium shrink-0">
                {{ auth.user?.role === 'admin' ? 'Admin' : 'Operator' }}
              </span>
            </div>
            <p class="text-gray-400 text-xs truncate mt-0.5">{{ auth.user?.email || auth.user?.username || '' }}</p>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { reactive, computed } from 'vue'
import { useRoute } from 'vue-router'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import {
  X, BookOpen, LayoutDashboard, UserCheck, Users, Clock, Award, UserMinus,
  Briefcase, FileText, Trophy, ChevronRight, UserCog,
} from 'lucide-vue-next'

defineProps({ open: Boolean })
defineEmits(['close'])

const route = useRoute()
const auth = useAuthStore()
const openSubmenus = reactive(new Set())

const menuItems = computed(() => [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { id: 'probation-end', label: 'พ้นทดลองปฏิบัติราชการ', icon: UserCheck, to: '/probation-end' },
  {
    id: 'candidates', label: 'Candidate Lists', icon: Users,
    children: [
      { id: 'overview', label: 'ภาพรวม', to: '/candidates/overview' },
      { id: 'general', label: 'ทั่วไป', to: '/candidates/general' },
      { id: 'academic', label: 'วิชาการ', to: '/candidates/academic' },
      { id: 'support', label: 'อำนวยการ', to: '/candidates/support' },
      { id: 'management', label: 'บริหาร', to: '/candidates/management' },
    ],
  },
  {
    id: 'time-extra', label: 'การนับเวลาเพิ่มเติม', icon: Clock,
    children: [
      { id: 'time-counting', label: 'การนับเกื้อกูล', to: '/time-counting' },
      { id: 'time-difference', label: 'การนับแตกต่าง', to: '/time-difference' },
      { id: 'position-compare', label: 'การเทียบตำแหน่ง', to: '/position-compare' },
    ],
  },
  { id: 'royal-decorations', label: 'เครื่องราชอิสริยาภรณ์', icon: Award, to: '/royal-decorations' },
  { id: 'retirement-report', label: 'รายงานผู้เกษียณ', icon: UserMinus, to: '/retirement-report' },
  // เมนูจัดการผู้ใช้ — admin เท่านั้น
  ...(auth.user?.role === 'admin'
    ? [{ id: 'user-management', label: 'จัดการผู้ใช้', icon: UserCog, to: '/users' }]
    : []),
  { id: 'work-management', label: 'การจัดการงาน', icon: Briefcase, to: '/admin' },
  { id: 'work-results', label: 'ผลงานและข้อเสนอ', icon: FileText, to: '/analytics' },
  { id: 'awards', label: 'รางวัล/ความดีความชอบ', icon: Trophy, to: '/analytics' },
])

function toggleSubmenu(id) {
  if (openSubmenus.has(id)) {
    openSubmenus.delete(id)
  } else {
    openSubmenus.add(id)
  }
}

function isParentActive(item) {
  return item.children?.some((c) => route.path === c.to)
}

</script>
