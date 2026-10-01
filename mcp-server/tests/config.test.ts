import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

const CREDS = { SP_SERVICE_USERNAME: 'u', SP_SERVICE_PASSWORD: 'p' }

function load(url: string, extra: Record<string, string> = {}) {
  return loadConfig({ SMARTPORT_API_URL: url, ...CREDS, ...extra })
}

describe('loadConfig', () => {
  it('โหลดครบ 3 ตัว + ตัด / ท้าย URL', () => {
    expect(load('http://localhost:8000/api/')).toEqual({
      apiUrl: 'http://localhost:8000/api',
      username: 'u',
      password: 'p',
    })
  })

  it('ขาดตัวไหนบอกชื่อตัวนั้น (ไม่พิมพ์ค่า)', () => {
    expect(() => loadConfig({})).toThrow('SMARTPORT_API_URL')
    expect(() => loadConfig({ SMARTPORT_API_URL: 'https://smart-port.onrender.com/api', SP_SERVICE_USERNAME: 'u' })).toThrow(
      'SP_SERVICE_PASSWORD',
    )
  })
})

describe('loadConfig — M1 scheme guard', () => {
  it('https host ที่ allow ผ่าน', () => {
    expect(load('https://smart-port.onrender.com/api').apiUrl).toBe('https://smart-port.onrender.com/api')
  })

  it.each(['http://localhost:8000/api', 'http://127.0.0.1:8000/api', 'http://[::1]:8000/api'])(
    'http เฉพาะ loopback ผ่าน: %s',
    (url) => {
      expect(load(url).apiUrl).toBe(url)
    },
  )

  it('http ไป host ภายนอกถูกปฏิเสธ แม้อยู่ใน allowlist (credential ห้ามวิ่งแบบ cleartext)', () => {
    expect(() => load('http://smart-port.onrender.com/api')).toThrow('https')
    expect(() =>
      load('http://hr.example.go.th/api', { SMARTPORT_API_ALLOWED_HOSTS: 'hr.example.go.th' }),
    ).toThrow('https')
  })

  it.each(['ftp://smart-port.onrender.com/api', 'file:///etc/passwd', 'javascript:alert(1)'])(
    'scheme อื่นถูกปฏิเสธ: %s',
    (url) => {
      expect(() => load(url)).toThrow()
    },
  )

  it('URL ที่ parse ไม่ได้ถูกปฏิเสธ โดยไม่พิมพ์ค่าที่ส่งมา', () => {
    let message = ''
    try {
      load('not a url')
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('SMARTPORT_API_URL')
    expect(message).not.toContain('not a url')
  })
})

describe('loadConfig — M2 host allowlist', () => {
  it('host นอก allowlist ถูกปฏิเสธ', () => {
    expect(() => load('https://evil.example.com/api')).toThrow('SMARTPORT_API_ALLOWED_HOSTS')
  })

  it('เพิ่ม host ผ่าน SMARTPORT_API_ALLOWED_HOSTS (คั่น , ไม่สนตัวพิมพ์/ช่องว่าง)', () => {
    const env = { SMARTPORT_API_ALLOWED_HOSTS: ' HR.example.go.th , other.example.go.th ' }
    expect(load('https://hr.example.go.th/api', env).apiUrl).toBe('https://hr.example.go.th/api')
    expect(load('https://other.example.go.th/api', env).apiUrl).toBe('https://other.example.go.th/api')
  })

  it('เทียบ hostname ตรงตัว — ไม่ใช่ suffix/prefix', () => {
    expect(() => load('https://evil-smart-port.onrender.com/api')).toThrow()
    expect(() => load('https://smart-port.onrender.com.evil.com/api')).toThrow()
    expect(() => load('https://x.smart-port.onrender.com/api')).toThrow()
  })

  it('userinfo หลอก host (host จริงคือ evil.com) ถูกปฏิเสธ', () => {
    expect(() => load('https://smart-port.onrender.com@evil.com/api')).toThrow()
  })

  it('URL ที่ฝัง credential ถูกปฏิเสธ แม้ host อยู่ใน allowlist', () => {
    expect(() => load('https://user:pass@smart-port.onrender.com/api')).toThrow('credential')
  })
})
