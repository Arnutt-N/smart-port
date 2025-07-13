// Modern Login Page with New Design - Reference Image Style
export class LoginPage {
  constructor(authService, router) {
    this.authService = authService
    this.router = router
    this.currentTheme = localStorage.getItem('theme') || 'semi-dark'
  }

  render() {
    console.log('🖼️ Rendering new modern login page...')
    const app = document.getElementById('app')
    
    if (!app) {
      console.error('❌ App element not found')
      return
    }
    
    app.innerHTML = this.getTemplate()
    
    // Apply body styles for the new design
    document.body.className = 'min-h-screen font-thai'
    document.body.style.background = 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #0f172a 100%)'
    
    // Wait a bit for DOM to be ready
    setTimeout(() => {
      this.setupEventListeners()
      this.initializeAnimations()
    }, 100)
    
    console.log('✅ New modern login page rendered')
  }

  getTemplate() {
    return this.createLoginHTML()
  }

  createLoginHTML() {
    const styles = this.getStyles()
    const html = this.getMainHTML()
    return styles + html
  }

  getStyles() {
    return `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap');
        
        .font-thai {
          font-family: 'Noto Sans Thai', sans-serif;
        }
        
        .glass-card {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .input-field {
          transition: all 0.3s ease;
        }
        
        .input-field:focus {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(59, 130, 246, 0.15);
        }
        
        .login-button {
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          transition: all 0.3s ease;
        }
        
        .login-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(59, 130, 246, 0.3);
        }
      </style>
    `
  }

  getMainHTML() {
    return `
      <div class="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        ${this.getLoginCard()}
      </div>
    `
  }

  getBackgroundElements() {
    return `
        <!-- Removed background floating circles -->
    `
  }

  getLoginCard() {
    return `
        <div class="glass-card rounded-3xl p-6 w-full max-w-md shadow-2xl relative z-10">
          ${this.getHeader()}
          ${this.getLoginForm()}
        </div>
    `
  }

  getHeader() {
    return `
          <div class="text-center mb-6">
            <div class="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
              </svg>
            </div>
            <h1 class="text-2xl font-bold text-gray-800 mb-2">ระบบสมุดพก</h1>
            <p class="text-gray-600 text-sm">เข้าสู่ระบบจัดการข้อมูล</p>
          </div>
    `
  }

  getLoginForm() {
    return `
          <form id="loginForm" class="space-y-5">
            ${this.getEmailField()}
            ${this.getPasswordField()}
            ${this.getRememberSection()}
            ${this.getLoginButton()}
            ${this.getMessageAreas()}
            ${this.getDemoSection()}
          </form>
    `
  }

  getEmailField() {
    return `
            <div>
              <label for="email" class="block text-sm font-medium text-gray-700 mb-2">อีเมล</label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"/>
                  </svg>
                </div>
                <input 
                  type="email" 
                  id="email" 
                  name="email"
                  class="input-field block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  placeholder="กรุณาใส่อีเมลของคุณ"
                  value="admin@smartport.com"
                  required
                >
              </div>
            </div>
    `
  }

  getPasswordField() {
    return `
            <div>
              <label for="password" class="block text-sm font-medium text-gray-700 mb-2">รหัสผ่าน</label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                  </svg>
                </div>
                <input 
                  type="password" 
                  id="password" 
                  name="password"
                  class="input-field block w-full pl-10 pr-12 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  placeholder="กรุณาใส่รหัสผ่านของคุณ"
                  value="password123"
                  required
                >
                <button type="button" id="togglePassword" class="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <svg class="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                  </svg>
                </button>
              </div>
            </div>
    `
  }

  getRememberSection() {
    return `
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <input id="remember" name="remember" type="checkbox" class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
                <label for="remember" class="ml-2 block text-sm text-gray-700">จดจำการเข้าสู่ระบบ</label>
              </div>
              <div class="text-sm">
                <a href="#" class="font-medium text-blue-600 hover:text-blue-500 transition-colors">ลืมรหัสผ่าน?</a>
              </div>
            </div>
    `
  }

  getLoginButton() {
    return `
            <button type="submit" id="loginButton" class="login-button w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl text-white font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              <span class="mr-2" id="loginButtonText">เข้าสู่ระบบ</span>
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
              </svg>
            </button>
    `
  }

  getMessageAreas() {
    return `
            <div id="errorMessage" class="hidden">
              <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                <span id="errorText"></span>
              </div>
            </div>

            <div id="successMessage" class="hidden">
              <div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl">
                <span>เข้าสู่ระบบสำเร็จ! กำลังนำคุณไปยังหน้าหลัก...</span>
              </div>
            </div>
    `
  }

  getDemoSection() {
    return `
            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-6">
              <div class="flex items-start">
                <div class="flex-shrink-0">
                  <svg class="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                  </svg>
                </div>
                <div class="ml-3">
                  <h3 class="text-sm font-medium text-blue-800">ข้อมูลสำหรับทดสอบ</h3>
                  <div class="mt-2 text-sm text-blue-700">
                    <p><strong>อีเมล:</strong> admin@smartport.com</p>
                    <p><strong>รหัสผ่าน:</strong> password123</p>
                  </div>
                  <div class="mt-3 space-x-2">
                    <button type="button" id="fillDemoData" class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors">เติมข้อมูลทดสอบ</button>
                    <button type="button" id="skipLogin" class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-yellow-700 bg-yellow-100 hover:bg-yellow-200 transition-colors">ข้าม Login (Debug)</button>
                  </div>
                </div>
              </div>
            </div>
    `
  }


  setupEventListeners() {
    this.setupPasswordToggle()
    this.setupDemoButtons()
    this.setupLoginForm()
    this.setupInputAnimations()
  }

  setupPasswordToggle() {
    const togglePassword = document.getElementById('togglePassword')
    const passwordInput = document.getElementById('password')
    
    if (togglePassword && passwordInput) {
      togglePassword.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password'
        passwordInput.setAttribute('type', type)
        
        const icon = togglePassword.querySelector('svg')
        if (type === 'text') {
          icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"/>`
        } else {
          icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>`
        }
      })
    }
  }

  setupDemoButtons() {
    const fillDemoData = document.getElementById('fillDemoData')
    const skipLogin = document.getElementById('skipLogin')
    
    if (fillDemoData) {
      fillDemoData.addEventListener('click', () => {
        document.getElementById('email').value = 'admin@smartport.com'
        document.getElementById('password').value = 'password123'
      })
    }

    if (skipLogin) {
      skipLogin.addEventListener('click', () => {
        if (window.SmartPortDebug) {
          window.SmartPortDebug.navigate('/dashboard')
        } else {
          this.router.navigate('/dashboard')
        }
      })
    }
  }

  setupLoginForm() {
    const form = document.getElementById('loginForm')
    
    if (!form) {
      console.error('Login form not found')
      return
    }
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      console.log('🔐 Login form submitted')
      
      const email = document.getElementById('email').value
      const password = document.getElementById('password').value
      
      if (!email || !password) {
        this.showError('กรุณากรอกอีเมลและรหัสผ่าน')
        return
      }
      
      this.setLoading(true)
      
      try {
        if (email === 'admin@smartport.com' && password === 'password123') {
          console.log('✅ Demo login successful')
          
          this.showSuccess()
          
          const demoToken = 'demo-token-' + Date.now()
          const demoRefreshToken = 'demo-refresh-token-' + Date.now()
          
          this.authService.token = demoToken
          this.authService.refreshToken = demoRefreshToken
          this.authService.user = {
            id: 1,
            email: email,
            name: 'ผู้ดูแลระบบ',
            role: 'admin'
          }
          
          localStorage.setItem('authToken', demoToken)
          localStorage.setItem('refreshToken', demoRefreshToken)
          localStorage.setItem('user', JSON.stringify(this.authService.user))
          
          setTimeout(() => {
            this.router.navigate('/dashboard')
          }, 1500)
          
        } else {
          throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
        }
        
      } catch (error) {
        console.error('❌ Login error:', error)
        this.showError(error.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ')
      }
      
      this.setLoading(false)
    })
  }

  setupInputAnimations() {
    document.querySelectorAll('.input-field').forEach(input => {
      input.addEventListener('focus', function() {
        this.parentElement.parentElement.style.transform = 'translateY(-2px)'
      })
      
      input.addEventListener('blur', function() {
        this.parentElement.parentElement.style.transform = 'translateY(0)'
      })
    })
  }

  initializeAnimations() {
    console.log('🎬 Initializing animations...')
  }

  setLoading(isLoading) {
    const button = document.getElementById('loginButton')
    const buttonText = document.getElementById('loginButtonText')
    
    if (isLoading) {
      button.disabled = true
      button.style.opacity = '0.75'
      button.style.cursor = 'not-allowed'
      
      // Create loading spinner
      buttonText.innerHTML = `
        <svg class="animate-spin h-5 w-5 mr-2 inline" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        กำลังเข้าสู่ระบบ...
      `
    } else {
      button.disabled = false
      button.style.opacity = '1'
      button.style.cursor = 'pointer'
      buttonText.textContent = 'เข้าสู่ระบบ'
    }
  }

  showError(message) {
    const errorDiv = document.getElementById('errorMessage')
    const errorText = document.getElementById('errorText')
    const successDiv = document.getElementById('successMessage')
    
    if (successDiv) {
      successDiv.classList.add('hidden')
    }
    
    if (errorDiv && errorText) {
      errorText.textContent = message
      errorDiv.classList.remove('hidden')
      
      setTimeout(() => {
        errorDiv.classList.add('hidden')
      }, 5000)
    }
  }

  showSuccess() {
    const successDiv = document.getElementById('successMessage')
    const errorDiv = document.getElementById('errorMessage')
    
    if (errorDiv) {
      errorDiv.classList.add('hidden')
    }
    
    if (successDiv) {
      successDiv.classList.remove('hidden')
    }
  }
}
