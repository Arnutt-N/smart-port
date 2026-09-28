import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthError, SmartPortClient } from '../src/api.js'

// JWT จำลอง: payload base64url ตามที่ decodeJwtExp แกะ
function jwtWithExp(exp: number | string | null): string {
  const payload = exp === null ? {} : { exp }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `hdr.${body}.sig`
}

interface FetchCall {
  url: string
  init: RequestInit | undefined
}

function mockFetch(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const calls: FetchCall[] = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return handler(url, init)
  })
  vi.stubGlobal('fetch', fn)
  return { calls, fn }
}

function jsonRes(status: number, body: unknown, setCookies: string[] = []): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  for (const c of setCookies) headers.append('set-cookie', c)
  return new Response(JSON.stringify(body), { status, headers })
}

const BASE = 'http://x/api'
const ACCESS_FAR = jwtWithExp(Math.floor(Date.now() / 1000) + 3600)

describe('SmartPortClient', () => {
  beforeEach(() => vi.useRealTimers())
  afterEach(() => vi.unstubAllGlobals())

  it('get() แรก = login แล้วส่ง cookie; concurrent get() สองตัว login รอบเดียว (single-flight)', async () => {
    let logins = 0
    const { calls, fn } = mockFetch((url, init) => {
      if (url.endsWith('/auth/login')) {
        logins += 1
        return jsonRes(200, { success: true }, [`sp_access=${ACCESS_FAR}; Path=/`])
      }
      return jsonRes(200, { success: true, n: 1 })
    })
    const api = new SmartPortClient(BASE, 'u', 'p')
    await Promise.all([api.get('/dashboard'), api.get('/probation')])
    expect(logins).toBe(1)
    const gets = calls.filter((c) => !c.url.includes('/auth/'))
    expect(gets).toHaveLength(2)
    expect(gets.every((c) => (c.init?.headers as Record<string, string>)?.Cookie === `sp_access=${ACCESS_FAR}`)).toBe(true)
    expect(fn).toHaveBeenCalledTimes(3) // 1 login + 2 get
  })

  it('401 → refresh ครั้งเดียว → retry ครั้งเดียว; ยัง 401 = AuthError (ไม่ loop)', async () => {
    let refreshes = 0
    mockFetch((url) => {
      if (url.endsWith('/auth/login')) return jsonRes(200, { success: true }, [`sp_access=${ACCESS_FAR}; Path=/`])
      if (url.endsWith('/auth/refresh')) {
        refreshes += 1
        return jsonRes(200, { success: true }, [`sp_access=${ACCESS_FAR}; Path=/`])
      }
      return jsonRes(401, { success: false })
    })
    const api = new SmartPortClient(BASE, 'u', 'p')
    await expect(api.get('/dashboard')).rejects.toThrow(AuthError)
    expect(refreshes).toBe(1)
  })

  it('refresh ล้ม → login fallback แล้ว retry สำเร็จ', async () => {
    let logins = 0
    let refreshes = 0
    let gets = 0
    mockFetch((url) => {
      if (url.endsWith('/auth/login')) {
        logins += 1
        return jsonRes(200, { success: true }, [`sp_access=${ACCESS_FAR}; Path=/`])
      }
      if (url.endsWith('/auth/refresh')) {
        refreshes += 1
        return jsonRes(500, { success: false })
      }
      gets += 1
      return gets === 1 ? jsonRes(401, { success: false }) : jsonRes(200, { success: true, n: 7 })
    })
    const api = new SmartPortClient(BASE, 'u', 'p')
    const r = await api.get('/dashboard')
    expect(r.json).toEqual({ success: true, n: 7 })
    expect(logins).toBe(2) // รอบแรก + fallback
    expect(refreshes).toBe(1)
    expect(gets).toBe(2)
  })

  it('decodeJwtExp: token ไม่ใช่ 3 ส่วน / exp ไม่ใช่ number / exp ไม่มี → force refresh ทุกกรณี', async () => {
    for (const token of ['not-a-jwt', jwtWithExp('soon'), jwtWithExp(null), jwtWithExp(-10)]) {
      let refreshes = 0
      mockFetch((url) => {
        if (url.endsWith('/auth/login')) return jsonRes(200, { success: true }, [`sp_access=${token}; Path=/`])
        if (url.endsWith('/auth/refresh')) {
          refreshes += 1
          return jsonRes(200, { success: true }, [`sp_access=${token}; Path=/`])
        }
        return jsonRes(200, { success: true })
      })
      const api = new SmartPortClient(BASE, 'u', 'p')
      await api.get('/dashboard')
      await api.get('/dashboard') // รอบสอง: exp ไม่ได้ = ต้อง refresh
      expect(refreshes, `token=${token}`).toBe(1)
    }
  })

  it('exp เหลือ 299 วิ = refresh ก่อน; เหลือ 301 วิ = ไม่ต้อง refresh', async () => {
    for (const [lead, expectRefresh] of [
      [299, 1],
      [301, 0],
    ] as const) {
      let refreshes = 0
      mockFetch((url) => {
        if (url.endsWith('/auth/login')) {
          return jsonRes(200, { success: true }, [
            `sp_access=${jwtWithExp(Math.floor(Date.now() / 1000) + lead)}; Path=/`,
          ])
        }
        if (url.endsWith('/auth/refresh')) {
          refreshes += 1
          return jsonRes(200, { success: true }, [`sp_access=${ACCESS_FAR}; Path=/`])
        }
        return jsonRes(200, { success: true })
      })
      const api = new SmartPortClient(BASE, 'u', 'p')
      await api.get('/a')
      await api.get('/b')
      expect(refreshes, `lead=${lead}`).toBe(expectRefresh)
    }
  })

  it('logout ล้าง state — get() หลัง logout ต้อง login ใหม่ ไม่ใช่ยืม cookie ตาย', async () => {
    let logins = 0
    mockFetch((url) => {
      if (url.endsWith('/auth/login')) {
        logins += 1
        return jsonRes(200, { success: true }, [`sp_access=${ACCESS_FAR}; Path=/`])
      }
      return jsonRes(200, { success: true })
    })
    const api = new SmartPortClient(BASE, 'u', 'p')
    await api.get('/a')
    await api.logout()
    await api.get('/b')
    expect(logins).toBe(2)
  })

  it('response 200 ที่ไม่ใช่ JSON = error ข้อความคงที่ (ไม่หลุด message ของ parser)', async () => {
    mockFetch((url) => {
      if (url.endsWith('/auth/login')) return jsonRes(200, { success: true }, [`sp_access=${ACCESS_FAR}; Path=/`])
      return new Response('<html>oops</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    })
    const api = new SmartPortClient(BASE, 'u', 'p')
    await expect(api.get('/dashboard')).rejects.toThrow('การตอบกลับจาก API ไม่ใช่ JSON')
  })

  it('429 ตอน login = AuthError บอกให้รอ (ไม่ retry เอง)', async () => {
    mockFetch(() => jsonRes(429, { success: false }))
    const api = new SmartPortClient(BASE, 'u', 'p')
    await expect(api.get('/x')).rejects.toThrow(AuthError)
    await expect(api.get('/x')).rejects.toThrow('429')
  })
})
