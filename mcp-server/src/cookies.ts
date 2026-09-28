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
          expiresAt = Number.isNaN(s) ? expiresAt : Date.now() + s * 1000
        } else if (key === 'secure') {
          secure = true
        }
      }
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
      if (!parsed.pathname.startsWith(cookie.path)) continue
      pairs.push(`${name}=${cookie.value}`)
    }
    return pairs.length > 0 ? pairs.join('; ') : null
  }

  get(name: string): string | null {
    const cookie = this.store.get(name)
    if (!cookie || cookie.expiresAt <= Date.now()) return null
    return cookie.value
  }
}
