// Smart Port Management System - Main Application
import '../style.css'
import { Router } from './utils/router.js'
import { EventManager } from './utils/eventManager.js'
import { AuthService } from './services/authService.js'
import { ApiService } from './services/apiService.js'
import { UIComponents } from './components/uiComponents.js'

class SmartPortApp {
  constructor() {
    this.router = new Router()
    this.eventManager = new EventManager()
    this.authService = new AuthService()
    this.apiService = new ApiService()
    this.uiComponents = new UIComponents()
    
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

  showLoading(show) {
    const loadingScreen = document.getElementById('loading-screen')
    if (loadingScreen) {
      loadingScreen.classList.toggle('hidden', !show)
    }
    this.isLoading = show
  }

  showError(message) {
    this.uiComponents.showToast(message, 'error')
  }

  showSuccess(message) {
    this.uiComponents.showToast(message, 'success')
  }

  updateNavigation() {
    const navbar = document.getElementById('navbar')
    const footer = document.getElementById('footer')
    
    if (this.currentUser) {
      navbar.classList.remove('hidden')
      footer.classList.remove('hidden')
      this.renderNavigation()
    } else {
      navbar.classList.add('hidden')
      footer.classList.add('hidden')
    }
  }

  renderNavigation() {
    const navbar = document.getElementById('navbar')
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
