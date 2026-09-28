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

  it('path boundary: Path=/api/auth ต้องไม่ส่งไป /api/authors (RFC 6265 §5.1.4)', () => {
    const jar = new CookieJar()
    jar.storeFromSetCookies(['sp_refresh=bbb; Path=/api/auth; Max-Age=3600'])
    expect(jar.headerFor('http://localhost:8000/api/auth/refresh')).toBe('sp_refresh=bbb')
    expect(jar.headerFor('http://localhost:8000/api/authors')).toBeNull()
  })

  it('Max-Age มี priority ต่อ Expires (RFC 6265 §5.3)', () => {
    const jar = new CookieJar()
    // Max-Age อนุญาตให้เก็บ แม้ Expires ในอดีต — ตรงกับ authCookieClient.mjs
    jar.storeFromSetCookies([
      'sp_access=aaa; Path=/; Max-Age=3600; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ])
    expect(jar.get('sp_access')).toBe('aaa')
    // กลับกัน: Max-Age=0 = ล้าง แม้ Expires อนาคต
    jar.storeFromSetCookies(['sp_access=aaa; Path=/; Max-Age=0; Expires=Thu, 01 Jan 2099 00:00:00 GMT'])
    expect(jar.get('sp_access')).toBeNull()
  })

  it('clear() ล้างทุกใบ (logout)', () => {
    const jar = new CookieJar()
    jar.storeFromSetCookies([
      'sp_access=aaa; Path=/; Max-Age=3600',
      'sp_refresh=bbb; Path=/api/auth; Max-Age=3600',
    ])
    jar.clear()
    expect(jar.get('sp_access')).toBeNull()
    expect(jar.headerFor('http://localhost:8000/api/auth/refresh')).toBeNull()
  })
})
