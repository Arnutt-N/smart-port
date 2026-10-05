import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SmartPortClient } from '../src/api.js'

const BASE = 'https://smart-port.onrender.com/api'
const fetchMock = vi.fn()

function jwt(secondsFromNow: number): string {
  const exp = Math.floor(Date.now() / 1000) + secondsFromNow
  return `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`
}

// accessTtlSeconds < 300 (REFRESH_EARLY_SECONDS ใน api.ts) ทำให้ accessExpiringSoon() จริง → เข้าเส้นทาง refresh
function loginResponse(accessTtlSeconds = 3600): Response {
  const headers = new Headers()
  headers.append('set-cookie', `sp_access=${jwt(accessTtlSeconds)}; Path=/; Max-Age=3600`)
  headers.append('set-cookie', 'sp_refresh=r1; Path=/api/auth; Max-Age=86400')
  return new Response('{}', { status: 200, headers })
}
const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status })
const newClient = (): SmartPortClient => new SmartPortClient(BASE, 'svc', 'pw')

// route ตาม path หลังตัด /api — route เป็นฟังก์ชันเพื่อให้ได้ Response ใหม่ทุกครั้ง (body อ่านได้ครั้งเดียว)
type Route = (url: string, init?: RequestInit) => Response | Promise<Response>
function routeFetch(routes: Record<string, Route>): void {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const route = routes[new URL(url).pathname.replace(/^\/api/, '')]
    if (route === undefined) throw new Error(`unrouted fetch: ${url}`)
    return route(url, init)
  })
}
const callsTo = (suffix: string): number =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith(suffix)).length
// Cookie header ของ call ที่ index i (api.ts ส่ง headers เป็น plain object — cast จำเป็นเมื่อตรวจชนิดของ test ด้วย tsc แบบ strict แยก — tsconfig.json ครอบแค่ src/**)
const cookieOfCall = (index: number): string =>
  ((fetchMock.mock.calls[index][1] as RequestInit).headers as Record<string, string>).Cookie
const indexesOf = (suffix: string): number[] =>
  fetchMock.mock.calls.flatMap(([url], index) => (String(url).endsWith(suffix) ? [index] : []))

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('request policy (MS-02 redirect / MS-06 timeout)', () => {
  it('ทุก fetch (login/get/logout) ตั้ง redirect:"error" และมี AbortSignal', async () => {
    routeFetch({
      '/auth/login': () => loginResponse(),
      '/dashboard': () => jsonResponse({ ok: true }),
      '/auth/logout': () => jsonResponse({}),
    })
    const client = newClient()
    await client.get('/dashboard')
    await client.logout()
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3)
    for (const [, init] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
      expect(init.redirect).toBe('error')
      expect(init.signal).toBeInstanceOf(AbortSignal)
    }
  })

  // JWT exp ของ cookie ที่ปนเปื้อน (7200) ต้องต่างจาก cookie ตอน login (3600) และต้อง > 300 วินาที:
  // ถ้าเป็นค่าที่ decode ไม่ได้ accessExpiringSoon() จะจริง → refresh ล้ม → re-login เขียนทับ jar ซ่อนการปนเปื้อน
  it('redirect ถูกปฏิเสธเป็น error และ cookie จากปลายทางไม่เข้า jar', async () => {
    routeFetch({
      '/auth/login': () => loginResponse(),
      '/other': () => jsonResponse({ ok: 1 }),
      '/dashboard': (_url, init) => {
        if (init?.redirect === 'error') throw new TypeError('fetch failed')
        return new Response(null, {
          status: 307,
          headers: { 'set-cookie': `sp_access=${jwt(7200)}; Path=/`, location: 'https://evil.example/' },
        })
      },
    })
    const client = newClient()
    await client.get('/other') // warm-up login
    const loginCookie = cookieOfCall(indexesOf('/other')[0])
    expect(loginCookie).toMatch(/^sp_access=/)

    await expect(client.get('/dashboard')).rejects.toThrow('fetch failed')
    await client.get('/other')

    const lastOther = indexesOf('/other').at(-1) as number
    expect(cookieOfCall(lastOther)).toBe(loginCookie)
    expect(callsTo('/auth/login')).toBe(1)
    expect(callsTo('/auth/refresh')).toBe(0)
  })

  it('TimeoutError ถูกแปลเป็นข้อความไทย', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort(new DOMException('timed out', 'TimeoutError')))
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => Promise.reject(init?.signal?.reason))
    // จับ error เอง: vitest `rejects.toThrow('…')` ผ่านแบบว่างเปล่าเมื่อค่าที่ reject เป็น undefined (เช่น ไม่มี signal เลย)
    const error = await newClient().get('/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('ไม่ตอบกลับ')
  })

  it('timeout 90s สำหรับ login+GET และ 5s สำหรับ logout (ตรวจลำดับ เพื่อให้แต่ละ request ถูกตรึงค่าเอง)', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    routeFetch({
      '/auth/login': () => loginResponse(),
      '/dashboard': () => jsonResponse({ ok: true }),
      '/auth/logout': () => jsonResponse({}),
    })
    const client = newClient()
    await client.get('/dashboard')
    await client.logout()
    // ลำดับคำขอ: login, GET, logout (logout ล็อกอินจริงก่อน เพราะ logout ตอนไม่ได้ login เป็น no-op)
    expect(timeoutSpy.mock.calls.map(([ms]) => ms)).toEqual([90_000, 90_000, 5_000])
  })

  it('refresh fetch ก็ผ่านจุดเดียวกัน: redirect:"error" + AbortSignal (เส้นทางที่ Set-Cookie เข้า jar ทันที)', async () => {
    routeFetch({
      '/auth/login': () => loginResponse(60), // ใกล้หมดอายุ → get ถัดไปต้อง refresh
      '/auth/refresh': () => loginResponse(),
      '/warm': () => jsonResponse({ ok: 1 }),
      '/dashboard': () => jsonResponse({ ok: 1 }),
    })
    const client = newClient()
    await client.get('/warm')
    await client.get('/dashboard')
    const refreshCalls = indexesOf('/auth/refresh')
    expect(refreshCalls).toHaveLength(1)
    const init = fetchMock.mock.calls[refreshCalls[0]][1] as RequestInit
    expect(init.redirect).toBe('error')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('redirect ที่ถูกปฏิเสธ (undici: fetch failed + cause unexpected redirect) → ข้อความไทยบอกสาเหตุ ไม่ปนกับ network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed', { cause: new Error('unexpected redirect') }))
    const error = (await newClient().get('/x').catch((e: unknown) => e)) as Error
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('redirect')
    expect(error.message).not.toContain('fetch failed')
  })

  it('error อื่นที่ไม่ใช่ timeout ถูกโยนต่อโดยไม่ถูกแปลง', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    const error = (await newClient().get('/x').catch((e: unknown) => e)) as Error
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('fetch failed')
    expect(error.message).not.toContain('ไม่ตอบกลับ')
  })
})

describe('session flights (MS-07)', () => {
  const okRoute: Route = () => jsonResponse({ ok: 1 })

  it('login single-flight: get พร้อมกัน 3 ตัวก่อน login เสร็จ → login ครั้งเดียว', async () => {
    const releases: Array<() => void> = []
    routeFetch({
      '/auth/login': () =>
        new Promise<Response>((resolve) => {
          releases.push(() => resolve(loginResponse()))
        }),
      '/a': okRoute,
      '/b': okRoute,
      '/c': okRoute,
    })
    const client = newClient()
    const all = Promise.all([client.get('/a'), client.get('/b'), client.get('/c')])
    await vi.waitFor(() => expect(releases.length).toBeGreaterThanOrEqual(1))
    await new Promise((resolve) => setTimeout(resolve, 0)) // ให้ทุก get ถึงจุดยิง login
    releases.forEach((release) => release()) // เก็บทุก resolver เพื่อให้ล้มเร็วที่การนับ ไม่ค้างจน timeout
    const results = await all
    expect(results.map((r) => r.status)).toEqual([200, 200, 200])
    expect(callsTo('/auth/login')).toBe(1)
  })

  // ttl 60 วินาที < 300 (REFRESH_EARLY_SECONDS) → accessExpiringSoon() จริง → เข้าเส้นทาง refresh
  it('refresh single-flight: get พร้อมกัน 3 ตัวตอน token ใกล้หมดอายุ → refresh ครั้งเดียว ไม่ login ซ้ำ', async () => {
    routeFetch({
      '/auth/login': () => loginResponse(60),
      '/auth/refresh': () => loginResponse(),
      '/warm': okRoute,
      '/a': okRoute,
      '/b': okRoute,
      '/c': okRoute,
    })
    const client = newClient()
    await client.get('/warm')
    await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')])
    expect(callsTo('/auth/refresh')).toBe(1)
    expect(callsTo('/auth/login')).toBe(1)
  })

  it('refresh ล้ม → re-login ร่วมกันครั้งเดียว (รวม login = 2 ไม่ใช่ 4) และทั้ง 3 get สำเร็จ', async () => {
    let logins = 0
    routeFetch({
      '/auth/login': () => loginResponse(logins++ === 0 ? 60 : 3600),
      '/auth/refresh': () => new Response('{}', { status: 401 }),
      '/warm': okRoute,
      '/a': okRoute,
      '/b': okRoute,
      '/c': okRoute,
    })
    const client = newClient()
    await client.get('/warm')
    const results = await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')])
    expect(results.map((r) => r.status)).toEqual([200, 200, 200])
    expect(callsTo('/auth/login')).toBe(2)
  })

  it('401 ครั้งแรก → refresh ครั้งเดียว + retry ครั้งเดียว แล้วสำเร็จ และ body ของ 401 ถูกระบาย (MS-08)', async () => {
    let dashboardCalls = 0
    const cancelFirst401 = vi.fn()
    const unauthorizedWithStream = (): Response => {
      const body = new ReadableStream({
        start: (controller) => controller.enqueue(new TextEncoder().encode('x')),
        cancel: cancelFirst401,
      })
      return new Response(body, { status: 401 })
    }
    routeFetch({
      '/auth/login': () => loginResponse(),
      '/auth/refresh': () => loginResponse(),
      '/dashboard': () => (dashboardCalls++ === 0 ? unauthorizedWithStream() : jsonResponse({ ok: 1 })),
    })
    const result = await newClient().get('/dashboard')
    expect(result.status).toBe(200)
    expect(callsTo('/dashboard')).toBe(2)
    expect(callsTo('/auth/refresh')).toBe(1)
    await vi.waitFor(() => expect(cancelFirst401).toHaveBeenCalled())
  })

  it('401 ถาวร → ไม่วนซ้ำ: เรียก /dashboard 2 ครั้ง, refresh 1 ครั้ง แล้ว error เซสชันหมดอายุ', async () => {
    routeFetch({
      '/auth/login': () => loginResponse(),
      '/auth/refresh': () => loginResponse(),
      '/dashboard': () => new Response('{}', { status: 401 }),
    })
    const error = (await newClient().get('/dashboard').catch((e: unknown) => e)) as Error
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('เซสชันหมดอายุ')
    expect(callsTo('/dashboard')).toBe(2)
    expect(callsTo('/auth/refresh')).toBe(1)
  })
})

describe('response handling (MS-08)', () => {
  it('body ที่ไม่ใช่ JSON → ข้อความคงที่ ไม่มีเศษ body (กันข้อมูลรั่วผ่านเส้น error)', async () => {
    routeFetch({
      '/auth/login': () => loginResponse(),
      '/dashboard': () => new Response('<html>1234567890123 oops', { status: 200 }),
    })
    const error = (await newClient().get('/dashboard').catch((e: unknown) => e)) as Error
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('ไม่ใช่ JSON')
    expect(error.message).not.toContain('1234567890123')
    expect(error.message).not.toContain('<html>')
  })

  it('timeout ระหว่างอ่าน body → ข้อความ timeout ไม่ใช่ "ไม่ใช่ JSON" (ชี้สาเหตุผิด)', async () => {
    routeFetch({
      '/auth/login': () => loginResponse(),
      '/dashboard': () =>
        new Response(
          new ReadableStream({
            pull() {
              throw new DOMException('timed out', 'TimeoutError')
            },
          }),
          { status: 200 },
        ),
    })
    const error = (await newClient().get('/dashboard').catch((e: unknown) => e)) as Error
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('ไม่ตอบกลับ')
    expect(error.message).not.toContain('ไม่ใช่ JSON')
  })

  it('response ที่ล้ม (HTTP 500) ถูกระบาย/cancel body ไม่ปล่อยค้าง', async () => {
    const cancel = vi.fn()
    routeFetch({
      '/auth/login': () => loginResponse(),
      '/dashboard': () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('boom'))
            },
            cancel,
          }),
          { status: 500 },
        ),
    })
    const error = (await newClient().get('/dashboard').catch((e: unknown) => e)) as Error
    expect(error.message).toContain('HTTP 500')
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled())
  })

  // 401 มี test แยกใน 'session flights' (retry-once / persistent)
  it.each([
    [403, 'ไม่มีสิทธิ์'],
    [429, 'จำกัดอัตรา'],
    [502, 'HTTP 502'],
  ])('ข้อความ error ตามสถานะเดิมไม่เปลี่ยน: HTTP %i', async (status, fragment) => {
    routeFetch({
      '/auth/login': () => loginResponse(),
      '/dashboard': () => new Response('{}', { status }),
    })
    const error = (await newClient().get('/dashboard').catch((e: unknown) => e)) as Error
    expect(error.message).toContain(fragment)
  })
})

describe('closed state (MS-14)', () => {
  it('login flight ที่ settle หลัง logout ไม่เติม jar/loggedIn — jar ต้องว่าง', async () => {
    let releaseLogin: ((r: Response) => void) | null = null
    routeFetch({
      '/auth/login': () => new Promise<Response>((resolve) => { releaseLogin = resolve }),
      '/auth/logout': () => jsonResponse({}),
      '/dashboard': () => jsonResponse({ ok: 1 }),
    })
    const client = newClient()
    const pending = client.get('/dashboard').catch((e: unknown) => e)
    await client.logout() // closed=true ระหว่าง login flight ยังค้าง
    releaseLogin!(loginResponse())
    const result = await pending
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toContain('client ปิดแล้ว')
    // flight ที่ settle ทีหลังห้ามเติม jar — get ครั้งถัดไปยังถูกปิด (ไม่ silent re-login)
    await expect(client.get('/dashboard')).rejects.toThrow('client ปิดแล้ว')
    expect(callsTo('/auth/login')).toBe(1)
  })

  it('logout โดยไม่เคย login → closed ด้วย — ensureSession/get ปฏิเสธ', async () => {
    routeFetch({ '/dashboard': () => jsonResponse({ ok: 1 }) })
    const client = newClient()
    await client.logout()
    await expect(client.get('/dashboard')).rejects.toThrow('client ปิดแล้ว')
  })
})

describe('logout (MS-05)', () => {
  const logoutRoutes = (): Record<string, Route> => ({
    '/auth/login': () => loginResponse(),
    '/auth/logout': () => jsonResponse({}),
    '/dashboard': () => jsonResponse({ ok: 1 }),
  })

  it('ยังไม่เคย login → ไม่ยิง request เลย', async () => {
    routeFetch(logoutRoutes())
    await newClient().logout()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('login แล้ว logout → POST /auth/logout ครั้งเดียว และ get ถัดไปต้อง login ใหม่', async () => {
    routeFetch(logoutRoutes())
    const client = newClient()
    await client.get('/dashboard')
    await client.logout()
    expect(callsTo('/auth/logout')).toBe(1)
    const logoutCall = fetchMock.mock.calls[indexesOf('/auth/logout')[0]][1] as RequestInit
    expect(logoutCall.method).toBe('POST')

    // MS-14: client ปิดแล้วหลัง logout — get ต้องถูกปฏิเสธ ไม่ login ใหม่ (ของเดิม reuse ได้)
    await expect(client.get('/dashboard')).rejects.toThrow('client ปิดแล้ว')
    expect(callsTo('/auth/login')).toBe(1)
  })

  it('logout ล้มด้วย network error → ไม่ throw แต่ state ถูกล้างเหมือนกัน', async () => {
    routeFetch({
      ...logoutRoutes(),
      '/auth/logout': () => {
        throw new TypeError('network down')
      },
    })
    const client = newClient()
    await client.get('/dashboard')
    await expect(client.logout()).resolves.toBeUndefined()
    // MS-14: ปิดแล้ว — get หลัง logout (แม้ logout ล้ม) ต้องถูกปฏิเสธ ไม่ login ใหม่
    await expect(client.get('/dashboard')).rejects.toThrow('client ปิดแล้ว')
    expect(callsTo('/auth/login')).toBe(1)
  })
})

describe('discard ทุกเส้นทาง + ข้อความ error ของ login (MS-08)', () => {
  function streamBody(cancel: () => void): ReadableStream {
    return new ReadableStream({ start: (controller) => controller.enqueue(new TextEncoder().encode('x')), cancel })
  }
  function loginWithStream(cancel: () => void, accessTtlSeconds = 3600): Response {
    const headers = new Headers()
    headers.append('set-cookie', `sp_access=${jwt(accessTtlSeconds)}; Path=/; Max-Age=3600`)
    headers.append('set-cookie', 'sp_refresh=r1; Path=/api/auth; Max-Age=86400')
    return new Response(streamBody(cancel), { status: 200, headers })
  }

  it('body ของ login / refresh / logout ถูกระบายทุกครั้ง ไม่ปล่อยค้าง', async () => {
    const cancelLogin = vi.fn()
    const cancelRefresh = vi.fn()
    const cancelLogout = vi.fn()
    routeFetch({
      '/auth/login': () => loginWithStream(cancelLogin, 60), // ใกล้หมดอายุ → get ถัดไปต้อง refresh
      '/auth/refresh': () => loginWithStream(cancelRefresh),
      '/auth/logout': () => new Response(streamBody(cancelLogout), { status: 200 }),
      '/warm': () => jsonResponse({ ok: 1 }),
      '/dashboard': () => jsonResponse({ ok: 1 }),
    })
    const client = newClient()
    await client.get('/warm')
    await client.get('/dashboard')
    await client.logout()
    await vi.waitFor(() => expect(cancelLogin).toHaveBeenCalled())
    await vi.waitFor(() => expect(cancelRefresh).toHaveBeenCalled())
    await vi.waitFor(() => expect(cancelLogout).toHaveBeenCalled())
  })

  it.each([
    [429, 'จำกัดอัตรา'],
    [401, 'ล็อกอินไม่สำเร็จ'],
    [500, 'ล็อกอินไม่สำเร็จ'],
  ])('login ได้ HTTP %i → ข้อความคงที่ ไม่มีเนื้อ body/ค่า cookie', async (status, fragment) => {
    routeFetch({
      '/auth/login': () => new Response('{"detail":"sp_secret_value"}', { status }),
    })
    const error = (await newClient().get('/x').catch((e: unknown) => e)) as Error
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain(fragment)
    expect(error.message).not.toContain('sp_secret_value')
  })
})
