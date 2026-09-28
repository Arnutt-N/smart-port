import { describe, expect, it } from 'vitest'
import { candidateInput } from '../src/tools/candidates.js'
import { dashboardInput } from '../src/tools/dashboard.js'
import { probationInput } from '../src/tools/probation.js'

describe('tool input schemas', () => {
  it('candidate_search: target_level รับเฉพาะ 9 ระดับ + default limit/offset', () => {
    expect(candidateInput.parse({}).target_level).toBeUndefined()
    expect(candidateInput.parse({ target_level: 'K2' })).toMatchObject({
      target_level: 'K2',
      limit: 20,
      offset: 0,
    })
    expect(() => candidateInput.parse({ target_level: 'K9' })).toThrow()
    expect(() => candidateInput.parse({ target_level: 'K2', limit: 999 })).toThrow()
  })

  it('probation_watch: enrollment_id ต้องเป็น int บวก', () => {
    expect(() => probationInput.parse({ enrollment_id: -1 })).toThrow()
    expect(probationInput.parse({ enrollment_id: 3 }).enrollment_id).toBe(3)
  })

  it('dashboard_summary: ไม่รับพารามิเตอร์', () => {
    expect(dashboardInput.parse({})).toEqual({})
  })

  it('ขอบ search/limit/offset: search 200 ผ่าน 201 ไม่ผ่าน; limit 1..200; offset ติดลบไม่ผ่าน', () => {
    expect(candidateInput.parse({ search: 'a'.repeat(200) }).search).toHaveLength(200)
    expect(() => candidateInput.parse({ search: 'a'.repeat(201) })).toThrow()
    expect(candidateInput.parse({ limit: 1 }).limit).toBe(1)
    expect(candidateInput.parse({ limit: 200 }).limit).toBe(200)
    expect(() => candidateInput.parse({ limit: 0 })).toThrow()
    expect(() => candidateInput.parse({ offset: -1 })).toThrow()
    expect(candidateInput.parse({ offset: 0 }).offset).toBe(0)
  })
})
