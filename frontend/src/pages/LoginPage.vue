<template>
  <div
    class="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
    style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #0f172a 100%)"
  >
    <!-- #3: Background floating orbs for depth -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute top-1/4 -left-20 w-72 h-72 bg-primary-500/8 rounded-full blur-3xl animate-pulse" />
      <div
        class="absolute bottom-1/4 -right-20 w-96 h-96 bg-primary-500/6 rounded-full blur-3xl animate-pulse"
        style="animation-delay: 1s;"
      />
      <div
        class="absolute top-3/4 left-1/3 w-48 h-48 bg-primary-400/5 rounded-full blur-2xl animate-pulse"
        style="animation-delay: 2s;"
      />
    </div>

    <!-- #4: Entrance animation wrapper -->
    <div class="w-full max-w-md relative z-10 login-card">
      <!-- White Glass Card -->
      <div
        class="rounded-3xl p-6 w-full shadow-2xl"
        style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.2);"
      >
        <!-- Header -->
        <div class="text-center mb-6">
          <div class="mx-auto w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Shield
              class="w-8 h-8 text-white"
              aria-hidden="true"
            />
          </div>
          <h1 class="text-2xl font-bold text-government-800 mb-2">
            ระบบสมุดพก
          </h1>
          <p class="text-government-600 text-sm">
            เข้าสู่ระบบจัดการข้อมูล
          </p>
        </div>

        <!-- #5: Error Message with icon -->
        <div
          v-if="errorMsg"
          role="alert"
          class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2"
        >
          <AlertCircle
            class="w-4 h-4 shrink-0"
            aria-hidden="true"
          />
          <span>{{ errorMsg }}</span>
        </div>

        <!-- Login Form -->
        <form
          class="space-y-5"
          @submit.prevent="handleLogin"
        >
          <div>
            <label
              class="block text-sm font-medium text-government-700 mb-2"
              for="login-username"
            >ชื่อผู้ใช้</label>
            <div class="relative">
              <div class="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-3">
                <User
                  class="h-5 w-5 text-government-400"
                  aria-hidden="true"
                />
              </div>
              <input
                id="login-username"
                v-model="form.username"
                type="text"
                class="block w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-3 text-gray-900 transition-shadow duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                placeholder="ชื่อผู้ใช้"
                autocomplete="username"
              >
            </div>
          </div>

          <div>
            <label
              class="block text-sm font-medium text-government-700 mb-2"
              for="login-password"
            >รหัสผ่าน</label>
            <div class="relative">
              <div class="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-3">
                <Lock
                  class="h-5 w-5 text-government-400"
                  aria-hidden="true"
                />
              </div>
              <input
                id="login-password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                class="block w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-10 text-gray-900 transition-shadow duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                placeholder="รหัสผ่าน"
                autocomplete="current-password"
              >
              <button
                type="button"
                class="absolute right-3 top-1/2 z-10 -translate-y-1/2 cursor-pointer text-government-400 hover:text-government-600"
                aria-label="แสดง/ซ่อนรหัสผ่าน"
                @click="showPassword = !showPassword"
              >
                <component
                  :is="showPassword ? EyeOff : Eye"
                  class="h-5 w-5"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          <!-- spacing like jsk-app: space-y-5 (20px) + submit mt-4 (16px) => 36px to button -->
          <div class="flex items-center justify-between gap-3 px-1">
            <label class="flex cursor-pointer items-center gap-2.5">
              <input
                id="login-remember-me"
                v-model="rememberMe"
                type="checkbox"
                class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              >
              <span class="text-sm text-government-600">จดจำฉัน</span>
            </label>
            <button
              type="button"
              class="cursor-pointer shrink-0 text-sm text-primary-600 hover:text-primary-700 hover:underline"
              @click="showAccountHelp('forgot')"
            >
              ลืมรหัสผ่าน?
            </button>
          </div>

          <!-- #5: Info (forgot / create account) -->
          <div
            v-if="infoMsg"
            class="flex items-start gap-2 rounded-lg border border-primary-200 bg-primary-50 p-3 text-sm text-primary-800"
            role="status"
          >
            <AlertCircle
              class="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span>{{ infoMsg }}</span>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl py-3 font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/30 active:translate-y-0 disabled:opacity-50"
            style="background: linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%);"
          >
            <Loader2
              v-if="loading"
              class="h-5 w-5 animate-spin"
              aria-hidden="true"
            />
            {{ loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ' }}
          </button>

          <p class="text-center text-sm text-government-600">
            ยังไม่มีบัญชี?
            <button
              type="button"
              class="cursor-pointer font-medium text-primary-600 hover:text-primary-700 hover:underline"
              @click="showAccountHelp('register')"
            >
              สร้างบัญชีใหม่
            </button>
          </p>
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
const infoMsg = ref('')
const rememberMe = ref(false)

function showAccountHelp(kind) {
  errorMsg.value = ''
  if (kind === 'forgot') {
    infoMsg.value = 'หากลืมรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน'
    return
  }
  infoMsg.value = 'การสร้างบัญชีใหม่ทำโดยผู้ดูแลระบบเท่านั้น กรุณาติดต่อผู้ดูแลเพื่อขอสิทธิ์เข้าใช้งาน'
}

async function handleLogin() {
  errorMsg.value = ''
  infoMsg.value = ''
  loading.value = true
  try {
    // D3: session อยู่ใน httpOnly cookies (server TTL); remember เลือกที่เก็บ csrf/user ระหว่าง localStorage/sessionStorage
    await auth.login({ username: form.username, password: form.password }, { remember: rememberMe.value })
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
