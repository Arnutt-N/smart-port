import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'

const requestedDebugSession = new URLSearchParams(window.location.search).get('blankDebug')
if (requestedDebugSession === '4975e3') {
  sessionStorage.setItem('blankDebugSession', requestedDebugSession)
}

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.mount('#app')
