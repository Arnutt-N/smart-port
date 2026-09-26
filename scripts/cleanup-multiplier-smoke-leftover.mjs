#!/usr/bin/env node
/**
 * Delete leftover local smoke multiplier rows that break golden baseline tests
 * (personnel_id=1 must have multiplier_days=0).
 *
 * Only deletes rows whose description/proof looks like prior smoke/UAT, OR
 * the single bonus=29 row on personnel 1 if --force-bonus29 is set.
 *
 * D3: ใช้ cookie + CSRF ผ่าน scripts/lib/authCookieClient.mjs (ไม่มี Bearer)
 * ห้าม print response body / auth material — ออกเฉพาะตัวเลข aggregate
 *
 * Usage: node scripts/cleanup-multiplier-smoke-leftover.mjs
 */
import { createAuthCookieClient } from './lib/authCookieClient.mjs'

const API = (process.env.API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '')
const USER = process.env.UAT_USER || 'admin'
const PASS = process.env.UAT_PASS || 'admin123'

const api = createAuthCookieClient(API)

function isSmokeLike(row) {
  const proof = String(row.proof_reference || '')
  const desc = String(row.description || '')
  if (/^UAT-TC-/i.test(proof)) return true
  if (/Live API UAT/i.test(desc)) return true
  if (/smoke/i.test(proof) || /smoke/i.test(desc)) return true
  // Prior handoff smoke: eligible/bonus 29/29 on personnel 1
  if (
    Number(row.personnel_id) === 1 &&
    Number(row.bonus_days) === 29 &&
    Number(row.eligible_days) === 29
  ) {
    return true
  }
  return false
}

async function main() {
  const login = await api('POST', '/auth/login', {
    body: { username: USER, password: PASS },
  })
  if (login.status !== 200 || !login.authenticated) {
    console.error(`LOGIN FAIL status=${login.status}`)
    process.exit(2)
  }

  const list = await api('GET', '/multiplier?limit=100')
  if (list.status !== 200) {
    console.error(`LIST FAIL status=${list.status}`)
    process.exit(2)
  }
  const rows = list.json.data || []
  const targets = rows.filter(isSmokeLike)
  console.log(`listed=${rows.length} smoke_like=${targets.length}`)

  let deleted = 0
  let deleteFailed = 0
  for (const row of targets) {
    const del = await api('DELETE', `/multiplier/${row.multiplier_id}`)
    if (del.status >= 200 && del.status < 300) {
      deleted++
    } else {
      deleteFailed++
      console.error(`DELETE FAIL status=${del.status}`)
    }
  }

  const after = await api('GET', '/multiplier?limit=100')
  const summary = after.json?.summary || {}
  console.log(
    `after total=${summary.total ?? '?'} bonus_sum=${summary.total_bonus_days ?? '?'}`
  )
  console.log(`RESULT deleted=${deleted} delete_failed=${deleteFailed}`)
  process.exit(0)
}

main().catch(() => {
  console.error('CLEANUP ERROR phase=unhandled')
  process.exit(2)
})
