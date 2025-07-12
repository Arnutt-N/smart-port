// Modern UI Components Library
export class UIComponents {
  constructor() {
    this.toastContainer = null
    this.modalContainer = null
    this.init()
  }

  init() {
    this.toastContainer = document.getElementById('toast-container')
    this.modalContainer = document.getElementById('modal-container')
  }

  showToast(message, type = 'info', duration = 5000) {
    const toast = this.createToast(message, type)
    this.toastContainer.appendChild(toast)

    setTimeout(() => {
      this.removeToast(toast)
    }, duration)

    return toast
  }

  createToast(message, type) {
    const toast = document.createElement('div')
    const typeClasses = {
      success: 'bg-green-500 text-white',
      error: 'bg-red-500 text-white',
      warning: 'bg-yellow-500 text-black',
      info: 'bg-blue-500 text-white'
    }

    toast.className = `
      ${typeClasses[type] || typeClasses.info}
      px-4 py-3 rounded-lg shadow-lg max-w-sm w-full
      transform transition-all duration-300 translate-x-full opacity-0
      flex items-center justify-between animate-slide-in
    `

    toast.innerHTML = `
      <div class="flex items-center">
        <span class="material-icons mr-2">${this.getToastIcon(type)}</span>
        <span>${message}</span>
      </div>
      <button class="ml-4 hover:opacity-75" onclick="this.parentElement.remove()">
        <span class="material-icons">close</span>
      </button>
    `

    setTimeout(() => {
      toast.classList.remove('translate-x-full', 'opacity-0')
    }, 10)

    return toast
  }

  getToastIcon(type) {
    const icons = {
      success: 'check_circle',
      error: 'error',
      warning: 'warning',
      info: 'info'
    }
    return icons[type] || icons.info
  }

  removeToast(toast) {
    toast.classList.add('translate-x-full', 'opacity-0')
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast)
      }
    }, 300)
  }

  showModal(content, options = {}) {
    const modal = this.createModal(content, options)
    this.modalContainer.appendChild(modal)
    this.modalContainer.classList.remove('hidden')
    
    document.body.style.overflow = 'hidden'
    
    return modal
  }

  createModal(content, options) {
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'
    
    modal.innerHTML = `
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full max-h-96 overflow-y-auto animate-fade-in">
        <div class="p-6">
          ${content}
        </div>
        ${options.showCloseButton !== false ? `
          <button class="absolute top-4 right-4 text-gray-500 hover:text-gray-700" onclick="this.closest('.fixed').remove(); document.body.style.overflow = 'auto'; document.getElementById('modal-container').classList.add('hidden')">
            <span class="material-icons">close</span>
          </button>
        ` : ''}
      </div>
    `
    
    if (options.closeOnClickOutside !== false) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeModal(modal)
        }
      })
    }
    
    return modal
  }

  closeModal(modal) {
    modal.remove()
    document.body.style.overflow = 'auto'
    this.modalContainer.classList.add('hidden')
  }
}
