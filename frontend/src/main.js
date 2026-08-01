import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'

const requestedDebugSession = new URLSearchParams(window.location.search).get('blankDebug')
if (requestedDebugSession === '4975e3') {
  sessionStorage.setItem('blankDebugSession', requestedDebugSession)
}
const blankDebugEnabled = sessionStorage.getItem('blankDebugSession') === '4975e3'

const app = createApp(App)

// #region agent log
if (blankDebugEnabled) fetch('http://127.0.0.1:7593/ingest/2c3dac7b-bfe2-4e17-bf18-ee2af8b3d131',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4975e3'},body:JSON.stringify({sessionId:'4975e3',runId:'blank-v3',hypothesisId:'N',location:'main.js:startup',message:'application startup',data:{pathname:window.location.pathname,scripts:[...document.scripts].map((script)=>script.src).filter(Boolean),navigationType:performance.getEntriesByType('navigation')[0]?.type??null,hasServiceWorkerController:!!navigator.serviceWorker?.controller},timestamp:Date.now()})}).catch(()=>{});
// #endregion

// #region agent log
app.config.errorHandler = (error, instance, info) => {
  console.error('[Vue error]', info, error)
  if (blankDebugEnabled) fetch('http://127.0.0.1:7593/ingest/2c3dac7b-bfe2-4e17-bf18-ee2af8b3d131',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4975e3'},body:JSON.stringify({sessionId:'4975e3',runId:'blank-v3',hypothesisId:'J',location:'main.js:errorHandler',message:'vue application error',data:{pathname:window.location.pathname,component:instance?.$options?.name??instance?.$?.type?.__name??null,info,errorName:error?.name??null,errorMessage:String(error?.message??error).slice(0,500)},timestamp:Date.now()})}).catch(()=>{});
}
// #endregion

// #region agent log
window.addEventListener('error', (event) => {
  if (blankDebugEnabled) fetch('http://127.0.0.1:7593/ingest/2c3dac7b-bfe2-4e17-bf18-ee2af8b3d131',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4975e3'},body:JSON.stringify({sessionId:'4975e3',runId:'blank-v3',hypothesisId:'J',location:'main.js:window.error',message:'uncaught window error',data:{pathname:window.location.pathname,errorName:event.error?.name??null,errorMessage:String(event.error?.message??event.message).slice(0,500),source:event.filename?.split('/').pop()??null,line:event.lineno??null},timestamp:Date.now()})}).catch(()=>{});
})
// #endregion

// #region agent log
window.addEventListener('unhandledrejection', (event) => {
  if (blankDebugEnabled) fetch('http://127.0.0.1:7593/ingest/2c3dac7b-bfe2-4e17-bf18-ee2af8b3d131',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4975e3'},body:JSON.stringify({sessionId:'4975e3',runId:'blank-v3',hypothesisId:'J',location:'main.js:unhandledrejection',message:'unhandled promise rejection',data:{pathname:window.location.pathname,errorName:event.reason?.name??null,errorMessage:String(event.reason?.message??event.reason).slice(0,500)},timestamp:Date.now()})}).catch(()=>{});
})
// #endregion

app.use(createPinia())
app.use(router)
app.mount('#app')
