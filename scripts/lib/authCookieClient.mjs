/**
 * D3 cookie transport client สำหรับ scripts ใน repo (node:http/https ล้วน)
 *
 * - base URL ต่อท้าย /api ที่แม่นยำครั้งเดียว (ค่าเริ่มต้น http://127.0.0.1:8000/api)
 * - เก็บเฉพาะ sp_access / sp_refresh ใน in-memory jar ผูกกับ host ของ base
 * - อ่าน Set-Cookie เป็น array (ห้าม split ด้วย comma — Expires มี comma)
 * - enforce cookie Path/Secure ก่อนสร้าง Cookie header, ลบเมื่อ Max-Age=0/Expires หมดอายุ
 * - จับ csrf_token จาก response body (login/refresh) แล้วแนบ X-CSRF-Token เฉพาะคำขอ
 *   ที่เปลี่ยนข้อมูล (POST/PUT/PATCH/DELETE) เมื่อมีค่า
 * - ตัด token/refresh_token/csrf_token ออกจาก JSON ที่คืนให้ caller กันพึ่งพา/หลุด log
 */
import http from 'node:http'
import https from 'node:https'

const MANAGED_COOKIES = new Set(['sp_access', 'sp_refresh'])
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const STRIPPED_BODY_FIELDS = ['token', 'refresh_token', 'csrf_token']
const DEFAULT_BASE = 'http://127.0.0.1:8000/api'

/**
 * ต่อท้าย /api ให้ base URL ลงท้ายด้วย /api พอดีครั้งเดียว
 * (`http://h:8000` → `.../api`, `.../api/` → `.../api`, `.../api/api` → `.../api`)
 */
export function normalizeApiBaseUrl(baseUrl = DEFAULT_BASE) {
  const url = new URL(baseUrl)
  let path = url.pathname.replace(/\/+$/, '')
  // ตัด /api ท้ายซ้ำออกทั้งหมดแล้วใส่กลับหนึ่งครั้ง
  while (/\/api$/i.test(path)) path = path.slice(0, -'/api'.length)
  path = `${path}/api`
  url.pathname = path
  url.search = ''
  url.hash = ''
  return url
}

/** path ของ request ตรงกับ cookie Path ตาม RFC 6265 §5.1.4 (boundary ด้วย /) */
function cookiePathMatches(cookiePath, requestPath) {
  if (cookiePath === requestPath) return true
  if (cookiePath.endsWith('/')) return requestPath.startsWith(cookiePath)
  return requestPath.startsWith(`${cookiePath}/`)
}

/** Parse หนึ่ง header Set-Cookie (ค่ามากกว่าหนึ่งใบมาเป็น array จาก Node เสมอ) */
function parseSetCookie(header, requestPath) {
  const parts = header.split(';')
  const [nameValue, ...attrParts] = parts
  const eq = nameValue.indexOf('=')
  if (eq <= 0) return null
  const name = nameValue.slice(0, eq).trim()
  const value = nameValue.slice(eq + 1).trim()
  if (!MANAGED_COOKIES.has(name)) return null

  const cookie = {
    value,
    path: requestPath.replace(/\/[^/]*$/, '') || '/',
    secure: false,
    expires: null, // null = session cookie (ไม่มีอายุฝั่ง client)
  }
  let maxAgeSeen = false
  let maxAgeSeconds = 0

  for (const attr of attrParts) {
    const idx = attr.indexOf('=')
    const key = (idx === -1 ? attr : attr.slice(0, idx)).trim().toLowerCase()
    const val = idx === -1 ? '' : attr.slice(idx + 1).trim()
    if (key === 'path' && val) cookie.path = val
    else if (key === 'secure') cookie.secure = true
    else if (key === 'expires' && val) {
      const t = Date.parse(val)
      if (!Number.isNaN(t)) cookie.expires = t
    } else if (key === 'max-age' && val !== '') {
      maxAgeSeen = true
      maxAgeSeconds = Number.parseInt(val, 10)
      if (Number.isNaN(maxAgeSeconds)) maxAgeSeconds = 0
    }
  }

  // Max-Age มี priority สูงกว่า Expires (RFC 6265 §5.3)
  if (maxAgeSeen) {
    cookie.expires = maxAgeSeconds <= 0 ? 0 : Date.now() + maxAgeSeconds * 1000
  }
  return { name, cookie }
}

function isExpired(cookie, now = Date.now()) {
  return cookie.expires !== null && cookie.expires <= now
}

/**
 * สร้าง client ผูกกับ origin ของ baseUrl (jar host-scoped โดย construction)
 *
 * @param {string} [baseUrl]
 * @param {object} [tlsOptions] ตัวเลือกเพิ่มสำหรับ https.request (เช่น rejectUnauthorized
 *   ในเทส self-signed) — ค่าเริ่มต้น verify ตามปกติ ห้ามปิดในโค้ด production
 * @returns {(method: string, path: string, opts?: { body?: unknown }) =>
 *   Promise<{ status: number, json: any, authenticated: boolean }>}
 */
export function createAuthCookieClient(baseUrl = DEFAULT_BASE, tlsOptions = {}) {
  const base = normalizeApiBaseUrl(baseUrl)
  const jar = new Map() // name -> { value, path, secure, expires }
  let csrfToken = null

  function buildCookieHeader(pathname) {
    const now = Date.now()
    const pairs = []
    for (const [name, cookie] of jar) {
      if (isExpired(cookie, now)) {
        jar.delete(name)
        continue
      }
      if (cookie.secure && base.protocol !== 'https:') continue
      if (!cookiePathMatches(cookie.path, pathname)) continue
      pairs.push(`${name}=${cookie.value}`)
    }
    return pairs.length ? pairs.join('; ') : null
  }

  function applySetCookieHeaders(headers, pathname) {
    const raw = headers['set-cookie']
    if (!raw) return
    const list = Array.isArray(raw) ? raw : [raw]
    for (const header of list) {
      const parsed = parseSetCookie(header, pathname)
      if (!parsed) continue
      const { name, cookie } = parsed
      if (cookie.value === '' || isExpired(cookie)) jar.delete(name)
      else jar.set(name, cookie)
    }
  }

  async function api(method, path, { body } = {}) {
    const upper = String(method).toUpperCase()
    // ต่อ basePath ของ base (/api) เอง — new URL('/x', base) จะทิ้ง /api ทิ้ง
    const route = path.startsWith('/') ? path : `/${path}`
    const q = route.indexOf('?')
    const routePath = q === -1 ? route : route.slice(0, q)
    const routeSearch = q === -1 ? '' : route.slice(q)
    const url = new URL(base.href)
    url.pathname = `${base.pathname}${routePath}`.replace(/\/{2,}/g, '/')
    url.search = routeSearch
    url.hash = ''
    const headers = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (MUTATING_METHODS.has(upper) && csrfToken) headers['X-CSRF-Token'] = csrfToken

    const cookieHeader = buildCookieHeader(url.pathname)
    if (cookieHeader) headers.Cookie = cookieHeader

    const transport = url.protocol === 'https:' ? https : http
    const payload = body === undefined ? null : JSON.stringify(body)

    const { status, text } = await new Promise((resolve, reject) => {
      const req = transport.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port,
          path: `${url.pathname}${url.search}`,
          method: upper,
          ...(url.protocol === 'https:' ? tlsOptions : {}),
          headers: {
            ...headers,
            ...(payload !== null ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          },
        },
        (res) => {
          applySetCookieHeaders(res.headers, url.pathname)
          const chunks = []
          res.on('data', (chunk) => chunks.push(chunk))
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              text: Buffer.concat(chunks).toString('utf8'),
            })
          )
        }
      )
      req.on('error', reject)
      // timeout กันค้างถาวรเมื่อ server รับ TCP แล้วไม่ตอบ (hung worker/LB)
      req.setTimeout(15000, () => {
        req.destroy(Object.assign(new Error('request timeout'), { name: 'TimeoutError' }))
      })
      if (payload !== null) req.write(payload)
      req.end()
    })

    let json = null
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = { raw: text }
      }
    }

    // จับ csrf จาก body (login/refresh) ก่อนตัดออก
    if (json && typeof json === 'object' && typeof json.csrf_token === 'string') {
      csrfToken = json.csrf_token
    }
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      for (const field of STRIPPED_BODY_FIELDS) delete json[field]
    }

    const authenticated = Boolean(jar.get('sp_access') && !isExpired(jar.get('sp_access')))

    return { status, json, authenticated }
  }

  return api
}
