// กันอาการ "เปลี่ยนเมนูแล้วค้าง" หลัง deploy ใหม่: Render เก็บเฉพาะ build ล่าสุด
// ทำให้ chunk hash เก่าตอบ 404 — dynamic import พังและ Vue Router ยกเลิก navigation เงียบๆ
// ทางแก้คือ hard reload เพื่อดึง index.html ชุดใหม่ โดยมี window กัน reload วนลูป

export const RELOAD_WINDOW_MS = 30_000

const KEY_PREFIX = 'chunk-reload:'

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i, // Chrome/Edge
  /error loading dynamically imported module/i, // Firefox
  /importing a module script failed/i, // Safari
  /unable to preload css/i, // Vite CSS preload
]

export function isChunkLoadError(error) {
  const message = error?.message ?? ''
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

// fallback ในหน่วยความจำ สำหรับกรณี storage ใช้ไม่ได้ (เช่น Safari private mode)
const memoryFallback = new Map()

export function shouldReloadForChunkError(path, storage, now) {
  const key = KEY_PREFIX + path

  let last
  try {
    last = Number(storage?.getItem?.(key))
  } catch {
    last = memoryFallback.get(key) ?? 0
  }

  if (Number.isFinite(last) && last > 0 && now - last < RELOAD_WINDOW_MS) {
    return false
  }

  try {
    storage?.setItem?.(key, String(now))
  } catch {
    // storage เขียนไม่ได้ (เช่น private mode) — จดใน memory แทน
    memoryFallback.set(key, now)
  }
  return true
}

/**
 * ลำดับกู้คืนหลัง chunk พัง:
 * 1) reload หน้าเป้าหมาย (ดึง index ใหม่ถ้าเพิ่ง deploy)
 * 2) ถอย /dashboard
 * 3) ถอย / (กันกรณี dashboard chunk พังด้วย)
 */
export function resolveChunkRecoveryTarget(target, storage, now, fallbackPath = '/dashboard') {
  if (shouldReloadForChunkError(target, storage, now)) {
    return { action: 'reload-target', url: target }
  }
  if (
    target !== fallbackPath
    && shouldReloadForChunkError(`fallback:${fallbackPath}`, storage, now)
  ) {
    return { action: 'reload-fallback', url: fallbackPath }
  }
  if (shouldReloadForChunkError('fallback:/', storage, now)) {
    return { action: 'reload-root', url: '/' }
  }
  return { action: 'blocked', url: null }
}
