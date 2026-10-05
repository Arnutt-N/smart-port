// SmartPortClient — ห่อ REST API ด้วย cookie session ตามสัญญา service-account.md:
// login ครั้งแรกแบบ lazy, proactive refresh ก่อนหมดอายุ, 401 → refresh+retry ครั้งเดียว,
// single-flight กัน refresh ซ้อน (reuse ใบเก่าหลัง grace 10 วิ = kill-all ทุก session)
import { CookieJar } from './cookies.js'
import { logSession } from './logger.js'

const ACCESS_COOKIE = 'sp_access'
const REFRESH_EARLY_SECONDS = 300 // refresh ก่อนหมดอายุ 5 นาที
// Render free plan ตื่นจาก spin-down ~1 นาที (readyz แรกวัดได้ ~23s ยังไม่รวม login/ต่อ DB) — ต้องมีเพดานแต่ห้ามสั้นกว่านี้
const REQUEST_TIMEOUT_MS = 90_000
const LOGOUT_TIMEOUT_MS = 5_000 // shutdown ต้องไม่ค้างเพราะ server เงียบ
const TIMEOUT_MESSAGE = 'Smart Port API ไม่ตอบกลับภายในเวลาที่กำหนด — ลองใหม่ภายหลัง'
// undici ใส่ cause 'unexpected redirect' เมื่อเจอ 3xx ภายใต้ redirect:'error' — แยกจาก network error ทั่วไปให้ผู้ดูแลเห็นสาเหตุ (ไม่ echo Location)
const REDIRECT_MESSAGE =
  'Smart Port API ตอบกลับแบบ redirect — ระบบไม่ตามเพื่อกันรหัสผ่านรั่ว ตรวจ SMARTPORT_API_URL / การตั้งค่า hosting'

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError'
}

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

// ข้อความคงที่ตามสถานะ — ไม่มี body/URL (ถึง model ผ่าน toolErrorText)
function statusError(status: number): Error {
  if (status === 401) return new AuthError('เซสชันหมดอายุ — กรุณาลองใหม่อีกครั้ง')
  if (status === 403) return new AuthError('บัญชีนี้ไม่มีสิทธิ์อ่านข้อมูลนี้ (403)')
  if (status === 429) return new AuthError('ถูกจำกัดอัตราการเรียก (429) — ลองใหม่ภายหลัง')
  return new Error(`Smart Port API ผิดพลาด: HTTP ${status}`)
}

export class SmartPortClient {
  private jar = new CookieJar()
  private loggedIn = false
  private refreshFlight: Promise<void> | null = null
  private loginFlight: Promise<void> | null = null
  // MS-14: หลัง logout() ห้าม login/refresh flight ที่ค้างอยู่เติม cookie กลับเข้า jar
  private closed = false

  constructor(
    private readonly apiUrl: string,
    private readonly username: string,
    private readonly password: string,
  ) {}

  /** จุดเดียวที่ยิง HTTP: ห้าม redirect (guard M1/M2 ตรวจแค่ URL ที่ตั้งค่า) + มี timeout เสมอ */
  private async request(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
    try {
      return await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      if (isTimeout(error)) throw new Error(TIMEOUT_MESSAGE)
      if (error instanceof TypeError && (error.cause as Error | undefined)?.message === 'unexpected redirect') {
        throw new Error(REDIRECT_MESSAGE)
      }
      throw error
    }
  }

  /** ระบาย body ที่ไม่ใช้ — ไม่ปล่อยให้ connection ค้างรอ body ที่ไม่มีใครอ่าน */
  private discard(res: Response): void {
    void res.body?.cancel().catch(() => undefined)
  }

  private async login(): Promise<void> {
    const res = await this.request(`${this.apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.username, password: this.password }),
    })
    this.discard(res) // login ไม่อ่าน body ทุกกิ่ง
    if (res.status === 429) {
      logSession('login', false, 'http=429')
      throw new AuthError('ล็อกอินถูกจำกัดอัตรา (429) — รอ 15 นาทีแล้วลองใหม่')
    }
    if (!res.ok) {
      logSession('login', false, `http=${res.status}`)
      throw new AuthError('ล็อกอินไม่สำเร็จ — ตรวจ SP_SERVICE_USERNAME/SP_SERVICE_PASSWORD')
    }
    if (this.closed) return // logout() เริ่มไปแล้วระหว่างรอ — อย่าเติม jar กลับ
    this.jar.storeFromSetCookies(getSetCookies(res))
    this.loggedIn = true
    logSession('login', true)
  }

  private async refreshNow(): Promise<void> {
    const cookie = this.jar.headerFor(`${this.apiUrl}/auth/refresh`)
    const res = await this.request(`${this.apiUrl}/auth/refresh`, {
      method: 'POST',
      headers: cookie === null ? {} : { Cookie: cookie },
    })
    this.discard(res) // refresh ไม่อ่าน body ทุกกิ่ง
    if (!res.ok) {
      logSession('refresh', false, `http=${res.status}`)
      throw new AuthError('ต่ออายุ session ไม่สำเร็จ — ต้องล็อกอินใหม่')
    }
    if (this.closed) return // logout() เริ่มไปแล้วระหว่างรอ — อย่าเติม jar กลับ
    this.jar.storeFromSetCookies(getSetCookies(res))
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

  /** single-flight: กัน login ซ้อน (ซ้อน = cookie ทับกัน + เสี่ยง 429 lockout) */
  private loginSingleFlight(): Promise<void> {
    if (this.loginFlight === null) {
      this.loginFlight = this.login().finally(() => {
        this.loginFlight = null
      })
    }
    return this.loginFlight
  }

  private accessExpiringSoon(): boolean {
    const token = this.jar.get(ACCESS_COOKIE)
    if (token === null) return true
    const exp = decodeJwtExp(token)
    if (exp === null) return true
    return exp - Math.floor(Date.now() / 1000) < REFRESH_EARLY_SECONDS
  }

  private async ensureSession(): Promise<void> {
    if (this.closed) throw new Error('client ปิดแล้ว (logout) — ไม่รับคำขอใหม่')
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
    if (this.closed) throw new Error('client ปิดแล้ว (logout) — ไม่รับคำขอใหม่') // logout ระหว่างรอ flight
    const url = `${this.apiUrl}${path}`
    const send = async (): Promise<Response> => {
      const cookie = this.jar.headerFor(url)
      return this.request(url, { headers: cookie === null ? {} : { Cookie: cookie } })
    }
    let res = await send()
    if (res.status === 401) {
      // reactive: refresh ครั้งเดียวแล้ว retry ครั้งเดียว
      this.discard(res)
      try {
        await this.refreshSingleFlight()
      } catch {
        await this.loginSingleFlight()
      }
      if (this.closed) throw new Error('client ปิดแล้ว (logout) — ไม่รับคำขอใหม่')
      res = await send()
    }
    this.jar.storeFromSetCookies(getSetCookies(res))
    if (!res.ok) {
      this.discard(res)
      throw statusError(res.status)
    }
    try {
      return { status: res.status, json: (await res.json()) as T }
    } catch (error) {
      // signal เดียวกันคุมถึงตอนอ่าน body — timeout ตรงนี้ต้องไม่ถูกรายงานว่า 'ไม่ใช่ JSON'
      if (isTimeout(error)) throw new Error(TIMEOUT_MESSAGE)
      throw new Error('Smart Port API ตอบกลับไม่ใช่ JSON ที่อ่านได้') // ไม่ส่งต่อ SyntaxError เพราะ message อาจมีเศษ body
    }
  }

  async logout(): Promise<void> {
    // MS-14: ปิดรับทุก flight ใหม่/ค้างอยู่ก่อน — login/refresh ที่ settle ทีหลังจะไม่เติม jar
    this.closed = true
    // ไม่เคย login = ไม่มี session ให้ revoke (login ที่ยังวิ่งอยู่ก็ยังไม่มี cookie — ดู R7 ใน PRP)
    if (!this.loggedIn) {
      this.jar = new CookieJar()
      return
    }
    try {
      const cookie = this.jar.headerFor(`${this.apiUrl}/auth/logout`)
      const res = await this.request(
        `${this.apiUrl}/auth/logout`,
        { method: 'POST', headers: cookie === null ? {} : { Cookie: cookie } },
        LOGOUT_TIMEOUT_MS,
      )
      this.discard(res)
      logSession('logout', true)
    } catch {
      logSession('logout', false, 'network-error')
    } finally {
      // ล้างฝั่ง client เสมอ แม้ server ไม่ตอบ — ใช้ cookie ที่ถูก revoke (หรือกำลังถูก revoke) ต่อไม่ได้
      this.jar = new CookieJar()
      this.loggedIn = false
    }
  }
}
