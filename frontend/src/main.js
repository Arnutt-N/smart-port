import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)

app.use(createPinia())

// D3: เช็ค session ฝั่ง server ก่อนติดตั้ง router — guard ตัวแรกประเมินทันทีที่ install
// (async) ถ้าเช็คหลัง install จะแพ้ race แล้วเด้ง /login ทั้งที่ session ยังใช้ได้
// (เงียบ: ไม่มี session คือเรื่องปกติของหน้า login — checkSession ไม่ toast/redirect เอง)
// หมายเหตุ: ใช้ async fn แทน top-level await (build target es2020 ไม่รองรับ TLA)

const boot = async () => {
  try {
    const { useAuthStore } = await import('./stores/auth.js')
    await useAuthStore().checkSession()
  } catch {
    // กันเหนียว — checkSession ล้มเงียบในตัวอยู่แล้ว
  }
  app.use(router)
  app.mount('#app')
}
boot()
