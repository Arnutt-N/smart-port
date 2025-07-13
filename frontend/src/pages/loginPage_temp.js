// Modern Login Page with Design System (Exact Redesign based on attached image)
export class LoginPage {
  constructor(authService, router) {
    this.authService = authService
    this.router = router
    this.currentTheme = localStorage.getItem("theme") || "semi-dark"
  }

  render() {
    console.log("🖼️ Rendering exact redesigned login page...")
    const app = document.getElementById("app")

    if (!app) {
      console.error("❌ App element not found")
      return
    }

    app.innerHTML = this.getTemplate()

    // Apply theme (adjusted for blue gradient background)
    document.body.className = `${this.currentTheme} min-h-screen transition-all duration-300 bg-gradient-to-b from-blue-900 to-blue-600 flex items-center justify-center px-4`

    // Wait a bit for DOM to be ready
    setTimeout(() => {
      this.setupEventListeners()
      this.initializeAnimations()
    }, 100)

    console.log("✅ Exact redesigned login page rendered")
  }

  getTemplate() {
    return `
      <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm space-y-6">
        <!-- Logo -->
        <div class="flex justify-center">
          <div class="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white">
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
        </div>
        
        <!-- Title -->
        <h2 class="text-xl font-bold text-center text-gray-900">Smart Port</h2>
        <p class="text-center text-sm text-gray-500">เข้าสู่ระบบ</p>
        
        <!-- Login Form -->
        <form id="loginForm" class="space-y-4">
          <!-- Email Field -->
          <input 
            id="email" 
            name="email" 
            type="email" 
            required 
            class="w-full px-4 py-3 border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm"
            placeholder="กรุณาใส่อีเมลของคุณ"
          >
          
          <!-- Password Field -->
          <input 
            id="password" 
            name="password" 
            type="password" 
            required 
            class="w-full px-4 py-3 border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm"
            placeholder="กรุณาใส่รหัสผ่านของคุณ"
          >
          
          <!-- Checkbox and Forgot Link -->
          <div class="flex items-center justify-between text-sm">
            <label class="flex items-center space-x-2 text-gray-600">
              <input type="checkbox" class="rounded border-gray-300 text-blue-500 focus:ring-blue-500">
              <span>จำรหัสผ่าน</span>
            </label>
            <a href="#" class="text-blue-500 hover:underline">ลืมรหัสผ่าน?</a>
          </div>
          
          <!-- Login Button -->
          <button type="submit" class="w-full py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm">
            เข้าสู่ระบบ →
          </button>
        </form>
        
        <!-- Divider -->
        <div class="text-center text-sm text-gray-500 relative">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-gray-300"></div>
          </div>
          <span class="bg-white px-2">หรือเข้าสู่ระบบด้วย</span>
        </div>
        
        <!-- Google Button -->
        <button class="w-full py-3 border border-gray-300 rounded-md text-gray-700 font-medium hover:bg-gray-50 transition-all duration-200 flex items-center justify-center space-x-2 text-sm">
          <svg class="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.11-3.11C17.5 2.26 15.01 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            <path fill="none" d="M1 1h22v22H1z" />
          </svg>
          <span>Google</span>
        </button>
        
        <!-- Default Account Info -->
        <div class="text-center text-sm text-gray-500">
          <p>บัญชีผู้ใช้เริ่มต้น:</p>
          <p>อีเมล: admin@smartport.com</p>
          <p>รหัสผ่าน: password123</p>
        </div>
        
        <!-- Copyright -->
        <p class="text-center text-xs text-gray-400">
          © 2025 Smart Port, สงวนลิขสิทธิ์
        </p>
      </div>
    `
  }

  setupEventListeners() {
    // Stub for event listeners; add real logic here
    console.log("Setting up event listeners...")
    const form = document.getElementById("loginForm")
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault()
        // Handle login
      })
    }
  }

  initializeAnimations() {
    // Stub for animations; add real logic here
    console.log("Initializing animations...")
  }
}
