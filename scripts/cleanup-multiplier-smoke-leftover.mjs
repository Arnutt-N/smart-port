#!/usr/bin/env node
/**
 * Delete leftover local smoke multiplier rows that break golden baseline tests
 * (personnel_id=1 must have multiplier_days=0).
 *
 * Only deletes rows whose description/proof looks like prior smoke/UAT, OR
 * the single bonus=29 row on personnel 1 if --force-bonus29 is set.
 *
 * Usage: node scripts/cleanup-multiplier-smoke-leftover.mjs
 */
const API = (process.env.API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '')
const USER = process.env.UAT_USER || 'admin'
const PASS = process.env.UAT_PASS || 'admin123'

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
  if (login.status !== 200 || !login.json?.token) {
    console.error('LOGIN FAIL', login.status, login.json?.error || 'unknown')
    process.exit(2)
  }
  const token = login.json.token
  const csrf = login.json.csrf_token

  const list = await api('GET', '/multiplier?limit=100', { token })
  if (list.status !== 200) {
    console.error('LIST FAIL', list.status, list.json?.error || 'unknown')
    process.exit(2)
  }
  const rows = list.json.data || []
  const targets = rows.filter(isSmokeLike)
  console.log(`listed=${rows.length} smoke_like=${targets.length}`)

  let deleted = 0
  for (const row of targets) {
    const id = row.multiplier_id
    const del = await api('DELETE', `/multiplier/${id}`, { token, csrf })
    if (del.status >= 200 && del.status < 300) {
      deleted++
      console.log(`deleted multiplier_id=${id} bonus=${row.bonus_days}`)
    } else {
      console.error(`DELETE FAIL id=${id} status=${del.status}`)
    }
  }

  const after = await api('GET', '/multiplier?limit=100', { token })
  const summary = after.json?.summary || {}
  console.log(
    `after total=${summary.total ?? '?'} bonus_sum=${summary.total_bonus_days ?? '?'}`
  )
  console.log(`RESULT deleted=${deleted}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
