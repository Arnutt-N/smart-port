import { describe, test, expect, beforeEach } from 'vitest'
import { isChunkLoadError, shouldReloadForChunkError, RELOAD_WINDOW_MS } from '@/utils/chunkGuard.js'

function fakeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  }
}

describe('isChunkLoadError', () => {
  test('จับ error ของ Chrome/Vite เมื่อ chunk หายหลัง deploy ใหม่', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a.js'))).toBe(true)
  })

  test('จับ error ของ Firefox', () => {
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true)
  })

  test('จับ error ของ Safari', () => {
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
  })

  test('จับ CSS preload error ของ Vite', () => {
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true)
  })

  test('ไม่จับ error ทั่วไป', () => {
    expect(isChunkLoadError(new Error('Network request failed'))).toBe(false)
    expect(isChunkLoadError(new TypeError('x is not a function'))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })
})

describe('shouldReloadForChunkError', () => {
  let storage

  beforeEach(() => {
    storage = fakeStorage()
  })

  test('อนุญาต reload ครั้งแรกของ path', () => {
    expect(shouldReloadForChunkError('/dashboard', storage, 1_000_000)).toBe(true)
  })

  test('บล็อก reload ซ้ำ path เดิมภายใน window กัน reload วนลูป', () => {
    expect(shouldReloadForChunkError('/dashboard', storage, 1_000_000)).toBe(true)
    expect(shouldReloadForChunkError('/dashboard', storage, 1_000_000 + RELOAD_WINDOW_MS - 1)).toBe(false)
  })

  test('อนุญาต reload path เดิมอีกครั้งเมื่อพ้น window', () => {
    expect(shouldReloadForChunkError('/dashboard', storage, 1_000_000)).toBe(true)
    expect(shouldReloadForChunkError('/dashboard', storage, 1_000_000 + RELOAD_WINDOW_MS + 1)).toBe(true)
  })

  test('path ต่างกันนับแยกกัน', () => {
    expect(shouldReloadForChunkError('/dashboard', storage, 1_000_000)).toBe(true)
    expect(shouldReloadForChunkError('/audit', storage, 1_000_001)).toBe(true)
  })

  test('storage พัง (เช่น private mode) ต้องไม่ throw และยอมให้ reload ครั้งเดียว', () => {
    const broken = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    }
    expect(shouldReloadForChunkError('/dashboard', broken, 1_000_000)).toBe(true)
  })
})
