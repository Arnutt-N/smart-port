// SmartPortClient — ห่อ REST API ด้วย cookie session ตามสัญญา service-account.md:
// login ครั้งแรกแบบ lazy, proactive refresh ก่อนหมดอายุ, 401 → refresh+retry ครั้งเดียว,
// single-flight กัน refresh ซ้อน (reuse ใบเก่าหลัง grace 10 วิ = kill-all ทุก session)
import { CookieJar } from './cookies.js'
import { logSession } from './logger.js'

const ACCESS_COOKIE = 'sp_access'
const REFRESH_EARLY_SECONDS = 300 // refresh ก่อนหมดอายุ 5 นาที
const FETCH_TIMEOUT_MS = 15_000 // เท่า authCookieClient.mjs — กัน API hang = tool call ค้าง

export class AuthError extends Error {}

function decodeJwtExp(token: string): number | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { exp?: unknown }
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

function getSetCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof headers.getSetCookie !== 'function') {
    // Node >= 20 มีครบ — ถ้าหาย = cookie หายเงียบทุก response (login สำเร็จแต่ anonymous)
    console.error('[api] headers.getSetCookie หาย — cookie จะไม่ถูกเก็บ (ต้องใช้ Node >= 20)')
    return []
  }
  return headers.getSetCookie()
}

export class SmartPortClient {
  private jar = new CookieJar()
  private loggedIn = false
  private refreshFlight: Promise<void> | null = null
  private loginFlight: Promise<void> | null = null

  constructor(
    private readonly apiUrl: string,
    private readonly username: string,
    private readonly password: string,
  ) {}

  /** single-flight login — MCP client ยิง tool ขนานได้ batch แรก อย่า login ซ้อน (เปลือง rate limit 60/min) */
  private loginSingleFlight(): Promise<void> {
    if (this.loginFlight === null) {
      this.loginFlight = this.login().finally(() => {
        this.loginFlight = null
      })
    }
    return this.loginFlight
  }

  private async login(): Promise<void> {
    const res = await fetch(`${this.apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.username, password: this.password }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    this.jar.storeFromSetCookies(getSetCookies(res))
    if (res.status === 429) {
      logSession('login', false, 'http=429')
      throw new AuthError('ล็อกอินถูกจำกัดอัตรา (429) — รอ 15 นาทีแล้วลองใหม่')
    }
    if (!res.ok) {
      logSession('login', false, `http=${res.status}`)
      throw new AuthError('ล็อกอินไม่สำเร็จ — ตรวจ SP_SERVICE_USERNAME/SP_SERVICE_PASSWORD')
    }
    this.loggedIn = true
    logSession('login', true)
  }

  private async refreshNow(): Promise<void> {
    const cookie = this.jar.headerFor(`${this.apiUrl}/auth/refresh`)
    const res = await fetch(`${this.apiUrl}/auth/refresh`, {
      method: 'POST',
      headers: cookie === null ? {} : { Cookie: cookie },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    this.jar.storeFromSetCookies(getSetCookies(res))
    if (!res.ok) {
      logSession('refresh', false, `http=${res.status}`)
      throw new AuthError('ต่ออายุ session ไม่สำเร็จ — ต้องล็อกอินใหม่')
    }
    logSession('refresh', true)
  }

  /** single-flight: กัน refresh ซ้อน (reuse = kill-all) */
  private refreshSingleFlight(): Promise<void> {
    if (this.refreshFlight === null) {
      this.refreshFlight = this.refreshNow().finally(() => {
        this.refreshFlight = null
      })
    }
    return this.refreshFlight
  }

  private accessExpiringSoon(): boolean {
    const token = this.jar.get(ACCESS_COOKIE)
    if (token === null) return true
    const exp = decodeJwtExp(token)
    if (exp === null) return true
    return exp - Math.floor(Date.now() / 1000) < REFRESH_EARLY_SECONDS
  }

  private async ensureSession(): Promise<void> {
    if (!this.loggedIn) {
      await this.loginSingleFlight()
      return
    }
    if (this.accessExpiringSoon()) {
      try {
        await this.refreshSingleFlight()
      } catch {
        await this.loginSingleFlight() // refresh ใช้ไม่ได้แล้ว → login ใหม่ทั้งชุด
      }
    }
  }

  async get<T = unknown>(path: string): Promise<{ status: number, json: T }> {
    await this.ensureSession()
    const url = `${this.apiUrl}${path}`
    const send = async (): Promise<Response> => {
      const cookie = this.jar.headerFor(url)
      return fetch(url, {
        headers: cookie === null ? {} : { Cookie: cookie },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
    }
    let res = await send()
    this.jar.storeFromSetCookies(getSetCookies(res)) // เก็บทุกรอบ — 401 แรกก็อาจมี Set-Cookie ล้าง session
    if (res.status === 401) {
      // reactive: refresh ครั้งเดียวแล้ว retry ครั้งเดียว
      try {
        await this.refreshSingleFlight()
      } catch {
        await this.loginSingleFlight()
      }
      res = await send()
      this.jar.storeFromSetCookies(getSetCookies(res))
    }
    if (res.status === 401) throw new AuthError('เซสชันหมดอายุ — กรุณาลองใหม่อีกครั้ง')
    if (res.status === 403) throw new AuthError('บัญชีนี้ไม่มีสิทธิ์อ่านข้อมูลนี้ (403)')
    if (res.status === 429) throw new AuthError('ถูกจำกัดอัตราการเรียก (429) — ลองใหม่ภายหลัง')
    if (!res.ok) throw new Error(`Smart Port API ผิดพลาด: HTTP ${res.status}`)
    try {
      return { status: res.status, json: (await res.json()) as T }
    } catch {
      // ไม่หลุด message ของ V8 (อาจมี snippet ของ body) ไปเป็น tool error text
      throw new Error('การตอบกลับจาก API ไม่ใช่ JSON')
    }
  }

  async logout(): Promise<void> {
    try {
      const cookie = this.jar.headerFor(`${this.apiUrl}/auth/logout`)
      await fetch(`${this.apiUrl}/auth/logout`, {
        method: 'POST',
        headers: cookie === null ? {} : { Cookie: cookie },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      logSession('logout', true)
    } catch {
      logSession('logout', false, 'network-error')
    } finally {
      // เคลียร์ state — get() หลัง logout ต้อง login ใหม่ ไม่ใช่ยืม cookie ตายเงียบ ๆ
      this.loggedIn = false
      this.jar.clear()
    }
  }
}
