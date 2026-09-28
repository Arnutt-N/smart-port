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
})
