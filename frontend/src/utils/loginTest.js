// Test login functionality
console.log('🧪 Testing Login Functionality')

// Function to test login manually
window.testLogin = () => {
  console.log('🔐 Manual login test')
  
  const email = document.getElementById('email')
  const password = document.getElementById('password')
  const form = document.getElementById('loginForm')
  
  if (!email || !password || !form) {
    console.error('❌ Form elements not found')
    return
  }
  
  email.value = 'admin@smartport.com'
  password.value = 'password123'
  
  console.log('📧 Email set:', email.value)
  console.log('🔑 Password set:', password.value)
  
  // Trigger submit event
  const submitEvent = new Event('submit', { bubbles: true, cancelable: true })
  form.dispatchEvent(submitEvent)
  
  console.log('📤 Submit event dispatched')
}

// Function to directly login
window.directLogin = () => {
  console.log('🚀 Direct login bypass')
  
  // Set demo token
  localStorage.setItem('authToken', 'demo-token-' + Date.now())
  localStorage.setItem('refreshToken', 'demo-refresh-token-' + Date.now())
  
  // Navigate to dashboard
  if (window.SmartPortDebug) {
    SmartPortDebug.navigate('/dashboard')
  } else {
    window.location.hash = '/dashboard'
    window.location.reload()
  }
}

console.log('🛠️ Login test functions loaded')
console.log('📝 Available commands:')
console.log('   testLogin() - Test form submission')
console.log('   directLogin() - Skip login and go to dashboard')
