<template>
  <div class="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #0f172a 100%)">
    <!-- #3: Background floating orbs for depth -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute top-1/4 -left-20 w-72 h-72 bg-blue-500/8 rounded-full blur-3xl animate-pulse"></div>
      <div class="absolute bottom-1/4 -right-20 w-96 h-96 bg-indigo-500/6 rounded-full blur-3xl animate-pulse" style="animation-delay: 1s;"></div>
      <div class="absolute top-3/4 left-1/3 w-48 h-48 bg-cyan-500/5 rounded-full blur-2xl animate-pulse" style="animation-delay: 2s;"></div>
    </div>

    <!-- #4: Entrance animation wrapper -->
    <div class="w-full max-w-md relative z-10 login-card">
      <!-- White Glass Card -->
      <div class="rounded-3xl p-6 w-full shadow-2xl" style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.2);">
        <!-- Header -->
        <div class="text-center mb-6">
          <div class="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Shield class="w-8 h-8 text-white" />
          </div>
          <h1 class="text-2xl font-bold text-gray-800 mb-2">ระบบสมุดพก</h1>
          <p class="text-gray-600 text-sm">เข้าสู่ระบบจัดการข้อมูล</p>
        </div>

        <!-- #5: Error Message with icon -->
        <div v-if="errorMsg" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
          <AlertCircle class="w-4 h-4 shrink-0" />
          <span>{{ errorMsg }}</span>
        </div>

        <!-- Login Form -->
        <form @submit.prevent="handleLogin" class="space-y-5">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">ชื่อผู้ใช้</label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User class="h-5 w-5 text-gray-400" />
              </div>
              <!-- #1: Input focus animation -->
              <input
                v-model="form.username"
                type="text"
                class="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl bg-white text-gray-900 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:shadow-lg focus:shadow-blue-500/10 focus:-translate-y-px"
                placeholder="กรุณาใส่ชื่อผู้ใช้ของคุณ"
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
              <!-- #1: Input focus animation -->
              <input
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                class="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl bg-white text-gray-900 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:shadow-lg focus:shadow-blue-500/10 focus:-translate-y-px"
                placeholder="กรุณาใส่รหัสผ่านของคุณ"
                autocomplete="current-password"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                aria-label="แสดง/ซ่อนรหัสผ่าน"
              >
                <component :is="showPassword ? EyeOff : Eye" class="w-5 h-5" />
              </button>
            </div>
          </div>

          <!-- Remember Me — #6: removed "ลืมรหัสผ่าน" link -->
          <label class="flex items-center cursor-pointer">
            <input type="checkbox" v-model="rememberMe" class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
            <span class="ml-2 text-sm text-gray-600">จดจำฉัน</span>
          </label>

          <!-- #2: Submit button with hover effect -->
          <button
            type="submit"
            :disabled="loading"
            class="w-full py-3 text-white font-medium rounded-xl transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/30 active:translate-y-0 cursor-pointer"
            style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);"
          >
            <Loader2 v-if="loading" class="w-5 h-5 animate-spin" />
            {{ loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { Shield, User, Lock, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-vue-next'

const router = useRouter()
const auth = useAuthStore()

const form = reactive({ username: '', password: '' })
const showPassword = ref(false)
const loading = ref(false)
const errorMsg = ref('')
const rememberMe = ref(false)

async function handleLogin() {
  errorMsg.value = ''
  loading.value = true
  try {
    await auth.login({ username: form.username, password: form.password })
    router.push(auth.mustChangePassword ? '/change-password' : '/dashboard')
  } catch (e) {
    errorMsg.value = e.message || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* #4: Entrance animation */
.login-card {
  animation: loginEnter 0.5s ease-out;
}
@keyframes loginEnter {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
