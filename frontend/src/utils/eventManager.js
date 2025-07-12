// Centralized Event Management System
export class EventManager {
  constructor() {
    this.events = new Map()
  }

  on(eventName, callback) {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, [])
    }
    
    this.events.get(eventName).push(callback)
    
    // Return unsubscribe function
    return () => this.off(eventName, callback)
  }

  off(eventName, callback) {
    if (!this.events.has(eventName)) return
    
    const callbacks = this.events.get(eventName)
    const index = callbacks.indexOf(callback)
    
    if (index > -1) {
      callbacks.splice(index, 1)
    }
    
    // Clean up empty event arrays
    if (callbacks.length === 0) {
      this.events.delete(eventName)
    }
  }

  emit(eventName, data = null) {
    if (!this.events.has(eventName)) return
    
    const callbacks = this.events.get(eventName)
    callbacks.forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error(`Error in event callback for ${eventName}:`, error)
      }
    })
  }

  once(eventName, callback) {
    const onceCallback = (data) => {
      callback(data)
      this.off(eventName, onceCallback)
    }
    
    this.on(eventName, onceCallback)
  }

  clear(eventName) {
    if (eventName) {
      this.events.delete(eventName)
    } else {
      this.events.clear()
    }
  }

  getEventNames() {
    return Array.from(this.events.keys())
  }

  getListenerCount(eventName) {
    return this.events.has(eventName) ? this.events.get(eventName).length : 0
  }
}
