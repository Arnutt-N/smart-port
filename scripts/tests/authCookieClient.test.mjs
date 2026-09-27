import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createAuthCookieClient, normalizeApiBaseUrl } from '../lib/authCookieClient.mjs'

const PAST = new Date(0).toUTCString() // "Thu, 01 Jan 1970 00:00:00 GMT" (มี comma)
const FUTURE = new Date(Date.now() + 86400000).toUTCString()

/** mock server: บันทึก cookie/csrf ที่ได้รับไว้ inspect ใน test */
function createMock({ tls = false, certs = null } = {}) {
  const seen = []
  const handler = (req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : ''
      seen.push({
        url: req.url,
        cookie: req.headers.cookie,
        csrf: req.headers['x-csrf-token'],
        method: req.method,
        body,
      })
      const send = (status, headers, payload) => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
        res.end(payload)
      }
      if (req.method === 'POST' && req.url === '/api/auth/login') {
        send(
          200,
          {
            // สอง header คนละ string — array จาก Node เสมอ, refresh มี Expires แบบมี comma
            'Set-Cookie': [
              'sp_access=ACCESS1; Path=/; HttpOnly; SameSite=Lax',
              `sp_refresh=REFRESH1; Path=/api/auth; HttpOnly; SameSite=Lax; Expires=${FUTURE}`,
            ],
          },
          JSON.stringify({
            token: 'JWTBODY-SENTINEL',
            refresh_token: 'REFRESHBODY-SENTINEL',
            csrf_token: 'CSRFVALUE1',
            user: { id: 1, username: 'admin' },
          })
        )
      } else if (req.method === 'POST' && req.url === '/api/auth/login-fresh') {
        send(
          200,
          { 'Set-Cookie': 'sp_access=ACCESSFRESH; Path=/; HttpOnly; SameSite=Lax' },
          JSON.stringify({ csrf_token: 'CSRFVALUE2' })
        )
      } else if (req.method === 'POST' && req.url === '/api/auth/login-secure') {
        send(
          200,
          { 'Set-Cookie': 'sp_access=SECURE1; Path=/; HttpOnly; Secure; SameSite=Lax' },
          JSON.stringify({})
        )
      } else if (req.method === 'POST' && req.url === '/api/auth/login-expired') {
        send(
          200,
          {
            'Set-Cookie': [
              `sp_access=EXPIRED1; Path=/; HttpOnly; Expires=${PAST}`,
              `sp_refresh=EXPIRED2; Path=/api/auth; HttpOnly; Expires=${PAST}`,
            ],
          },
          JSON.stringify({})
        )
      } else if (req.method === 'POST' && req.url === '/api/auth/logout') {
        send(
          200,
          {
            'Set-Cookie': [
              'sp_access=; Max-Age=0; Path=/; HttpOnly',
              'sp_refresh=; Max-Age=0; Path=/api/auth; HttpOnly',
            ],
          },
          JSON.stringify({})
        )
      } else if (req.method === 'GET') {
        send(200, {}, JSON.stringify({ ok: true }))
      } else if (req.method !== 'GET') {
        send(201, {}, JSON.stringify({ ok: true }))
      } else {
        send(404, {}, JSON.stringify({}))
      }
    })
  }
  return tls
    ? { server: https.createServer({ key: certs.key, cert: certs.cert }, handler), seen }
    : { server: http.createServer(handler), seen }
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  })
}

function stop(server) {
  return new Promise((resolve) => server.close(resolve))
}

function generateCertIfPossible() {
  const openssl = 'openssl'
  const dir = mkdtempSync(join(tmpdir(), 'authcookie-ssl-'))
  const key = join(dir, 'key.pem')
  const cert = join(dir, 'cert.pem')
  const res = spawnSync(openssl, [
    'req', '-x509', '-newkey', 'rsa:2048',
    '-keyout', key, '-out', cert,
    '-days', '1', '-nodes', '-subj', '/CN=127.0.0.1',
  ], { encoding: 'utf8' })
  if (res.error || res.status !== 0) return null
  return { key: readFileSync(key), cert: readFileSync(cert) }
}

test('normalizeApiBaseUrl ต่อ /api ที่แม่นยำครั้งเดียวทุกกรณี', () => {
  assert.equal(normalizeApiBaseUrl('http://127.0.0.1:8000').href, 'http://127.0.0.1:8000/api')
  assert.equal(normalizeApiBaseUrl('http://127.0.0.1:8000/').href, 'http://127.0.0.1:8000/api')
  assert.equal(normalizeApiBaseUrl('http://127.0.0.1:8000/api').href, 'http://127.0.0.1:8000/api')
  assert.equal(normalizeApiBaseUrl('http://127.0.0.1:8000/api/').href, 'http://127.0.0.1:8000/api')
  assert.equal(normalizeApiBaseUrl('http://127.0.0.1:8000/api/api').href, 'http://127.0.0.1:8000/api')
  assert.equal(normalizeApiBaseUrl('https://example.test/base').href, 'https://example.test/base/api')
})

test('login เก็บ cookies แยกตาม Path, ตัด field credential ออก, authenticated=true', async () => {
  const { server, seen } = createMock()
  const port = await listen(server)
  try {
    const api = createAuthCookieClient(`http://127.0.0.1:${port}`)
    const login = await api('POST', '/auth/login', { body: { username: 'a', password: 'b' } })

    assert.equal(login.status, 200)
    assert.equal(login.authenticated, true)
    // ตัด token/refresh_token/csrf_token ออกจาก JSON ที่ caller เห็น
    assert.equal(login.json.token, undefined)
    assert.equal(login.json.refresh_token, undefined)
    assert.equal(login.json.csrf_token, undefined)
    assert.equal(login.json.user.username, 'admin')

    // GET ธรรมดา: มี sp_access (Path=/) ไม่มี sp_refresh (Path=/api/auth)
    await api('GET', '/multiplier/areas')
    const areas = seen.find((s) => s.url === '/api/multiplier/areas')
    const sentNames = (areas.cookie || '').split('; ').filter(Boolean).map((p) => p.split('=')[0])
    assert.deepEqual(sentNames, ['sp_access'], 'GET นอก /api/auth ต้องได้เฉพาะ sp_access')
    assert.match(areas.cookie, /sp_access=ACCESS1/)
    assert.equal(areas.cookie.includes('sp_refresh'), false, 'ไม่ควรส่ง sp_refresh ออกนอก /api/auth')
    assert.equal(areas.csrf, undefined, 'GET ไม่ควรแนบ X-CSRF-Token')

    // path ภายใต้ /api/auth ได้ sp_refresh
    await api('GET', '/auth/me')
    const me = seen.find((s) => s.url === '/api/auth/me')
    assert.match(me.cookie, /sp_refresh=REFRESH1/)
  } finally {
    await stop(server)
  }
})

test('X-CSRF-Token แนบเฉพาะคำขอเปลี่ยนข้อมูล และค่าตรงกับ csrf จาก login', async () => {
  const { server, seen } = createMock()
  const port = await listen(server)
  try {
    const api = createAuthCookieClient(`http://127.0.0.1:${port}`)
    await api('POST', '/auth/login', { body: { username: 'a', password: 'b' } })
    await api('POST', '/multiplier', { body: { personnel_id: 1 } })

    const post = seen.find((s) => s.method === 'POST' && s.url === '/api/multiplier')
    assert.equal(post.csrf, 'CSRFVALUE1')
    assert.match(post.cookie, /sp_access=ACCESS1/)
    assert.equal(post.body, '{"personnel_id":1}')
  } finally {
    await stop(server)
  }
})

test('PUT/DELETE ได้ X-CSRF-Token ด้วย และ csrf อัปเดตเมื่อ response มีค่าใหม่', async () => {
  const { server, seen } = createMock()
  const port = await listen(server)
  try {
    const api = createAuthCookieClient(`http://127.0.0.1:${port}`)
    await api('POST', '/auth/login', { body: { username: 'a', password: 'b' } })

    await api('PUT', '/multiplier/1', { body: { note: 'x' } })
    await api('DELETE', '/multiplier/1')

    const put = seen.find((s) => s.method === 'PUT')
    const del = seen.find((s) => s.method === 'DELETE')
    assert.equal(put.csrf, 'CSRFVALUE1', 'PUT ต้องแนบ X-CSRF-Token')
    assert.equal(del.csrf, 'CSRFVALUE1', 'DELETE ต้องแนบ X-CSRF-Token')

    // refresh (POST /auth/login-fresh) คืน csrf ใหม่ → คำขอถัดไปใช้ค่าใหม่
    await api('POST', '/auth/login-fresh')
    await api('POST', '/multiplier', { body: { personnel_id: 2 } })
    const afterRefresh = seen.filter((s) => s.method === 'POST' && s.url === '/api/multiplier').at(-1)
    assert.equal(afterRefresh.csrf, 'CSRFVALUE2', 'csrf ต้องอัปเดตจาก response ล่าสุด')
  } finally {
    await stop(server)
  }
})

test('path boundary: sp_refresh ไม่หลุดออกไปนอก /api/auth (เช่น /api/authenticate)', async () => {
  const { server, seen } = createMock()
  const port = await listen(server)
  try {
    const api = createAuthCookieClient(`http://127.0.0.1:${port}`)
    await api('POST', '/auth/login', { body: { username: 'a', password: 'b' } })

    await api('GET', '/authenticate') // → /api/authenticate (ขึ้นต้นด้วย /api/auth แต่ไม่ใช่เส้นทางนั้น)
    const req = seen.find((s) => s.url === '/api/authenticate')
    const names = (req.cookie || '').split('; ').filter(Boolean).map((p) => p.split('=')[0])
    assert.deepEqual(names, ['sp_access'], 'ขอบหน้าเส้นทางต้องไม่ส่ง sp_refresh')
  } finally {
    await stop(server)
  }
})

test('Max-Age=0 / Expires หมดอายุ ลบ cookie ออกจาก jar (authenticated=false)', async () => {
  const { server, seen } = createMock()
  const port = await listen(server)
  try {
    const api = createAuthCookieClient(`http://127.0.0.1:${port}`)
    await api('POST', '/auth/login', { body: { username: 'a', password: 'b' } })
    await api('GET', '/multiplier')
    const before = seen.filter((s) => s.url === '/api/multiplier').at(-1)
    assert.match(before.cookie, /sp_access=ACCESS1/)

    // login-expired: Expires ในอดีตทั้งคู่ → ลบ
    await api('POST', '/auth/login-expired')
    assert.equal((await api('GET', '/multiplier')).authenticated, false)
    const afterExpired = seen.filter((s) => s.url === '/api/multiplier').at(-1)
    assert.equal(afterExpired.cookie, undefined, 'jar ว่างต้องไม่ส่ง Cookie header')

    // ออก login ใหม่ แล้ว logout ด้วย Max-Age=0
    await api('POST', '/auth/login-fresh')
    assert.equal((await api('GET', '/multiplier')).authenticated, true)
    await api('POST', '/auth/logout')
    assert.equal((await api('GET', '/multiplier')).authenticated, false)
    const afterLogout = seen.filter((s) => s.url === '/api/multiplier').at(-1)
    assert.equal(afterLogout.cookie, undefined, 'Max-Age=0 ต้องลบ cookie ออกจาก jar')
  } finally {
    await stop(server)
  }
})

test('Secure cookie ไม่ถูกส่งผ่าน HTTP และยังคงส่งผ่าน HTTPS', async (t) => {
  const certs = generateCertIfPossible()
  if (!certs) {
    t.skip('openssl ไม่พร้อมใน environment นี้')
    return
  }
  const { server: httpServer, seen: httpSeen } = createMock()
  const httpPort = await listen(httpServer)
  try {
    const api = createAuthCookieClient(`http://127.0.0.1:${httpPort}`)
    await api('POST', '/auth/login-secure')
    // Secure cookie ถูกเก็บ แต่ไม่ส่งออกทาง http
    await api('GET', '/multiplier')
    const overHttp = httpSeen.find((s) => s.url === '/api/multiplier')
    assert.equal(overHttp.cookie, undefined)
  } finally {
    await stop(httpServer)
  }

  const { server: httpsServer, seen: httpsSeen } = createMock({ tls: true, certs })
  const httpsPort = await listen(httpsServer)
  try {
    const api = createAuthCookieClient(`https://127.0.0.1:${httpsPort}`, {
      rejectUnauthorized: false, // self-signed cert เฉพาะในเทสเท่านั้น
    })
    await api('POST', '/auth/login-secure')
    await api('GET', '/multiplier')
    const overHttps = httpsSeen.find((s) => s.url === '/api/multiplier')
    assert.match(overHttps.cookie, /sp_access=SECURE1/)
  } finally {
    await stop(httpsServer)
  }
})

test('login ที่ไม่ได้ set access cookie ให้ authenticated=false', async () => {
  const { server } = createMock()
  const port = await listen(server)
  try {
    const api = createAuthCookieClient(`http://127.0.0.1:${port}`)
    const login = await api('POST', '/auth/login-expired')
    assert.equal(login.authenticated, false)
  } finally {
    await stop(server)
  }
})
