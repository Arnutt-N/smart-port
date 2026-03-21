<template>
  <div class="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #0f172a 100%)">
    <div class="w-full max-w-md relative z-10">
      <!-- White Glass Card (original design) -->
      <div class="rounded-3xl p-6 w-full shadow-2xl" style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.2);">
        <!-- Header -->
        <div class="text-center mb-6">
          <div class="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Shield class="w-8 h-8 text-white" />
          </div>
          <h1 class="text-2xl font-bold text-gray-800 mb-2">ระบบสมุดพก</h1>
          <p class="text-gray-600 text-sm">เข้าสู่ระบบจัดการข้อมูล</p>
        </div>

        <!-- Error Message -->
        <div v-if="errorMsg" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {{ errorMsg }}
        </div>

        <!-- Login Form -->
        <form @submit.prevent="handleLogin" class="space-y-5">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">อีเมล</label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <AtSign class="h-5 w-5 text-gray-400" />
              </div>
              <input
                v-model="form.email"
                type="email"
                class="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 transition-all"
                placeholder="กรุณาใส่อีเมลของคุณ"
                autocomplete="username"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">รหัสผ่าน</label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock class="h-5 w-5 text-gray-400" />
              </div>
              <input
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                class="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 transition-all"
                placeholder="กรุณาใส่รหัสผ่านของคุณ"
                autocomplete="current-password"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <component :is="showPassword ? EyeOff : Eye" class="w-5 h-5" />
              </button>
            </div>
          </div>

          <!-- Remember Me -->
          <div class="flex items-center justify-between">
            <label class="flex items-center">
              <input type="checkbox" v-model="rememberMe" class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
              <span class="ml-2 text-sm text-gray-600">จดจำฉัน</span>
            </label>
            <a href="#" class="text-sm text-blue-600 hover:text-blue-800">ลืมรหัสผ่าน?</a>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full py-3 text-white font-medium rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);"
          >
            <Loader2 v-if="loading" class="w-5 h-5 animate-spin" />
            {{ loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ' }}
          </button>
        </form>

        <!-- Demo Section -->
        <div class="mt-6 pt-5 border-t border-gray-200">
          <div class="bg-blue-50 rounded-xl p-4 mb-4">
            <p class="text-xs font-medium text-blue-800 mb-1">ข้อมูลสำหรับทดสอบ</p>
            <p class="text-xs text-blue-600">Email: admin@smartport.gov.th</p>
            <p class="text-xs text-blue-600">Password: admin123</p>
          </div>
          <div class="flex gap-3">
            <button @click="fillDemo" class="flex-1 py-2.5 text-sm font-medium border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors">
              กรอกข้อมูลตัวอย่าง
            </button>
            <button @click="skipLogin" class="flex-1 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 rounded-xl transition-colors">
              ข้ามการเข้าสู่ระบบ
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { Shield, AtSign, Lock, Eye, EyeOff, Loader2 } from 'lucide-vue-next'

const router = useRouter()
const auth = useAuthStore()

const form = reactive({ email: '', password: '' })
const showPassword = ref(false)
const loading = ref(false)
const errorMsg = ref('')
const rememberMe = ref(false)

async function handleLogin() {
  errorMsg.value = ''
  loading.value = true
  try {
    await auth.login({ email: form.email, password: form.password })
    router.push('/dashboard')
  } catch (e) {
    errorMsg.value = e.message || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่'
  } finally {
    loading.value = false
  }
}

function fillDemo() {
  form.email = 'admin@smartport.gov.th'
  form.password = 'admin123'
}

async function skipLogin() {
  await auth.demoLogin()
  router.push('/dashboard')
}
</script>
