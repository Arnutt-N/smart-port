import { getCurrentScope, onScopeDispose } from 'vue'

/**
 * Monotonic request sequence so async handlers can ignore stale responses.
 * Invalidates in-flight tokens when the calling scope is disposed (unmount).
 *
 * @returns {{ next: () => { id: number, isCurrent: () => boolean } }}
 */
export function useRequestSeq() {
  let current = 0

  function next() {
    current += 1
    const id = current
    return {
      id,
      isCurrent: () => id === current,
    }
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      current += 1
    })
  }

  return { next }
}
