#!/usr/bin/env node
/**
 * Live API UAT — TC-001..TC-010 from docs/multiplier_phase0_uat_cases_template.csv
 * against POST /multiplier (local Docker backend). Creates then deletes each row.
 *
 * D3: ใช้ cookie + CSRF ผ่าน scripts/lib/authCookieClient.mjs (ไม่มี Bearer)
 * ผลลัพธ์ stdout/stderr เป็น aggregate เท่านั้น — ห้ามมี case ID/row value/path หลุด
 *
 * Usage: node scripts/uat-multiplier-live-api.mjs
 * Env: API_BASE (default http://127.0.0.1:8000), UAT_USER, UAT_PASS
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAuthCookieClient } from './lib/authCookieClient.mjs'
import { formatSanitizedUatSummary } from './lib/sanitizedUatOutput.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const API = (process.env.API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '')
const USER = process.env.UAT_USER || 'admin'
const PASS = process.env.UAT_PASS || 'admin123'
const CSV = resolve(ROOT, 'docs/multiplier_phase0_uat_cases_template.csv')

const api = createAuthCookieClient(API)

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  const headers = lines[0].split(',')
  return lines.slice(1).filter(Boolean).map((line) => {
    const cols = []
    let cur = ''
    let inQ = false
    for (const ch of line) {
      if (ch === '"') {
        inQ = !inQ
        continue
      }
      if (ch === ',' && !inQ) {
        cols.push(cur)
        cur = ''
        continue
      }
      cur += ch
    }
    cols.push(cur)
    const row = {}
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? ''
    })
    return row
  })
}

function districtKey(d) {
  return !d || d === 'NULL' ? '' : String(d).trim()
}

function datesOverlap(aStart, aEnd, bStart, bEnd) {
  const as = aStart
  const ae = aEnd || '9999-12-31'
  const bs = bStart
  const be = bEnd || '9999-12-31'
  return as <= be && bs <= ae
}

function pickArea(areas, tc) {
  const province = tc.province.trim()
  const district = districtKey(tc.district)
  const start = tc.service_start_date
  const end = tc.service_end_date
  const preferEmergency = start >= '2005-01-01'

  const candidates = areas.filter((a) => {
    if (a.province !== province) return false
    if (districtKey(a.district) !== district) return false
    if (!datesOverlap(a.effective_start_date, a.effective_end_date, start, end)) return false
    return true
  })

  if (!candidates.length) return null

  const ranked = [...candidates].sort((a, b) => {
    const aEm = a.basis_type === 'EMERGENCY_DECREE' ? 1 : 0
    const bEm = b.basis_type === 'EMERGENCY_DECREE' ? 1 : 0
    if (preferEmergency) return bEm - aEm
    return aEm - bEm
  })
  return ranked[0]
}

function num(v) {
  return Number(v)
}

/** เทียบค่า — คืน "ชื่อฟิลด์" ที่ไม่ตรงเท่านั้น (ค่าจริงเก็บใน memory ห้าม log) */
function compare(tc, computed) {
  const checks = [
    ['eligible_start_date', tc.expected_eligible_start_date, computed.eligible_start_date],
    ['eligible_end_date', tc.expected_eligible_end_date, computed.eligible_end_date],
    ['service_days', num(tc.expected_service_days), num(computed.service_days)],
    ['eligible_days', num(tc.expected_eligible_days), num(computed.eligible_days)],
    ['effective_days', num(tc.expected_effective_days), num(computed.effective_days)],
    ['bonus_days', num(tc.expected_bonus_days), num(computed.bonus_days)],
    ['net_years', num(tc.expected_net_years), num(computed.net_years)],
    ['net_months', num(tc.expected_net_months), num(computed.net_months)],
    ['net_day_remainder', num(tc.expected_net_days), num(computed.net_day_remainder)],
  ]
  return checks.filter(([, exp, got]) => String(exp) !== String(got)).map(([field]) => field)
}

async function main() {
  const cases = parseCsv(readFileSync(CSV, 'utf8')).filter((r) =>
    /^TC-\d+$/.test(r.case_id)
  )

  const login = await api('POST', '/auth/login', {
    body: { username: USER, password: PASS },
  })
  if (login.status !== 200 || !login.authenticated) {
    console.error(`LOGIN FAIL status=${login.status}`)
    process.exit(2)
  }
  if (login.json?.user?.must_change_password) {
    console.error('LOGIN OK but must_change_password=true — change password first')
    process.exit(2)
  }

  const areasRes = await api('GET', '/multiplier/areas?limit=100')
  if (areasRes.status !== 200) {
    console.error(`AREAS FAIL status=${areasRes.status}`)
    process.exit(2)
  }
  const areas = areasRes.json.data || areasRes.json.areas || areasRes.json
  if (!Array.isArray(areas)) {
    console.error('AREAS unexpected shape')
    process.exit(2)
  }

  // Use the paginated master list so the UAT works with both TEST_SEED and real HR data.
  // Supplying offset selects this mode without relying on fixture-specific search text.
  const peopleRes = await api('GET', '/personnel?offset=0&limit=20')
  if (peopleRes.status !== 200) {
    console.error(`PERSONNEL FAIL status=${peopleRes.status}`)
    process.exit(2)
  }
  const people = peopleRes.json.data || peopleRes.json
  const personnelIds = (Array.isArray(people) ? people : [])
    .map((p) => p.personnel_id)
    .filter(Boolean)
  if (personnelIds.length < 1) {
    console.error('PERSONNEL EMPTY — no personnel_id available for UAT create')
    process.exit(2)
  }

  console.log(`API ${API}`)
  console.log(`Areas loaded: ${areas.length}; personnel pool size: ${personnelIds.length}`)
  console.log('---')

  let pass = 0
  let fail = 0
  let cleanupFailed = 0
  const mismatchFieldTally = [] // ชื่อฟิลด์เท่านั้น ไม่มีค่า

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i]
    const area = pickArea(areas, tc)
    if (!area) {
      fail++
      console.log('FAIL phase=select_area')
      continue
    }

    // rotate personnel to reduce overlap 409 risk across cases
    const personnelId = personnelIds[i % personnelIds.length]
    // create/retry ทั้งก้อน: timeout/network หลัง server commit ได้ = row อาจค้าง
    // โดยไม่มี id มาลบ → นับทั้ง fail และ cleanup_failed (fail-closed) แล้วไปเคสถัดไป
    // ห้ามให้ exception กลางลูปฆ่ารอบทั้งหมด (เคสที่เหลือจะไม่ถูกรัน/นับ)
    let create
    try {
      create = await api('POST', '/multiplier', {
        body: {
          personnel_id: personnelId,
          area_multiplier_id: area.area_multiplier_id,
          start_date: tc.service_start_date,
          end_date: tc.service_end_date,
          proof_reference: `UAT-${tc.case_id}`,
          description: `Live API UAT ${tc.case_id}`,
        },
      })

      if (create.status === 409) {
        // retry with next personnel
        let created = null
        for (const pid of personnelIds) {
          if (pid === personnelId) continue
          const retry = await api('POST', '/multiplier', {
            body: {
              personnel_id: pid,
              area_multiplier_id: area.area_multiplier_id,
              start_date: tc.service_start_date,
              end_date: tc.service_end_date,
              proof_reference: `UAT-${tc.case_id}`,
              description: `Live API UAT ${tc.case_id}`,
            },
          })
          if (retry.status === 201) {
            created = retry
            break
          }
        }
        if (!created) {
          fail++
          console.log('FAIL phase=create status=409')
          continue
        }
        Object.assign(create, created)
      }
    } catch {
      fail++
      cleanupFailed++ // อาจ commit สำเร็จก่อน connection ขาด — ปล่อยรั่วเงียบไม่ได้
      console.error('FAIL phase=create_exception')
      continue
    }

    // cleanup ทุกแถวที่ create สำเร็จ (201) — แม้ response shape เพี้ยน (ไม่มี
    // multiplier_id ก็ลบไม่ได้ → นับเป็น cleanup failure ห้ามปล่อยผ่านเงียบ)
    if (create.status === 201) {
      const mid = create.json?.multiplier_id
      if (!mid) {
        cleanupFailed++
        console.error('CLEANUP FAIL phase=missing_id')
      } else {
        try {
          const cleanup = await api('DELETE', `/multiplier/${mid}`)
          if (cleanup.status < 200 || cleanup.status >= 300) {
            cleanupFailed++
            console.error(`CLEANUP FAIL status=${cleanup.status}`)
          }
        } catch {
          // network/timeout กลาง cleanup — นับเป็น failure ห้ามเดินหน้าเงียบ
          cleanupFailed++
          console.error('CLEANUP FAIL phase=exception')
        }
      }
    }

    if (create.status !== 201 || !create.json?.computed) {
      fail++
      console.log(`FAIL phase=create status=${create.status}`)
      continue
    }

    const mismatchFields = compare(tc, create.json.computed)

    if (mismatchFields.length) {
      fail++
      mismatchFieldTally.push(...mismatchFields)
      console.log('FAIL phase=compare')
    } else {
      pass++
    }
  }

  const summary = formatSanitizedUatSummary({
    total: cases.length,
    passed: pass,
    failed: fail,
    mismatchFields: mismatchFieldTally,
  })
  console.log('---')
  console.log(
    `RESULT: passed=${summary.passed}/${summary.total} failed=${summary.failed} ` +
      `cleanup_failed=${cleanupFailed} ` +
      `mismatch_fields=${JSON.stringify(summary.mismatchFields)}`
  )
  // row ที่ลบไม่สำเร็จ = ต้อง fail (ห้ามปล่อยผ่านเป็น 0)
  process.exit(fail || cleanupFailed ? 1 : 0)
}

main().catch((err) => {
  console.error(`UAT ERROR phase=unhandled type=${err?.name ?? 'unknown'}`)
  process.exit(2)
})
