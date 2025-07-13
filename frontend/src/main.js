// Smart Port Management System - Main Application
import '../style.css'
import { Router } from './utils/router.js'
import { EventManager } from './utils/eventManager.js'
import { AuthService } from './services/authService.js'
import { ApiService } from './services/apiService.js'
import { UIComponents } from './components/uiComponents.js'
import { AdminDashboard } from './components/admin/AdminDashboard.js'
import { CandidateListsPage } from './pages/CandidateListsPage.js'
import './utils/debug.js'
import './utils/loginTest.js'

class SmartPortApp {
  constructor() {
    this.router = new Router()
    this.eventManager = new EventManager()
    this.authService = new AuthService()
    this.apiService = new ApiService()
    this.uiComponents = new UIComponents()
    this.adminDashboard = new AdminDashboard(this.router, this.authService)
    this.candidateListsPage = new CandidateListsPage(this.router, this.authService)
    
    this.currentUser = null
    this.isLoading = false
    
    this.init()
  }

  async init() {
    console.log('🚀 Smart Port Management System Starting...')
    
    try {
      this.showLoading(true)
      await this.initializeServices()
      this.setupEventListeners()
      this.setupRouting()
      await this.checkAuthStatus()
      this.showLoading(false)
      
      console.log('✅ Smart Port Application Initialized Successfully')
      
      // Enable debug mode in development
      if (window.SmartPortDebug) {
        window.SmartPortDebug.init(this)
      }
      
    } catch (error) {
      console.error('❌ Failed to initialize application:', error)
      this.showError('เกิดข้อผิดพลาดในการเริ่มต้นระบบ กรุณาลองใหม่อีกครั้ง')
    }
  }

  async initializeServices() {
    this.apiService.setBaseURL('http://localhost:8000')
    this.authService.init()
    
    this.apiService.setupInterceptors(
      (config) => {
        const token = this.authService.getToken()
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          this.authService.logout()
          this.router.navigate('/login')
        }
        return Promise.reject(error)
      }
    )
  }

  setupEventListeners() {
    this.eventManager.on('auth:login', (user) => {
      this.currentUser = user
      this.updateNavigation()
      this.router.navigate('/dashboard')
    })

    this.eventManager.on('auth:logout', () => {
      this.currentUser = null
      this.updateNavigation()
      this.router.navigate('/login')
    })

    this.eventManager.on('ui:loading', (isLoading) => {
      this.showLoading(isLoading)
    })

    this.eventManager.on('ui:error', (message) => {
      this.showError(message)
    })

    this.eventManager.on('ui:success', (message) => {
      this.showSuccess(message)
    })

    window.addEventListener('beforeunload', () => {
      this.cleanup()
    })
  }

  setupRouting() {
    this.router.addRoute('/', () => this.redirectToDefaultPage())
    this.router.addRoute('/login', () => this.loadLoginPage())
    this.router.addRoute('/dashboard', () => this.loadDashboardPage())
    this.router.addRoute('/profile/:id', (params) => this.loadProfilePage(params.id))
    this.router.addRoute('/candidates', () => this.loadCandidatesPage())
    this.router.addRoute('/candidates/general', () => this.loadCandidateListsPage('general'))
    this.router.addRoute('/candidates/academic', () => this.loadCandidateListsPage('academic'))
    this.router.addRoute('/candidates/support', () => this.loadCandidateListsPage('administrative'))
    this.router.addRoute('/candidates/management', () => this.loadCandidateListsPage('management'))
    this.router.addRoute('/analytics', () => this.loadAnalyticsPage())
    this.router.addRoute('/admin', () => this.loadAdminPage())
    
    this.router.start()
  }

  async checkAuthStatus() {
    const token = this.authService.getToken()
    if (token && this.authService.isTokenValid()) {
      try {
        const user = await this.authService.getCurrentUser()
        this.currentUser = user
        this.updateNavigation()
      } catch (error) {
        this.authService.logout()
      }
    }
  }

  redirectToDefaultPage() {
    try {
      // Redirect to appropriate page based on authentication status
      const token = this.authService.getToken()
      if (token && this.authService.isTokenValid()) {
        this.router.navigate('/dashboard')
      } else {
        this.router.navigate('/login')
      }
    } catch (error) {
      console.error('Error in redirectToDefaultPage:', error)
      this.router.navigate('/login')
    }
  }

  // Page Loading Functions
  async loadLoginPage() {
    try {
      console.log('📝 Loading Login Page...')
      
      // Check if already logged in
      const token = this.authService.getToken()
      const isValid = this.authService.isTokenValid()
      
      console.log('🔍 Login page auth check - Token:', !!token, 'Valid:', isValid)
      
      if (token && isValid) {
        console.log('✅ Already authenticated, redirecting to dashboard')
        this.router.navigate('/dashboard')
        return
      }

      console.log('📝 Showing login form')
      
      // Import and load login page
      const { LoginPage } = await import('./pages/loginPage.js')
      const loginPage = new LoginPage(this.authService, this.router)
      loginPage.render()
      
      this.updateNavigation(false)
      
    } catch (error) {
      console.error('Error loading login page:', error)
      this.showError('ไม่สามารถโหลดหน้าเข้าสู่ระบบได้')
    }
  }

  async loadDashboardPage() {
    try {
      console.log('📊 Loading Admin Dashboard Page...')
      
      // Check authentication
      const token = this.authService.getToken()
      const isValid = this.authService.isTokenValid()
      
      console.log('🔍 Auth check - Token:', !!token, 'Valid:', isValid)
      
      if (!token || !isValid) {
        console.log('❌ Authentication failed, redirecting to login')
        this.router.navigate('/login')
        return
      }

      console.log('✅ Authentication successful, loading admin dashboard')
      
      // Load new admin dashboard with modern design
      this.adminDashboard.render()
      
      console.log('🎨 Admin Dashboard loaded successfully!')
      
    } catch (error) {
      console.error('Error loading dashboard:', error)
      this.showError('ไม่สามารถโหลดหน้าแดชบอร์ดได้')
    }
  }

  async loadProfilePage(id) {
    try {
      console.log('👤 Loading Profile Page for ID:', id)
      
      if (!this.authService.getToken() || !this.authService.isTokenValid()) {
        this.router.navigate('/login')
        return
      }

      this.renderBasicPage('Profile', `กำลังโหลดโปรไฟล์ ID: ${id}`)
      // this.updateNavigation(true) // ปิดไว้เพราะมี nav ในตัวแล้ว
      
    } catch (error) {
      console.error('Error loading profile:', error)
      this.showError('ไม่สามารถโหลดหน้าโปรไฟล์ได้')
    }
  }

  async loadCandidatesPage() {
    try {
      console.log('📋 Loading Candidates Page...')
      
      if (!this.authService.getToken() || !this.authService.isTokenValid()) {
        this.router.navigate('/login')
        return
      }

      this.renderBasicPage('Candidates', 'รายชื่อผู้มีศักยภาพ - กำลังพัฒนา')
      // this.updateNavigation(true) // ปิดไว้เพราะมี nav ในตัวแล้ว
      
    } catch (error) {
      console.error('Error loading candidates:', error)
      this.showError('ไม่สามารถโหลดหน้ารายชื่อผู้มีศักยภาพได้')
    }
  }

  async loadCandidateListsPage(section = 'general') {
    try {
      console.log('📋 Loading Candidate Lists Page...', section)
      
      if (!this.authService.getToken() || !this.authService.isTokenValid()) {
        this.router.navigate('/login')
        return
      }

      // ต้องมี AdminDashboard ก่อน เพื่อให้มี sidebar
      if (!window.adminDashboard) {
        window.adminDashboard = this.adminDashboard
      }
      
      // Render AdminDashboard ก่อนเพื่อสร้าง sidebar
      this.adminDashboard.render()
      
      // Set active section before rendering
      this.candidateListsPage.activeSection = section
      
      // Set appropriate level for the section
      const sectionData = this.candidateListsPage.sections.find(s => s.id === section)
      if (sectionData && sectionData.levels.length > 0) {
        this.candidateListsPage.activeLevel = sectionData.levels[0]
      }
      
      // Render the candidate lists page content
      this.candidateListsPage.render()
      
      // Make it globally accessible for event handlers
      window.candidateListsPage = this.candidateListsPage
      
      console.log('✅ Candidate Lists Page loaded successfully')
      
    } catch (error) {
      console.error('Error loading candidate lists:', error)
      this.showError('ไม่สามารถโหลดหน้ารายชื่อผู้มีสิทธิ์ได้')
    }
  }

  async loadAnalyticsPage() {
    try {
      console.log('📈 Loading Analytics Page...')
      
      if (!this.authService.getToken() || !this.authService.isTokenValid()) {
        this.router.navigate('/login')
        return
      }

      this.renderBasicPage('Analytics', 'การวิเคราะห์ข้อมูล - กำลังพัฒนา')
      // this.updateNavigation(true) // ปิดไว้เพราะมี nav ในตัวแล้ว
      
    } catch (error) {
      console.error('Error loading analytics:', error)
      this.showError('ไม่สามารถโหลดหน้าการวิเคราะห์ได้')
    }
  }

  async loadAdminPage() {
    try {
      console.log('⚙️ Loading Admin Page...')
      
      if (!this.authService.getToken() || !this.authService.isTokenValid()) {
        this.router.navigate('/login')
        return
      }

      this.renderBasicPage('Admin', 'การจัดการระบบ - กำลังพัฒนา')
      // this.updateNavigation(true) // ปิดไว้เพราะมี nav ในตัวแล้ว
      
    } catch (error) {
      console.error('Error loading admin:', error)
      this.showError('ไม่สามารถโหลดหน้าการจัดการได้')
    }
  }

  // Helper Functions for Page Rendering
  renderBasicDashboard() {
    const app = document.getElementById('app')
    app.innerHTML = `
      <div class="min-h-screen bg-gray-50">
        <!-- Navigation -->
        <nav class="bg-white shadow-sm">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-16">
              <div class="flex items-center">
                <h1 class="text-xl font-semibold text-gray-900">ระบบสมุดพก</h1>
              </div>
              <div class="flex items-center space-x-4">
                <button onclick="SmartPortDebug.navigate('/candidates')" class="text-blue-600 hover:text-blue-800">
                  รายชื่อผู้มีศักยภาพ
                </button>
                <button onclick="SmartPortDebug.navigate('/analytics')" class="text-blue-600 hover:text-blue-800">
                  การวิเคราะห์
                </button>
                <button onclick="SmartPortDebug.navigate('/admin')" class="text-blue-600 hover:text-blue-800">
                  การจัดการ
                </button>
                <button onclick="SmartPortDebug.getAuth().logout(); SmartPortDebug.navigate('/login')" 
                        class="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">
                  ออกจากระบบ
                </button>
              </div>
            </div>
          </div>
        </nav>

        <!-- Main Content -->
        <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div class="px-4 py-6 sm:px-0">
            <div class="bg-white overflow-hidden shadow rounded-lg">
              <div class="px-4 py-5 sm:p-6">
                <h2 class="text-lg font-medium text-gray-900 mb-4">แดชบอร์ดหลัก</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div class="bg-blue-50 p-6 rounded-lg">
                    <h3 class="text-lg font-semibold text-blue-900">จำนวนข้าราชการทั้งหมด</h3>
                    <p class="text-3xl font-bold text-blue-600 mt-2">1,234</p>
                  </div>
                  <div class="bg-green-50 p-6 rounded-lg">
                    <h3 class="text-lg font-semibold text-green-900">ผู้มีศักยภาพ</h3>
                    <p class="text-3xl font-bold text-green-600 mt-2">156</p>
                  </div>
                  <div class="bg-orange-50 p-6 rounded-lg">
                    <h3 class="text-lg font-semibold text-orange-900">เกษียณอายุในปีนี้</h3>
                    <p class="text-3xl font-bold text-orange-600 mt-2">23</p>
                  </div>
                </div>
                <div class="mt-8">
                  <h3 class="text-lg font-medium text-gray-900 mb-4">ฟีเจอร์ที่พร้อมใช้งาน</h3>
                  <div class="space-y-2">
                    <p class="text-green-600">✅ ระบบเข้าสู่ระบบ และการยืนยันตัวตน</p>
                    <p class="text-green-600">✅ การนำทางพื้นฐาน (Routing)</p>
                    <p class="text-green-600">✅ การเชื่อมต่อ API Backend</p>
                    <p class="text-yellow-600">🚧 การจัดการข้อมูลข้าราชการ (กำลังพัฒนา)</p>
                    <p class="text-yellow-600">🚧 การวิเคราะห์ข้อมูล (กำลังพัฒนา)</p>
                    <p class="text-yellow-600">🚧 ระบบจัดการภาพถ่าย (กำลังพัฒนา)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    `
  }

  renderBasicPage(title, content) {
    const app = document.getElementById('app')
    app.innerHTML = `
      <div class="min-h-screen bg-gray-50">
        <!-- Navigation -->
        <nav class="bg-white shadow-sm">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-16">
              <div class="flex items-center">
                <button onclick="SmartPortDebug.navigate('/dashboard')" class="text-blue-600 hover:text-blue-800 mr-4">
                  ← กลับหน้าแรก
                </button>
                <h1 class="text-xl font-semibold text-gray-900">${title}</h1>
              </div>
              <div class="flex items-center">
                <button onclick="SmartPortDebug.getAuth().logout(); SmartPortDebug.navigate('/login')" 
                        class="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">
                  ออกจากระบบ
                </button>
              </div>
            </div>
          </div>
        </nav>

        <!-- Main Content -->
        <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div class="px-4 py-6 sm:px-0">
            <div class="bg-white overflow-hidden shadow rounded-lg">
              <div class="px-4 py-5 sm:p-6">
                <h2 class="text-lg font-medium text-gray-900 mb-4">${title}</h2>
                <p class="text-gray-600">${content}</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    `
  }

  showLoading(show) {
    if (window.modernLoading) {
      if (show) {
        window.modernLoading.show()
      } else {
        window.modernLoading.hide()
      }
    } else {
      // Fallback for old loading screen
      const loadingScreen = document.getElementById('loading-screen')
      if (loadingScreen) {
        loadingScreen.classList.toggle('hidden', !show)
      }
    }
    this.isLoading = show
  }

  showError(message) {
    this.uiComponents.showToast(message, 'error')
  }

  showSuccess(message) {
    this.uiComponents.showToast(message, 'success')
  }

  updateNavigation(showNav = null) {
    // Use parameter if provided, otherwise check user status
    const shouldShow = showNav !== null ? showNav : !!this.currentUser
    
    const navbar = document.getElementById('navbar')
    const footer = document.getElementById('footer')
    
    if (navbar) {
      if (shouldShow) {
        navbar.classList.remove('hidden')
      } else {
        navbar.classList.add('hidden')
      }
    }
    
    if (footer) {
      if (shouldShow) {
        footer.classList.remove('hidden')
      } else {
        footer.classList.add('hidden')
      }
    }
    
    // Only call renderNavigation if navbar exists and should be shown
    if (shouldShow && navbar && typeof this.renderNavigation === 'function') {
      this.renderNavigation()
    }
  }

  renderNavigation() {
    const navbar = document.getElementById('navbar')
    
    // Check if navbar element exists
    if (!navbar) {
      console.warn('⚠️ Navbar element not found, skipping navigation render')
      return
    }
    
    navbar.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center">
            <img class="h-8 w-auto" src="/logo.svg" alt="Smart Port">
            <span class="ml-2 text-xl font-semibold text-gray-900">ระบบสมุดพก</span>
          </div>
          <div class="flex items-center space-x-4">
            <nav class="hidden md:flex space-x-8">
              <a href="/dashboard" class="nav-link">แดชบอร์ด</a>
              <a href="/candidates" class="nav-link">ค้นหาผู้สมัคร</a>
              <a href="/analytics" class="nav-link">วิเคราะห์ข้อมูล</a>
              <a href="/admin" class="nav-link">จัดการระบบ</a>
            </nav>
            <div class="relative">
              <button id="user-menu" class="flex items-center space-x-2 text-gray-700 hover:text-gray-900">
                <span class="material-icons">account_circle</span>
                <span>${this.currentUser?.name || 'ผู้ใช้'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `
  }

  cleanup() {
    console.log('🧹 Cleaning up application...')
  }
}

// Initialize application
const app = new SmartPortApp()

// Make app globally available for debugging
window.smartPort = app

export default app
