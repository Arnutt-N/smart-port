<template>
  <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
    <!-- Page Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">ภาพรวมระบบสมุดพก</h1>
        <p class="text-gray-600 mt-1">สรุปข้อมูลสำคัญและกิจกรรมล่าสุดของระบบการจัดการข้าราชการ</p>
      </div>
      <div class="flex items-center space-x-3">
        <button class="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm">
          <Download class="w-4 h-4" />
          <span>ส่งออกรายงาน</span>
        </button>
        <button class="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
          <RefreshCw class="w-4 h-4" />
          <span>รีเฟรช</span>
        </button>
      </div>
    </div>

    <!-- Statistics Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard label="จำนวนข้าราชการทั้งหมด" value="2,847" change="+12%" :icon="Users" icon-bg-class="bg-blue-50" icon-class="text-blue-600" />
      <StatCard label="ผู้พ้นทดลองปีนี้" value="156" change="+8%" :icon="UserCheck" icon-bg-class="bg-green-50" icon-class="text-green-600" />
      <StatCard label="Candidate Lists" value="89" change="+3%" :icon="Users" icon-bg-class="bg-orange-50" icon-class="text-orange-600" />
      <StatCard label="ผู้เกษียณปีนี้" value="24" change="+15%" :icon="UserMinus" icon-bg-class="bg-purple-50" icon-class="text-purple-600" />
    </div>

    <!-- Main Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Priority Tasks (2/3 width) -->
      <div class="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200">
        <div class="p-6 border-b border-gray-200">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900">งานสำคัญที่ต้องติดตาม</h2>
            <AlertCircle class="w-5 h-5 text-orange-500" />
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">รายการ</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">จำนวน</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ความสำคัญ</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="task in priorityTasks" :key="task.title" class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center space-x-3">
                    <component :is="task.icon" class="w-5 h-5" :class="task.iconColor" />
                    <span class="text-sm font-medium text-gray-900">{{ task.title }}</span>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ task.count }}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full" :class="task.priorityColor">
                    {{ task.priority }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <RouterLink :to="task.route" class="text-blue-600 hover:text-blue-800 text-sm font-medium">
                    ดูรายละเอียด
                  </RouterLink>
                </td>
              </tr>
              <tr v-if="priorityTasks.length === 0">
                <td colspan="4" class="px-6 py-8 text-center text-gray-400">ไม่มีงานที่ต้องดำเนินการ</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Right Column: Quick Actions + Recent Activity -->
      <div class="space-y-6">
        <!-- Quick Actions -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900">การดำเนินการด่วน</h3>
            <Zap class="w-5 h-5 text-yellow-500" />
          </div>
          <div class="space-y-3">
            <RouterLink
              v-for="action in quickActions"
              :key="action.title"
              :to="action.route"
              class="w-full flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200"
            >
              <div class="text-white p-2 rounded-lg" :class="action.color">
                <component :is="action.icon" class="w-4 h-4" />
              </div>
              <span class="text-sm font-medium text-gray-700">{{ action.title }}</span>
            </RouterLink>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900">กิจกรรมล่าสุด</h3>
            <Activity class="w-5 h-5 text-blue-500" />
          </div>
          <div class="space-y-3">
            <div v-for="(act, i) in recentActivities" :key="i" class="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
              <div class="w-2 h-2 rounded-full mt-2" :class="act.dotColor"></div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900">{{ act.action }}</p>
                <p class="text-xs text-gray-500 mt-1">{{ act.time }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- System Status -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-900">สถานะระบบ</h2>
        <div class="flex items-center space-x-2">
          <div class="w-2 h-2 bg-green-500 rounded-full"></div>
          <span class="text-sm text-gray-600">ปกติ</span>
        </div>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div v-for="status in systemStatus" :key="status.label" class="text-center p-4 rounded-lg" :class="status.bgColor">
          <component :is="status.icon" class="w-6 h-6 mx-auto mb-2" :class="status.color" />
          <p class="text-sm font-medium" :class="status.textColor">{{ status.label }}</p>
          <p class="text-xs opacity-75" :class="status.textColor">{{ status.value }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import StatCard from '@/components/StatCard.vue'
import {
  Users, UserCheck, UserMinus, Award, Clock, TrendingUp,
  Download, RefreshCw, AlertCircle, Zap, Activity,
  Database, ShieldCheck,
} from 'lucide-vue-next'

const priorityTasks = [
  { title: 'ข้าราชการครบกำหนดพ้นทดลอง', count: '12 คน', priority: 'เร่งด่วน', priorityColor: 'bg-red-100 text-red-800', icon: UserCheck, iconColor: 'text-red-500', route: '/probation-end' },
  { title: 'รายชื่อผู้มีสิทธิ์เลื่อนตำแหน่ง', count: '28 คน', priority: 'สำคัญ', priorityColor: 'bg-orange-100 text-orange-800', icon: TrendingUp, iconColor: 'text-orange-500', route: '/candidates/general' },
  { title: 'ข้าราชการใกล้เกษียณ (6 เดือน)', count: '15 คน', priority: 'ปกติ', priorityColor: 'bg-blue-100 text-blue-800', icon: UserMinus, iconColor: 'text-blue-500', route: '/retirement-report' },
  { title: 'เครื่องราชอิสริยาภรณ์รอดำเนินการ', count: '7 คน', priority: 'ปกติ', priorityColor: 'bg-green-100 text-green-800', icon: Award, iconColor: 'text-green-500', route: '/royal-decorations' },
]

const quickActions = [
  { title: 'พ้นทดลองปฏิบัติราชการ', icon: UserCheck, color: 'bg-blue-500', route: '/probation-end' },
  { title: 'เลื่อนระดับตำแหน่ง', icon: TrendingUp, color: 'bg-green-500', route: '/candidates/general' },
  { title: 'รายงานผู้เกษียณ', icon: UserMinus, color: 'bg-purple-500', route: '/retirement-report' },
  { title: 'เครื่องราชอิสริยาภรณ์', icon: Award, color: 'bg-orange-500', route: '/royal-decorations' },
]

const recentActivities = [
  { action: 'มีผู้สมัครพ้นทดลองปฏิบัติราชการ', time: '2 นาทีที่แล้ว', dotColor: 'bg-green-500' },
  { action: 'อัพเดตข้อมูลเครื่องราชอิสริยาภรณ์', time: '1 ชั่วโมงที่แล้ว', dotColor: 'bg-blue-500' },
  { action: 'รายงานผู้เกษียณรอการตรวจสอบ', time: '3 ชั่วโมงที่แล้ว', dotColor: 'bg-orange-500' },
  { action: 'สร้างรายงานการนับเวลาเกื้อกูล', time: '1 วันที่แล้ว', dotColor: 'bg-green-500' },
]

const systemStatus = [
  { label: 'ฐานข้อมูล', value: 'ออนไลน์', icon: Database, color: 'text-green-600', bgColor: 'bg-green-50', textColor: 'text-green-700' },
  { label: 'ระบบสำรอง', value: 'พร้อมใช้งาน', icon: ShieldCheck, color: 'text-blue-600', bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
  { label: 'ผู้ใช้ออนไลน์', value: '23 คน', icon: Users, color: 'text-purple-600', bgColor: 'bg-purple-50', textColor: 'text-purple-700' },
  { label: 'อัพเดทล่าสุด', value: '2 ชม. ที่แล้ว', icon: Clock, color: 'text-gray-600', bgColor: 'bg-gray-50', textColor: 'text-gray-700' },
]
</script>
