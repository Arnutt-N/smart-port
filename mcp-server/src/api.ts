// SmartPortClient — ห่อ REST API ด้วย cookie session ตามสัญญา service-account.md:
// login ครั้งแรกแบบ lazy, proactive refresh ก่อนหมดอายุ, 401 → refresh+retry ครั้งเดียว,
// single-flight กัน refresh ซ้อน (reuse ใบเก่าหลัง grace 10 วิ = kill-all ทุก session)
import { CookieJar } from './cookies.js'
import { logSession } from './logger.js'

const ACCESS_COOKIE = 'sp_access'
const REFRESH_EARLY_SECONDS = 300 // refresh ก่อนหมดอายุ 5 นาที

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
  return typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []
}

export class SmartPortClient {
  private jar = new CookieJar()
  private loggedIn = false
  private refreshFlight: Promise<void> | null = null

  constructor(
    private readonly apiUrl: string,
    private readonly username: string,
    private readonly password: string,
  ) {}

  private async login(): Promise<void> {
    const res = await fetch(`${this.apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.username, password: this.password }),
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
      await this.login()
      return
    }
    if (this.accessExpiringSoon()) {
      try {
        await this.refreshSingleFlight()
      } catch {
        await this.login() // refresh ใช้ไม่ได้แล้ว → login ใหม่ทั้งชุด
      }
    }
  }

  async get<T = unknown>(path: string): Promise<{ status: number, json: T }> {
    await this.ensureSession()
    const url = `${this.apiUrl}${path}`
    const send = async (): Promise<Response> => {
      const cookie = this.jar.headerFor(url)
      return fetch(url, { headers: cookie === null ? {} : { Cookie: cookie } })
    }
    let res = await send()
    if (res.status === 401) {
      // reactive: refresh ครั้งเดียวแล้ว retry ครั้งเดียว
      try {
        await this.refreshSingleFlight()
      } catch {
        await this.login()
      }
      res = await send()
    }
    this.jar.storeFromSetCookies(getSetCookies(res))
    if (res.status === 401) throw new AuthError('เซสชันหมดอายุ — กรุณาลองใหม่อีกครั้ง')
    if (res.status === 403) throw new AuthError('บัญชีนี้ไม่มีสิทธิ์อ่านข้อมูลนี้ (403)')
    if (res.status === 429) throw new AuthError('ถูกจำกัดอัตราการเรียก (429) — ลองใหม่ภายหลัง')
    if (!res.ok) throw new Error(`Smart Port API ผิดพลาด: HTTP ${res.status}`)
    return { status: res.status, json: (await res.json()) as T }
  }

  async logout(): Promise<void> {
    try {
      const cookie = this.jar.headerFor(`${this.apiUrl}/auth/logout`)
      await fetch(`${this.apiUrl}/auth/logout`, {
        method: 'POST',
        headers: cookie === null ? {} : { Cookie: cookie },
      })
      logSession('logout', true)
    } catch {
      logSession('logout', false, 'network-error')
    }
  }
}
