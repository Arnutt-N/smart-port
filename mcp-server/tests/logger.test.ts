import { afterEach, describe, expect, it, vi } from 'vitest'
import { logToolCall, sanitizeParams } from '../src/logger.js'

describe('sanitizeParams', () => {
  it('เก็บแค่ allowlist — ชื่อ/search/citizen_id ถูก redact', () => {
    expect(
      sanitizeParams({
        target_level: 'K2',
        limit: 20,
        offset: 0,
        enrollment_id: 3,
        search: 'สมชาย',
        full_name: 'สมชาย ใจดี',
        citizen_id: '1234567890123',
      }),
    ).toEqual({
      target_level: 'K2',
      limit: 20,
      offset: 0,
      enrollment_id: 3,
      search: '[redacted]',
      full_name: '[redacted]',
      citizen_id: '[redacted]',
    })
  })

  it('input ไม่ใช่ object ได้ {}', () => {
    expect(sanitizeParams(null)).toEqual({})
    expect(sanitizeParams('x')).toEqual({})
  })
})

describe('logToolCall', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('เขียน JSON ลง stderr และไม่มี PII', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logToolCall('candidate_search', { search: 'สมชาย', limit: 1 }, 200, 5)
    expect(spy).toHaveBeenCalledOnce()
    const line = String(spy.mock.calls[0][0])
    expect(line).not.toContain('สมชาย')
    expect(JSON.parse(line)).toMatchObject({ tool: 'candidate_search', status: 200 })
  })
})
