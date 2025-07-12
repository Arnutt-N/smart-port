// Basic Login Page Implementation
export class LoginPage {
  constructor(authService, router) {
    this.authService = authService
    this.router = router
  }

  render() {
    console.log('🖼️ Rendering login page...')
    const app = document.getElementById('app')
    
    if (!app) {
      console.error('❌ App element not found')
      return
    }
    
    app.innerHTML = this.getTemplate()
    
    // Wait a bit for DOM to be ready
    setTimeout(() => {
      this.setupEventListeners()
    }, 100)
    
    console.log('✅ Login page rendered')
  }

  getTemplate() {
    return `
      <div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div class="max-w-md w-full space-y-8">
          <div>
            <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
              เข้าสู่ระบบสมุดพก
            </h2>
            <p class="mt-2 text-center text-sm text-gray-600">
              Smart Port Management System
            </p>
          </div>
          <form id="loginForm" class="mt-8 space-y-6">
            <div class="rounded-md shadow-sm -space-y-px">
              <div>
                <label for="email" class="sr-only">อีเมล</label>
                <input 
                  id="email" 
                  name="email" 
                  type="email" 
                  required 
                  class="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" 
                  placeholder="อีเมล"
                  value="admin@smartport.com"
                >
              </div>
              <div>
                <label for="password" class="sr-only">รหัสผ่าน</label>
                <input 
                  id="password" 
                  name="password" 
                  type="password" 
                  required 
                  class="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" 
                  placeholder="รหัสผ่าน"
                  value="password123"
                >
              </div>
            </div>

            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <input 
                  id="remember" 
                  name="remember" 
                  type="checkbox" 
                  class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                >
                <label for="remember" class="ml-2 block text-sm text-gray-900">
                  จดจำการเข้าสู่ระบบ
                </label>
              </div>
            </div>

            <div>
              <button 
                type="submit" 
                id="loginButton"
                class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                เข้าสู่ระบบ
              </button>
            </div>

            <div id="errorMessage" class="hidden">
              <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                <span id="errorText"></span>
              </div>
            </div>

            <div class="text-center">
              <div class="text-sm text-gray-600">
                <p class="mb-2">ข้อมูลสำหรับทดสอบ:</p>
                <p><strong>อีเมล:</strong> admin@smartport.com</p>
                <p><strong>รหัสผ่าน:</strong> password123</p>
                <button 
                  type="button" 
                  onclick="document.getElementById('email').value='admin@smartport.com'; document.getElementById('password').value='password123';"
                  class="mt-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                >
                  เติมข้อมูลทดสอบ
                </button>
                <button 
                  type="button" 
                  onclick="SmartPortDebug.navigate('/dashboard')"
                  class="mt-2 ml-2 px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 text-sm"
                >
                  ข้าม Login (Debug)
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `
  }

  setupEventListeners() {
    const form = document.getElementById('loginForm')
    const button = document.getElementById('loginButton')
    
    if (!form || !button) {
      console.error('Login form elements not found')
      return
    }
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      console.log('🔐 Login form submitted')
      
      const email = document.getElementById('email').value
      const password = document.getElementById('password').value
      
      console.log('📧 Email:', email)
      console.log('🔑 Password length:', password.length)
      
      if (!email || !password) {
        this.showError('กรุณากรอกอีเมลและรหัสผ่าน')
        return
      }
      
      button.disabled = true
      button.textContent = 'กำลังเข้าสู่ระบบ...'
      
      try {
        // For demo purposes, simulate login
        if (email === 'admin@smartport.com' && password === 'password123') {
          console.log('✅ Demo login successful')
          
          // Create demo tokens
          const demoToken = 'demo-token-' + Date.now()
          const demoRefreshToken = 'demo-refresh-token-' + Date.now()
          
          console.log('🎟️ Setting tokens:', demoToken)
          
          // Set tokens in AuthService
          this.authService.token = demoToken
          this.authService.refreshToken = demoRefreshToken
          this.authService.user = {
            id: 1,
            email: email,
            name: 'ผู้ดูแลระบบ',
            role: 'admin'
          }
          
          // Save to localStorage
          localStorage.setItem('authToken', demoToken)
          localStorage.setItem('refreshToken', demoRefreshToken)
          localStorage.setItem('user', JSON.stringify(this.authService.user))
          
          console.log('💾 Tokens saved to localStorage')
          console.log('🔍 Token valid check:', this.authService.isTokenValid())
          
          console.log('🎯 Redirecting to dashboard...')
          
          // Small delay to ensure state is set
          setTimeout(() => {
            this.router.navigate('/dashboard')
          }, 100)
          
        } else {
          throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
        }
        
      } catch (error) {
        console.error('❌ Login error:', error)
        this.showError(error.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ')
      }
      
      button.disabled = false
      button.textContent = 'เข้าสู่ระบบ'
    })
    
    console.log('📝 Login event listeners setup complete')
  }

  showError(message) {
    const errorDiv = document.getElementById('errorMessage')
    const errorText = document.getElementById('errorText')
    
    errorText.textContent = message
    errorDiv.classList.remove('hidden')
    
    setTimeout(() => {
      errorDiv.classList.add('hidden')
    }, 5000)
  }
}
