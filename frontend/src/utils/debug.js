// Debug helper for development
window.SmartPortDebug = {
  app: null,
  
  init(app) {
    this.app = app
    console.log('🔧 Debug mode enabled')
  },
  
  getRouter() {
    return this.app?.router
  },
  
  getAuth() {
    return this.app?.authService
  },
  
  navigate(path) {
    this.app?.router?.navigate(path)
  },
  
  checkAuth() {
    const auth = this.getAuth()
    if (auth) {
      console.log('🔐 Auth Status:')
      console.log('  Token:', auth.getToken())
      console.log('  Valid:', auth.isTokenValid())
      console.log('  User:', auth.user)
      console.log('  localStorage tokens:', {
        authToken: localStorage.getItem('authToken'),
        refreshToken: localStorage.getItem('refreshToken'),
        user: localStorage.getItem('user')
      })
    }
  },
  
  clearAuth() {
    const auth = this.getAuth()
    if (auth) {
      auth.logout()
      console.log('🧹 Auth cleared')
    }
  }
}
