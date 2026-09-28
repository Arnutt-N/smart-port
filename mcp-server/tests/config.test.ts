import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

describe('loadConfig', () => {
  it('โหลดครบ 3 ตัว + ตัด / ท้าย URL', () => {
    expect(
      loadConfig({ SMARTPORT_API_URL: 'http://x/api/', SP_SERVICE_USERNAME: 'u', SP_SERVICE_PASSWORD: 'p' }),
    ).toEqual({ apiUrl: 'http://x/api', username: 'u', password: 'p' })
  })

  it('ขาดตัวไหนบอกชื่อตัวนั้น (ไม่พิมพ์ค่า)', () => {
    expect(() => loadConfig({})).toThrow('SMARTPORT_API_URL')
    expect(() => loadConfig({ SMARTPORT_API_URL: 'http://x', SP_SERVICE_USERNAME: 'u' })).toThrow(
      'SP_SERVICE_PASSWORD',
    )
  })
})
