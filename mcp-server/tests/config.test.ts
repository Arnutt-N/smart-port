import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

const CREDS = { SP_SERVICE_USERNAME: 'u', SP_SERVICE_PASSWORD: 'p' }
const DEFAULT_URL = 'https://smart-port.onrender.com/api'

// fragment เฉพาะกฎ — ต้องไม่ซ้ำข้ามกฎ เพื่อพิสูจน์ว่า error มาจากกฎที่ตั้งใจ
const RULE_SCHEME = 'https'
const RULE_HOST = 'ไม่อยู่ในรายการที่อนุญาต'
const RULE_CREDENTIAL = 'credential'
const RULE_PARSE = 'ไม่ใช่ URL'
const RULE_ENTRY = 'รับเฉพาะชื่อ host'

function load(url: string, extra: Record<string, string> = {}) {
  return loadConfig({ SMARTPORT_API_URL: url, ...CREDS, ...extra })
}

// คืนข้อความ error ('' ถ้าไม่ throw) เพื่อ assert ได้ทั้ง fragment ของกฎและการไม่พิมพ์ค่าที่รับมา
function errorOf(url: string, extra: Record<string, string> = {}): string {
  try {
    load(url, extra)
    return ''
  } catch (error) {
    return (error as Error).message
  }
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
    expect(() => loadConfig({ SMARTPORT_API_URL: DEFAULT_URL, SP_SERVICE_USERNAME: 'u' })).toThrow('SP_SERVICE_PASSWORD')
  })

  it('trim ช่องว่างรอบ URL + ตัด / ท้าย บน host ที่ allow', () => {
    expect(load('  https://smart-port.onrender.com/api/  ').apiUrl).toBe(DEFAULT_URL)
  })
})

describe('loadConfig — M1 scheme guard', () => {
  it('https host ที่ allow ผ่าน', () => {
    expect(load(DEFAULT_URL).apiUrl).toBe(DEFAULT_URL)
  })

  it.each(['http://localhost:8000/api', 'http://127.0.0.1:8000/api', 'http://[::1]:8000/api'])(
    'http เฉพาะ loopback ผ่าน: %s',
    (url) => {
      expect(load(url).apiUrl).toBe(url)
    },
  )

  it.each(['https://localhost:8000/api', 'https://[::1]:8000/api'])('https ไป loopback ผ่าน: %s', (url) => {
    expect(load(url).apiUrl).toBe(url)
  })

  it('http ไป host ภายนอกถูกปฏิเสธ แม้อยู่ใน allowlist (credential ห้ามวิ่งแบบ cleartext)', () => {
    expect(errorOf('http://smart-port.onrender.com/api')).toContain(RULE_SCHEME)
    expect(errorOf('http://hr.example.go.th/api', { SMARTPORT_API_ALLOWED_HOSTS: 'hr.example.go.th' })).toContain(
      RULE_SCHEME,
    )
  })

  it.each(['ftp://smart-port.onrender.com/api', 'file:///etc/passwd', 'javascript:alert(1)'])(
    'scheme อื่นถูกปฏิเสธด้วยกฎ scheme: %s',
    (url) => {
      expect(errorOf(url)).toContain(RULE_SCHEME)
    },
  )

  it.each([
    'http://localhost.evil.com/api',
    'http://127.0.0.1.evil.com/api',
    'http://[::2]:8000/api',
  ])('http ที่ดูคล้าย loopback แต่ไม่ใช่ถูกปฏิเสธด้วยกฎ scheme: %s', (url) => {
    expect(errorOf(url)).toContain(RULE_SCHEME)
  })

  it('URL ที่ parse ไม่ได้ถูกปฏิเสธด้วยกฎ parse', () => {
    expect(errorOf('not a url')).toContain(RULE_PARSE)
  })
})

describe('loadConfig — M2 host allowlist', () => {
  it('host นอก allowlist ถูกปฏิเสธด้วยกฎ host', () => {
    expect(errorOf('https://evil.example.com/api')).toContain(RULE_HOST)
  })

  it('เพิ่ม host ผ่าน SMARTPORT_API_ALLOWED_HOSTS (คั่น , ไม่สนตัวพิมพ์/ช่องว่าง)', () => {
    const env = { SMARTPORT_API_ALLOWED_HOSTS: ' HR.example.go.th , other.example.go.th ' }
    expect(load('https://hr.example.go.th/api', env).apiUrl).toBe('https://hr.example.go.th/api')
    expect(load('https://other.example.go.th/api', env).apiUrl).toBe('https://other.example.go.th/api')
  })

  it('เทียบ hostname ตรงตัว — ไม่ใช่ suffix/prefix', () => {
    expect(errorOf('https://evil-smart-port.onrender.com/api')).toContain(RULE_HOST)
    expect(errorOf('https://smart-port.onrender.com.evil.com/api')).toContain(RULE_HOST)
    expect(errorOf('https://x.smart-port.onrender.com/api')).toContain(RULE_HOST)
  })

  it('FQDN จุดท้ายไม่ตรงกับ host ที่ allow — ถูกปฏิเสธด้วยกฎ host', () => {
    expect(errorOf('https://smart-port.onrender.com./api')).toContain(RULE_HOST)
  })

  it('scheme/host ตัวพิมพ์ใหญ่ถูก normalize แล้วผ่าน และพอร์ตไม่ถูกจำกัด (MS-D3: บันทึกพฤติกรรมไว้)', () => {
    expect(load('HTTPS://SMART-PORT.ONRENDER.COM/api').apiUrl).toBe('HTTPS://SMART-PORT.ONRENDER.COM/api')
    expect(load('https://smart-port.onrender.com:8443/api').apiUrl).toBe('https://smart-port.onrender.com:8443/api')
  })

  it('userinfo หลอก host (host จริงคือ evil.com) ถูกปฏิเสธ — ชนกฎ credential ก่อนถึงกฎ host', () => {
    expect(errorOf('https://smart-port.onrender.com@evil.com/api')).toContain(RULE_CREDENTIAL)
  })

  it('URL ที่ฝัง credential ถูกปฏิเสธ แม้ host อยู่ใน allowlist', () => {
    expect(errorOf('https://user:pass@smart-port.onrender.com/api')).toContain(RULE_CREDENTIAL)
  })
})

describe('loadConfig — ลำดับกฎ (order pin / loopback pin)', () => {
  it('order pin: input ที่ผิดทั้งกฎ credential และกฎ https ต้องรายงาน credential ก่อน', () => {
    expect(errorOf('http://u:p@evil.example/api')).toContain(RULE_CREDENTIAL)
  })

  it('loopback pin: http+loopback ผ่านกฎ scheme ได้ แต่กฎ credential ต้องไม่ถูกยกเว้น', () => {
    expect(errorOf('http://u:p@localhost:8000/api')).toContain(RULE_CREDENTIAL)
  })
})

describe('loadConfig — ข้อความ error ไม่พิมพ์ค่าที่รับมา', () => {
  it.each([
    ['not a url', 'not a url'],
    ['https://user:SECRETPW@smart-port.onrender.com/api', 'SECRETPW'],
    ['http://hidden-host.example/api', 'hidden-host'],
    ['https://hidden-host.example/api', 'hidden-host'],
  ])('%s', (url, forbidden) => {
    const message = errorOf(url)
    expect(message).not.toBe('')
    expect(message).not.toContain(forbidden)
  })
})

describe('loadConfig — MS-10 allowlist entry', () => {
  it.each([',', '  ', 'a,,b'])('entry ว่าง/คั่นซ้ำไม่ทำให้ล้ม และ host ค่าเริ่มต้นยังผ่าน: %j', (raw) => {
    expect(load(DEFAULT_URL, { SMARTPORT_API_ALLOWED_HOSTS: raw }).apiUrl).toBe(DEFAULT_URL)
  })

  it('entry ว่างต้องไม่ทำให้ host อื่นถูก allow', () => {
    expect(errorOf('https://hr.example.go.th/api', { SMARTPORT_API_ALLOWED_HOSTS: ',' })).toContain(RULE_HOST)
  })

  it.each([
    'https://hr.example.go.th',
    'hr.example.go.th:8443',
    'hr.example.go.th/',
    'user@hr.example.go.th',
    'hr.example.go.th.',
    '.hr.example.go.th',
    'a..b',
    'a b',
  ])('entry ผิดรูปล้มด้วยกฎ entry และไม่พิมพ์ entry: %j', (entry) => {
    const message = errorOf(DEFAULT_URL, { SMARTPORT_API_ALLOWED_HOSTS: entry })
    expect(message).toContain(RULE_ENTRY)
    expect(message).not.toContain(entry)
  })

  // ต้องเป็น punycode ที่ถูกต้องจริง (xn--abc ไม่ผ่าน URL parser ของ Node เอง) — 'bücher' = xn--bcher-kva
  it('punycode (xn--) เป็น entry ที่ถูกต้อง', () => {
    expect(load('https://xn--bcher-kva.example.go.th/api', { SMARTPORT_API_ALLOWED_HOSTS: 'xn--bcher-kva.example.go.th' }).apiUrl).toBe(
      'https://xn--bcher-kva.example.go.th/api',
    )
  })
})
