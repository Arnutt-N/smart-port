<template>
  <main class="min-h-screen flex items-center justify-center bg-slate-100 p-4">
    <section class="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg" aria-labelledby="change-password-title">
      <h1 id="change-password-title" class="text-2xl font-bold text-gray-900">เปลี่ยนรหัสผ่าน</h1>
      <p class="mt-2 text-sm text-gray-600">
        เพื่อความปลอดภัย กรุณาเปลี่ยนรหัสผ่านชั่วคราวก่อนใช้งานระบบ
      </p>

      <div
        v-if="errorMessage"
        role="alert"
        class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
      >
        {{ errorMessage }}
      </div>

      <form class="mt-6 space-y-4" @submit.prevent="submit">
        <div>
          <label for="current-password" class="block text-sm font-medium text-gray-700">รหัสผ่านปัจจุบัน</label>
          <input
            id="current-password"
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            required
            class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div>
          <label for="new-password" class="block text-sm font-medium text-gray-700">รหัสผ่านใหม่</label>
          <input
            id="new-password"
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
            aria-describedby="password-help"
            class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <p id="password-help" class="mt-1 text-xs text-gray-500">อย่างน้อย 8 ตัวอักษร และต้องไม่ซ้ำกับรหัสผ่านเดิม</p>
        </div>

        <div>
          <label for="confirm-password" class="block text-sm font-medium text-gray-700">ยืนยันรหัสผ่านใหม่</label>
          <input
            id="confirm-password"
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
            class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <button
          type="submit"
          :disabled="submitting"
          class="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {{ submitting ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่' }}
        </button>
      </form>

      <button type="button" class="mt-4 w-full text-sm text-gray-500 hover:text-gray-700" @click="logout">
        ออกจากระบบ
      </button>
    </section>
  </main>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'

const auth = useAuthStore()
const router = useRouter()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const submitting = ref(false)
const errorMessage = ref('')

async function submit() {
  errorMessage.value = ''
  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน'
    return
  }

  submitting.value = true
  try {
    await auth.changePassword(currentPassword.value, newPassword.value)
    await router.push('/dashboard')
  } catch (error) {
    errorMessage.value = error?.message || 'ไม่สามารถเปลี่ยนรหัสผ่านได้'
  } finally {
    submitting.value = false
  }
}

function logout() {
  auth.logout()
  router.push('/login')
}
</script>
