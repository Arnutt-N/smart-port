import { getCurrentScope, onScopeDispose } from 'vue'

/**
 * Debounce a callback and clear the timer when the calling scope is disposed
 * (component unmount / effect scope end).
 *
 * After dispose, pending timers do not fire. For async work started inside `fn`,
 * pair with `useRequestSeq()` so post-await updates are ignored after unmount.
 *
 * @param {Function} fn
 * @param {number} [delay=300]
 * @returns {{ run: Function, cancel: Function }}
 */
export function useDebouncedCallback(fn, delay = 300) {
  let timer = null
  let disposed = false

  function cancel() {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function run(...args) {
    if (disposed) return
    cancel()
    timer = setTimeout(() => {
      timer = null
      if (disposed) return
      fn(...args)
    }, delay)
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      cancel()
    })
  }

  return { run, cancel }
}
