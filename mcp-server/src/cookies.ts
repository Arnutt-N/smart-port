// Minimal cookie jar — ไม่พึ่ง lib นอก (มีแค่ 2 ใบ: sp_access path=/, sp_refresh path=/api/auth)
// เคารพ Path/Secure/Expires — ไม่ตรง = ไม่ส่ง (prototype แต่ถูกตามสัญญา backend/auth.php)
interface StoredCookie {
  value: string
  path: string
  expiresAt: number // ms epoch, Infinity = session cookie
  secure: boolean
}

export class CookieJar {
  private store = new Map<string, StoredCookie>()

  /** เก็บจาก Set-Cookie headers (response.headers.getSetCookie()) */
  storeFromSetCookies(setCookies: string[]): void {
    for (const header of setCookies) {
      const parts = header.split(';').map((p) => p.trim())
      const [nameValue, ...attrs] = parts
      const eq = nameValue.indexOf('=')
      if (eq <= 0) continue
      const name = nameValue.slice(0, eq)
      const value = nameValue.slice(eq + 1)
      let path = '/'
      let expiresAt = Number.POSITIVE_INFINITY
      let secure = false
      let maxAgeSeconds: number | null = null
      for (const attr of attrs) {
        const [rawKey, ...rest] = attr.split('=')
        const key = rawKey.trim().toLowerCase()
        if (key === 'path') {
          path = rest.join('=').trim() || '/'
        } else if (key === 'expires') {
          const t = Date.parse(rest.join('=').trim())
          expiresAt = Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
        } else if (key === 'max-age') {
          const s = Number.parseInt(rest.join('=').trim(), 10)
          if (!Number.isNaN(s)) maxAgeSeconds = s
        } else if (key === 'secure') {
          secure = true
        }
      }
      // RFC 6265 §5.3: Max-Age มี priority ต่อ Expires ไม่ว่าลำดับ attribute จะเป็นยังไง
      if (maxAgeSeconds !== null) expiresAt = Date.now() + maxAgeSeconds * 1000
      if (expiresAt <= Date.now() || value === '') {
        this.store.delete(name) // ล้าง cookie (logout)
        continue
      }
      this.store.set(name, { value, path, expiresAt, secure })
    }
  }

  /** ประกอบ Cookie header สำหรับ url (เคารพ path/secure/expiry) */
  headerFor(url: string): string | null {
    const parsed = new URL(url)
    const pairs: string[] = []
    for (const [name, cookie] of this.store) {
      if (cookie.expiresAt <= Date.now()) {
        this.store.delete(name)
        continue
      }
      if (cookie.secure && parsed.protocol !== 'https:') continue
      if (!cookiePathMatches(cookie.path, parsed.pathname)) continue
      pairs.push(`${name}=${cookie.value}`)
    }
    return pairs.length > 0 ? pairs.join('; ') : null
  }

  /** ล้างทั้ง jar (logout) — กัน get() หลัง logout ยืม cookie ตาย */
  clear(): void {
    this.store.clear()
  }

  get(name: string): string | null {
    const cookie = this.store.get(name)
    if (!cookie || cookie.expiresAt <= Date.now()) return null
    return cookie.value
  }
}

/** path ของ request ตรงกับ cookie Path ตาม RFC 6265 §5.1.4 (boundary ด้วย / — กัน /api/auth ตรง /api/authors) */
function cookiePathMatches(cookiePath: string, requestPath: string): boolean {
  if (cookiePath === requestPath) return true
  if (cookiePath.endsWith('/')) return requestPath.startsWith(cookiePath)
  return requestPath.startsWith(`${cookiePath}/`)
}
