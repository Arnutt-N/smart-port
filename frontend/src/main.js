import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// D3: mount ทันที ไม่ block ด้วย session check — หน้า login ไม่ค้างขาวรอ /auth/me
// (Render free tier backend หลับ ตื่นช้า เคยทำให้หน้า login ขาวถึง 10 วิ)
// กัน race: router guard ผ่อน redirect เมื่อ sessionCheckPending = true
// แล้ว checkSession ตอบเสร็จจะ set false — ดู stores/auth.js + router/index.js
// หมายเหตุ: ไม่ใช้ top-level await (build target es2020 ไม่รองรับ)
app.mount('#app')

import('./stores/auth.js')
  .then(({ useAuthStore }) => {
    const auth = useAuthStore()
    // ไม่มี session = เรื่องปกติของหน้า login — checkSession ล้มเงียบในตัวอยู่แล้ว
    auth.checkSession().catch(() => {}).then(async () => {
      // หลัง session ตอบ: จัดตำแหน่งถ้ายังค้างไม่ตรงกับสิทธิ์จริง
      // (guard ปล่อยผ่านตอน pending — เพราะ mount ไม่ block ด้วย session check)
      await router.isReady()
      const to = router.currentRoute.value
      if (to.path === '/login' && auth.isAuthenticated) {
        // มี session ค้าง แต่เปิด /login ตรง → พาไป dashboard (guard เคยทำตอน install)
        router.replace('/dashboard')
      } else if (to.meta.requiresAuth !== false && !auth.isAuthenticated) {
        // ค้างบนหน้า protected โดยไม่มี session → เด้ง /login
        router.replace('/login')
      }
    })
  })
  .catch(() => {})
