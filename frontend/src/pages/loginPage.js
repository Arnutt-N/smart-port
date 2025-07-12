// Login Page Component
export class LoginPage {
  constructor(authService, eventManager) {
    this.authService = authService
    this.eventManager = eventManager
    this.isLoading = false
  }

  render() {
    return `
      <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-government-100 py-12 px-4 sm:px-6 lg:px-8">
        <div class="max-w-md w-full space-y-8">
          <div class="text-center">
            <img class="mx-auto h-16 w-auto" src="/logo.svg" alt="Smart Port Logo">
            <h2 class="mt-6 text-3xl font-bold text-gray-900">ระบบสมุดพก</h2>
            <p class="mt-2 text-sm text-gray-600">Smart Port Management System</p>
            <p class="mt-1 text-xs text-gray-500">เข้าสู่ระบบเพื่อจัดการข้อมูลข้าราชการ</p>
          </div>
          
          <form id="login-form" class="mt-8 space-y-6 bg-white p-8 rounded-xl shadow-lg">
            <div class="space-y-4">
              <div>
                <label for="username" class="label">ชื่อผู้ใช้</label>
                <div class="relative">
                  <span class="material-icons absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">person</span>
                  <input 
                    id="username" 
                    name="username" 
                    type="text" 
                    required 
                    class="input pl-10" 
                    placeholder="กรอกชื่อผู้ใช้"
                    autocomplete="username">
                </div>
              </div>
              
              <div>
                <label for="password" class="label">รหัสผ่าน</label>
                <div class="relative">
                  <span class="material-icons absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">lock</span>
                  <input 
                    id="password" 
                    name="password" 
                    type="password" 
                    required 
                    class="input pl-10" 
                    placeholder="กรอกรหัสผ่าน"
                    autocomplete="current-password">
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <input id="remember-me" name="remember-me" type="checkbox" class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded">
                <label for="remember-me" class="ml-2 block text-sm text-gray-900">จำรหัสผ่าน</label>
              </div>
              <div class="text-sm">
                <a href="#" class="font-medium text-primary-600 hover:text-primary-500">ลืมรหัสผ่าน?</a>
              </div>
            </div>

            <div>
              <button 
                type="submit" 
                id="login-button"
                class="btn-primary w-full py-3 text-base font-medium">
                <span id="login-text">เข้าสู่ระบบ</span>
                <span id="login-spinner" class="hidden ml-2">
                  <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </span>
              </button>
            </div>

            <div class="text-center">
              <p class="text-xs text-gray-500 mt-4">
                เข้าสู่ระบบด้วยบัญชีราชการของคุณ<br>
                สำหรับการสนับสนุน กรุณาติดต่อ IT Support
              </p>
            </div>
          </form>
        </div>
      </div>
    `
  }

  bindEvents() {
    const form = document.getElementById('login-form')
    const usernameInput = document.getElementById('username')
    const passwordInput = document.getElementById('password')

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      await this.handleLogin()
    })

    // Enter key handling
    [usernameInput, passwordInput].forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.handleLogin()
        }
      })
    })

    // Auto-focus on username
    setTimeout(() => {
      usernameInput.focus()
    }, 100)
  }

  async handleLogin() {
    if (this.isLoading) return

    const username = document.getElementById('username').value.trim()
    const password = document.getElementById('password').value

    if (!username || !password) {
      this.eventManager.emit('ui:error', 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน')
      return
    }

    this.setLoading(true)

    try {
      const user = await this.authService.login({ username, password })
      this.eventManager.emit('ui:success', `ยินดีต้อนรับ ${user.name || username}`)
      this.eventManager.emit('auth:login', user)
    } catch (error) {
      console.error('Login error:', error)
      this.eventManager.emit('ui:error', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    } finally {
      this.setLoading(false)
    }
  }

  setLoading(loading) {
    this.isLoading = loading
    const button = document.getElementById('login-button')
    const text = document.getElementById('login-text')
    const spinner = document.getElementById('login-spinner')

    if (loading) {
      button.disabled = true
      button.classList.add('opacity-75')
      text.textContent = 'กำลังเข้าสู่ระบบ...'
      spinner.classList.remove('hidden')
    } else {
      button.disabled = false
      button.classList.remove('opacity-75')
      text.textContent = 'เข้าสู่ระบบ'
      spinner.classList.add('hidden')
    }
  }
}
