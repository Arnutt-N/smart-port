#!/usr/bin/env node
/**
 * Live API UAT — TC-001..TC-010 from docs/multiplier_phase0_uat_cases_template.csv
 * against POST /multiplier (local Docker backend). Creates then deletes each row.
 *
 * Usage: node scripts/uat-multiplier-live-api.mjs
 * Env: API_BASE (default http://127.0.0.1:8000), UAT_USER, UAT_PASS
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const API = (process.env.API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '')
const USER = process.env.UAT_USER || 'admin'
const PASS = process.env.UAT_PASS || 'admin123'
const CSV = resolve(ROOT, 'docs/multiplier_phase0_uat_cases_template.csv')

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

async function api(method, path, { token, csrf, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (csrf) headers['X-CSRF-Token'] = csrf
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { status: res.status, json }
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
  const fails = checks.filter(([, exp, got]) => String(exp) !== String(got))
  return fails.map(([field, exp, got]) => `${field}: expected ${exp}, got ${got}`)
}

async function main() {
  const cases = parseCsv(readFileSync(CSV, 'utf8')).filter((r) =>
    /^TC-\d+$/.test(r.case_id)
  )

  const login = await api('POST', '/auth/login', {
    body: { username: USER, password: PASS },
  })
  if (login.status !== 200 || !login.json?.token) {
    console.error('LOGIN FAIL', login.status, login.json?.error || login.json)
    process.exit(2)
  }
  const token = login.json.token
  const csrf = login.json.csrf_token
  if (login.json.user?.must_change_password) {
    console.error('LOGIN OK but must_change_password=true — change password first')
    process.exit(2)
  }

  const areasRes = await api('GET', '/multiplier/areas?limit=100', { token })
  if (areasRes.status !== 200) {
    console.error('AREAS FAIL', areasRes.status, areasRes.json)
    process.exit(2)
  }
  const areas = areasRes.json.data || areasRes.json.areas || areasRes.json
  if (!Array.isArray(areas)) {
    console.error('AREAS unexpected shape', Object.keys(areasRes.json || {}))
    process.exit(2)
  }

  // /personnel requires a non-empty search; use common Thai vowel to collect a pool
  const peopleRes = await api('GET', `/personnel?search=${encodeURIComponent('า')}&limit=20`, {
    token,
  })
  if (peopleRes.status !== 200) {
    console.error('PERSONNEL FAIL', peopleRes.status, peopleRes.json?.error || 'unknown')
    process.exit(2)
  }
  const people = peopleRes.json.data || peopleRes.json
  const personnelIds = (Array.isArray(people) ? people : [])
    .map((p) => p.personnel_id)
    .filter(Boolean)
  if (personnelIds.length < 1) {
    console.error('No personnel_id available for UAT create (search pool empty)')
    process.exit(2)
  }

  console.log(`API ${API}`)
  console.log(`Areas loaded: ${areas.length}; personnel pool size: ${personnelIds.length}`)
  console.log('---')

  let pass = 0
  let fail = 0
  const results = []

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i]
    const area = pickArea(areas, tc)
    if (!area) {
      fail++
      results.push({
        id: tc.case_id,
        ok: false,
        detail: `no matching area for ${tc.province}/${tc.district || '(whole)'} @ ${tc.service_start_date}..${tc.service_end_date}`,
      })
      console.log(`FAIL ${tc.case_id} — no matching area`)
      continue
    }

    // rotate personnel to reduce overlap 409 risk across cases
    const personnelId = personnelIds[i % personnelIds.length]
    const create = await api('POST', '/multiplier', {
      token,
      csrf,
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
          token,
          csrf,
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
        results.push({
          id: tc.case_id,
          ok: false,
          detail: `409 overlap for all personnel (area ${area.area_multiplier_id})`,
        })
        console.log(`FAIL ${tc.case_id} — overlap 409`)
        continue
      }
      Object.assign(create, created)
    }

    if (create.status !== 201 || !create.json?.computed) {
      fail++
      results.push({
        id: tc.case_id,
        ok: false,
        detail: `HTTP ${create.status}: ${create.json?.error || JSON.stringify(create.json)}`,
      })
      console.log(`FAIL ${tc.case_id} — HTTP ${create.status}`)
      continue
    }

    const mismatches = compare(tc, create.json.computed)
    const mid = create.json.multiplier_id

    // cleanup always
    if (mid) {
      await api('DELETE', `/multiplier/${mid}`, { token, csrf })
    }

    if (mismatches.length) {
      fail++
      results.push({ id: tc.case_id, ok: false, detail: mismatches.join('; ') })
      console.log(`FAIL ${tc.case_id} — ${mismatches.join('; ')}`)
    } else {
      pass++
      results.push({
        id: tc.case_id,
        ok: true,
        detail: `area=${area.area_multiplier_id} ${area.basis_type} eligible=${create.json.computed.eligible_days} bonus=${create.json.computed.bonus_days}`,
      })
      console.log(
        `PASS ${tc.case_id} — area ${area.area_multiplier_id} (${area.basis_type}) eligible=${create.json.computed.eligible_days} bonus=${create.json.computed.bonus_days}`
      )
    }
  }

  console.log('---')
  console.log(`RESULT: ${pass}/${cases.length} PASS, ${fail} FAIL`)
  process.exit(fail ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
