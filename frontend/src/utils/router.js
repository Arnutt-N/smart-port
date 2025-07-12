// Template-based Router for SPA
export class Router {
  constructor() {
    this.routes = new Map()
    this.currentRoute = null
    this.params = {}
  }

  addRoute(path, handler) {
    this.routes.set(path, handler)
  }

  navigate(path) {
    window.history.pushState({}, '', path)
    this.handleRoute(path)
  }

  handleRoute(path = window.location.pathname) {
    // Find matching route
    const { route, params } = this.matchRoute(path)
    
    if (route) {
      this.currentRoute = route
      this.params = params
      
      // Call route handler
      const handler = this.routes.get(route)
      if (handler) {
        handler(params)
      }
    } else {
      // Handle 404
      this.handle404()
    }
  }

  matchRoute(path) {
    for (const [route] of this.routes) {
      const routeRegex = this.routeToRegex(route)
      const match = path.match(routeRegex)
      
      if (match) {
        const params = this.extractParams(route, match)
        return { route, params }
      }
    }
    
    return { route: null, params: {} }
  }

  routeToRegex(route) {
    // Convert route pattern to regex
    const regexStr = route
      .replace(/:\w+/g, '([^/]+)')
      .replace(/\//g, '\\/')
    
    return new RegExp(`^${regexStr}$`)
  }

  extractParams(route, match) {
    const params = {}
    const paramNames = route.match(/:(\w+)/g)
    
    if (paramNames) {
      paramNames.forEach((param, index) => {
        const paramName = param.substring(1)
        params[paramName] = match[index + 1]
      })
    }
    
    return params
  }

  handle404() {
    console.warn('404: Route not found')
    this.navigate('/login')
  }

  start() {
    // Handle browser back/forward
    window.addEventListener('popstate', () => {
      this.handleRoute()
    })

    // Handle initial route
    this.handleRoute()
  }
}
