import { describe, expect, it } from 'vitest'
import { CookieJar } from '../src/cookies.js'

describe('CookieJar', () => {
  it('ส่ง sp_access ทุก path แต่ sp_refresh เฉพาะ /api/auth', () => {
    const jar = new CookieJar()
    jar.storeFromSetCookies([
      'sp_access=aaa; Path=/; Max-Age=3600; HttpOnly',
      'sp_refresh=bbb; Path=/api/auth; Max-Age=2592000; HttpOnly',
    ])
    expect(jar.headerFor('http://localhost:8000/api/dashboard')).toBe('sp_access=aaa')
    expect(jar.headerFor('http://localhost:8000/api/auth/refresh')).toBe('sp_access=aaa; sp_refresh=bbb')
  })

  it('ไม่ส่ง cookie ที่หมดอายุ และล้างเมื่อ logout', () => {
    const jar = new CookieJar()
    jar.storeFromSetCookies(['sp_access=aaa; Path=/; Max-Age=3600'])
    expect(jar.get('sp_access')).toBe('aaa')
    jar.storeFromSetCookies(['sp_access=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'])
    expect(jar.get('sp_access')).toBeNull()
    expect(jar.headerFor('http://localhost:8000/api/dashboard')).toBeNull()
  })

  it('ไม่ส่ง Secure cookie ผ่าน http', () => {
    const jar = new CookieJar()
    jar.storeFromSetCookies(['sp_access=aaa; Path=/; Secure'])
    expect(jar.headerFor('http://localhost:8000/api/dashboard')).toBeNull()
    expect(jar.headerFor('https://smart-port.onrender.com/api/dashboard')).toBe('sp_access=aaa')
  })

  it('ข้าม Set-Cookie ผิดรูปโดยไม่พัง', () => {
    const jar = new CookieJar()
    jar.storeFromSetCookies(['not-a-cookie', ''])
    expect(jar.headerFor('http://localhost:8000/api/dashboard')).toBeNull()
  })

  it('Max-Age มี priority ต่อ Expires ไม่ว่า attribute ใดมาก่อน (RFC 6265 §5.3)', () => {
    const past = 'Thu, 01 Jan 1970 00:00:00 GMT'
    const future = 'Fri, 01 Jan 2100 00:00:00 GMT'

    const maxAgeFirst = new CookieJar()
    maxAgeFirst.storeFromSetCookies([`sp_access=aaa; Path=/; Max-Age=3600; Expires=${past}`])
    expect(maxAgeFirst.get('sp_access')).toBe('aaa')

    const expiresFirst = new CookieJar()
    expiresFirst.storeFromSetCookies([`sp_access=aaa; Path=/; Expires=${past}; Max-Age=3600`])
    expect(expiresFirst.get('sp_access')).toBe('aaa')

    // ฝั่งลบ: Max-Age=0 ต้องลบ cookie แม้ Expires ที่ตามมาจะอยู่ในอนาคต (กรณี server สั่ง logout)
    const clearedByMaxAge = new CookieJar()
    clearedByMaxAge.storeFromSetCookies(['sp_access=aaa; Path=/; Max-Age=3600'])
    clearedByMaxAge.storeFromSetCookies([`sp_access=aaa; Path=/; Max-Age=0; Expires=${future}`])
    expect(clearedByMaxAge.get('sp_access')).toBeNull()
  })

  it('Path ตรงตาม boundary: Path=/api/auth ไม่ส่งไป /api/authors (RFC 6265 §5.1.4)', () => {
    const jar = new CookieJar()
    jar.storeFromSetCookies(['sp_refresh=bbb; Path=/api/auth; Max-Age=3600'])
    expect(jar.headerFor('http://localhost:8000/api/authors')).toBeNull()
    expect(jar.headerFor('http://localhost:8000/api/auth')).toBe('sp_refresh=bbb')
    expect(jar.headerFor('http://localhost:8000/api/auth/refresh')).toBe('sp_refresh=bbb')
  })

  it('Path ที่ลงท้ายด้วย / ต้องมี / ใน request path ด้วย', () => {
    const jar = new CookieJar()
    jar.storeFromSetCookies(['sp_refresh=bbb; Path=/api/auth/; Max-Age=3600'])
    expect(jar.headerFor('http://localhost:8000/api/auth/refresh')).toBe('sp_refresh=bbb')
    expect(jar.headerFor('http://localhost:8000/api/auth')).toBeNull()
  })
})
