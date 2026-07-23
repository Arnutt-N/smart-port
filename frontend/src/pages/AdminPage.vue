<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <div class="mb-2">
      <h1 class="text-2xl font-bold text-gray-900">การจัดการระบบ</h1>
      <p class="text-sm text-gray-500 mt-1">ศูนย์รวมเครื่องมือสำหรับผู้ดูแลระบบ</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <RouterLink
        v-for="card in cards"
        :key="card.route"
        :to="card.route"
        class="flex items-start gap-4 bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
      >
        <div class="rounded-lg p-3" :class="card.iconBg">
          <component :is="card.icon" class="w-6 h-6" :class="card.iconColor" />
        </div>
        <div>
          <h2 class="text-base font-semibold text-gray-900">{{ card.title }}</h2>
          <p class="text-sm text-gray-500 mt-1">{{ card.description }}</p>
        </div>
      </RouterLink>
    </div>
  </div>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import { Users, ScrollText, Upload, MapPin } from 'lucide-vue-next'

const cards = [
  { title: 'จัดการผู้ใช้', description: 'เพิ่ม แก้ไข และจัดการบัญชีผู้ใช้งาน', route: '/users', icon: Users, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
  { title: 'บันทึกการใช้งาน', description: 'ตรวจสอบประวัติการเปลี่ยนแปลงข้อมูล', route: '/audit', icon: ScrollText, iconBg: 'bg-purple-50', iconColor: 'text-purple-600' },
  { title: 'นำเข้าข้อมูล', description: 'นำเข้าข้อมูลข้าราชการจากไฟล์', route: '/import', icon: Upload, iconBg: 'bg-green-50', iconColor: 'text-green-600' },
  { title: 'พื้นที่พิเศษ', description: 'ตั้งค่าพื้นที่นับเวลาทวีคูณ', route: '/settings/special-areas', icon: MapPin, iconBg: 'bg-orange-50', iconColor: 'text-orange-600' },
]
</script>
