// Modern API Service with Axios-like interface
export class ApiService {
  constructor() {
    this.baseURL = ''
    this.defaultHeaders = {
      'Content-Type': 'application/json'
    }
    this.requestInterceptor = null
    this.responseInterceptor = null
    this.errorInterceptor = null
  }

  setBaseURL(url) {
    this.baseURL = url.replace(/\/$/, '')
  }

  setupInterceptors(requestInterceptor, responseInterceptor, errorInterceptor) {
    this.requestInterceptor = requestInterceptor
    this.responseInterceptor = responseInterceptor
    this.errorInterceptor = errorInterceptor
  }

  async request(config) {
    if (this.requestInterceptor) {
      config = this.requestInterceptor(config) || config
    }

    const url = config.url.startsWith('http') 
      ? config.url 
      : `${this.baseURL}${config.url}`

    const options = {
      method: config.method || 'GET',
      headers: {
        ...this.defaultHeaders,
        ...config.headers
      }
    }

    if (config.data) {
      if (config.data instanceof FormData) {
        delete options.headers['Content-Type']
        options.body = config.data
      } else {
        options.body = JSON.stringify(config.data)
      }
    }

    try {
      const response = await fetch(url, options)
      
      const result = {
        data: null,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      }

      if (response.ok) {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          result.data = await response.json()
        } else {
          result.data = await response.text()
        }
      } else {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`)
        error.response = result
        throw error
      }

      return this.responseInterceptor ? this.responseInterceptor(result) : result

    } catch (error) {
      if (this.errorInterceptor) {
        return this.errorInterceptor(error)
      }
      throw error
    }
  }

  // Convenience methods
  get(url, config = {}) {
    return this.request({ ...config, method: 'GET', url })
  }

  post(url, data, config = {}) {
    return this.request({ ...config, method: 'POST', url, data })
  }

  put(url, data, config = {}) {
    return this.request({ ...config, method: 'PUT', url, data })
  }

  delete(url, config = {}) {
    return this.request({ ...config, method: 'DELETE', url })
  }

  upload(url, formData, config = {}) {
    return this.request({
      ...config,
      method: 'POST',
      url,
      data: formData
    })
  }
}
