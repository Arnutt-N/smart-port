// Modern Login Page with Design System
export class LoginPage {
  constructor(authService, router) {
    this.authService = authService
    this.router = router
    this.currentTheme = localStorage.getItem('theme') || 'semi-dark'
  }

  render() {
    console.log('🖼️ Rendering modern login page...')
    const app = document.getElementById('app')
    
    if (!app) {
      console.error('❌ App element not found')
      return
    }
    
    app.innerHTML = this.getTemplate()
    
    // Apply theme
    document.body.className = `${this.currentTheme} min-h-screen transition-all duration-300`
    
    // Wait a bit for DOM to be ready
    setTimeout(() => {
      this.setupEventListeners()
      this.initializeAnimations()
    }, 100)
    
    console.log('✅ Modern login page rendered')
  }

  getTemplate() {
    return this.getLoginTemplate()
  }

  getLoginTemplate() {
    return `
      <div class="min-h-screen flex">
        ${this.getLeftPanel()}
        ${this.getRightPanel()}
      </div>
    `
  }

  getLeftPanel() {
    return `
        <!-- Left Panel - Branding & Info -->
        <div class="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 p-12 flex-col justify-between relative overflow-hidden">          
          <div class="relative z-10">
            ${this.getLogoSection()}
            ${this.getFeaturesSection()}
          </div>
          
          ${this.getQuoteSection()}
        </div>
    `
  }

  getLogoSection() {
    return `
            <!-- Logo & Title -->
            <div class="flex items-center space-x-3 mb-8 animate-slide-in">
              <div class="w-12 h-12 bg-white rounded-xl flex items-center justify-center">
                <svg class="w-8 h-8 text-primary-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
              </div>
              <div>
                <h1 class="text-2xl font-bold text-white">ระบบสมุดพก</h1>
                <p class="text-primary-100 text-sm">Smart Port Management</p>
              </div>
            </div>
    `
  }

  getFeaturesSection() {
    return `
            <!-- Features List -->
            <div class="space-y-6">
              <div class="flex items-start space-x-4 animate-slide-in" style="animation-delay: 0.1s">
                <div class="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center mt-1">
                  <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <div>
                  <h3 class="text-white font-semibold">โปรไฟล์ข้าราชการ 360°</h3>
                  <p class="text-primary-100 text-sm">จัดการข้อมูลบุคลากรแบบครบถ้วน</p>
                </div>
              </div>
              
              <div class="flex items-start space-x-4 animate-slide-in" style="animation-delay: 0.2s">
                <div class="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center mt-1">
                  <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                </div>
                <div>
                  <h3 class="text-white font-semibold">การคาดการณ์อัจฉริยะ</h3>
                  <p class="text-primary-100 text-sm">วางแผนเส้นทางความก้าวหน้า</p>
                </div>
              </div>
              
              <div class="flex items-start space-x-4 animate-slide-in" style="animation-delay: 0.3s">
                <div class="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center mt-1">
                  <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                  </svg>
                </div>
                <div>
                  <h3 class="text-white font-semibold">ระบบคัดสรรผู้มีศักยภาพ</h3>
                  <p class="text-primary-100 text-sm">ค้นหาบุคลากรที่เหมาะสมอย่างแม่นยำ</p>
                </div>
              </div>
            </div>
    `
  }
