import { describe, it, expect } from 'vitest'
import { CANDIDATE_NEAR_THRESHOLD_DAYS } from '@/constants/eligibility.js'
import { statusFor, probationStatusFor } from '@/utils/displayEligibility.js'

describe('CANDIDATE_NEAR_THRESHOLD_DAYS', () => {
  it('matches QualificationEngine::NEAR_THRESHOLD_DAYS (90)', () => {
    expect(CANDIDATE_NEAR_THRESHOLD_DAYS).toBe(90)
  })
})

describe('statusFor (candidates)', () => {
  it('maps promoting and check_data regardless of days', () => {
    expect(statusFor('promoting', 45)).toBe('PROMOTING')
    expect(statusFor('check_data', 45)).toBe('check_data')
  })

  it('treats days within 1..90 as NEAR_MET', () => {
    expect(statusFor('not_yet', 1)).toBe('NEAR_MET')
    expect(statusFor('not_yet', 45)).toBe('NEAR_MET')
    expect(statusFor('not_yet', 90)).toBe('NEAR_MET')
  })

  it('treats days > 90 as NOT_MET', () => {
    expect(statusFor('not_yet', 91)).toBe('NOT_MET')
  })

  it('maps zero and negative remaining days', () => {
    expect(statusFor('not_yet', 0)).toBe('MET')
    expect(statusFor('qualified', -2)).toBe('EXCEEDED')
  })

  it('maps null remaining days to NOT_MET', () => {
    expect(statusFor('not_yet', null)).toBe('NOT_MET')
  })
})

describe('probationStatusFor', () => {
  it('keeps 30-day near window for probation', () => {
    expect(probationStatusFor('IN_PROGRESS', 30)).toBe('NEAR_DEADLINE')
    expect(probationStatusFor('IN_PROGRESS', 31)).toBe('NOT_DUE')
    expect(probationStatusFor('IN_PROGRESS', 45)).toBe('NOT_DUE')
  })
})
