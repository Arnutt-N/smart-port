import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import http from 'node:http'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { formatSanitizedUatSummary } from '../lib/sanitizedUatOutput.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const UAT_CLI = resolve(ROOT, 'scripts', 'uat-multiplier-live-api.mjs')
const CSV = resolve(ROOT, 'docs', 'multiplier_phase0_uat_cases_template.csv')

/** รัน CLI แบบ async — ห้าม spawnSync เพราะ mock server อยู่ใน process เดียวกันจะ deadlock */
function runCli(env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [UAT_CLI], {
      cwd: ROOT,
      env: { ...process.env, ...env },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d
    })
    child.stderr.on('data', (d) => {
      stderr += d
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('CLI timeout'))
    }, 60000)
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (status) => {
      clearTimeout(timer)
      resolvePromise({ status, stdout, stderr })
    })
  })
}

// sentinel ที่ห้ามหลุด stdout/stderr เด็ดขาด
const SENTINELS = [
  'SENTINEL_TOKEN_ABC123',
  'SENTINEL_REFRESH_XYZ789',
  'SENTINEL_CSRF_QQQ',
  'SENTINEL_REF_LEGAL',
  'SENTINEL_ELIG_START',
  'SENTINEL_ELIG_DAYS',
  'SENTINEL_MID_999',
  'SENTINEL_ERROR_BODY',
]

function parseTemplateCases() {
  const lines = readFileSync(CSV, 'utf8').trim().split(/\r?\n/)
  const headers = lines[0].split(',')
  return lines.slice(1).filter(Boolean).map((line) => {
    const cols = line.split(',')
    const row = {}
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? ''
    })
    return row
  })
}

function buildAreas(cases) {
  const seen = new Set()
  const areas = []
  for (const tc of cases) {
    const district = !tc.district || tc.district === 'NULL' ? '' : tc.district.trim()
    const key = `${tc.province.trim()}|${district}`
    if (seen.has(key)) continue
    seen.add(key)
    areas.push({
      area_multiplier_id: 9001 + areas.length,
      province: tc.province.trim(),
      district,
      basis_type: 'EMERGENCY_DECREE',
      multiplier_ratio: 200,
      effective_start_date: '1990-01-01',
      effective_end_date: '',
      legal_reference: `SENTINEL_REF_LEGAL ${key}`,
      source_reference: 'synthetic',
    })
  }
  return areas
}

function startMock(cases, { deleteStatus = 200 } = {}) {
  const areas = buildAreas(cases)
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const send = (status, headers, payload) => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
        res.end(payload)
      }
      const url = req.url.split('?')[0]
      if (req.method === 'POST' && url === '/api/auth/login') {
        // ค่า credential ใน body ต้องไม่หลุด output
        send(
          200,
          { 'Set-Cookie': 'sp_access=SENTINEL_TOKEN_ABC123; Path=/; HttpOnly; SameSite=Lax' },
          JSON.stringify({
            token: 'SENTINEL_TOKEN_ABC123',
            refresh_token: 'SENTINEL_REFRESH_XYZ789',
            csrf_token: 'SENTINEL_CSRF_QQQ',
            user: { id: 1, username: 'uat', must_change_password: false },
          })
        )
      } else if (url === '/api/multiplier/areas') {
        send(200, {}, JSON.stringify({ data: areas }))
      } else if (url === '/api/personnel') {
        send(200, {}, JSON.stringify({ data: [{ personnel_id: 1 }, { personnel_id: 2 }] }))
      } else if (req.method === 'POST' && url === '/api/multiplier') {
        // computed ทุกฟิลด์เป็น sentinel → mismatch เสมอ ห้ามมีค่าเหล่านี้ใน output
        send(
          201,
          {},
          JSON.stringify({
            multiplier_id: 'SENTINEL_MID_999',
            computed: {
              eligible_start_date: 'SENTINEL_ELIG_START',
              eligible_end_date: 'SENTINEL_ELIG_START',
              service_days: 'SENTINEL_ELIG_DAYS',
              eligible_days: 'SENTINEL_ELIG_DAYS',
              effective_days: 'SENTINEL_ELIG_DAYS',
              bonus_days: 'SENTINEL_ELIG_DAYS',
              net_years: 'SENTINEL_ELIG_DAYS',
              net_months: 'SENTINEL_ELIG_DAYS',
              net_day_remainder: 'SENTINEL_ELIG_DAYS',
              error: 'SENTINEL_ERROR_BODY',
            },
          })
        )
      } else if (req.method === 'DELETE' && url.startsWith('/api/multiplier/')) {
        send(deleteStatus, {}, JSON.stringify({ ok: deleteStatus < 300, note: 'SENTINEL_ERROR_BODY' }))
      } else {
        send(404, {}, JSON.stringify({ error: 'SENTINEL_ERROR_BODY' }))
      }
    })
  })
  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => {
      resolvePromise({ server, port: server.address().port })
    })
  })
}

test('UAT CLI ปล่อยเฉพาะ aggregate/field name — ไม่มี sentinel/case id หลุด stdout/stderr', async () => {
  const cases = parseTemplateCases()
  assert.ok(cases.length >= 10, 'template ต้องมีเคสครบ')
  const { server, port } = await startMock(cases)
  try {
    const result = await runCli({ API_BASE: `http://127.0.0.1:${port}` })
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`

    assert.equal(result.error, undefined, result.error?.message)
    // mismatch ทุกเคส → exit 1 (ไม่ใช่ 0)
    assert.equal(result.status, 1, output)

    // aggregate และ allowlisted field names ต้องอยู่
    assert.match(output, /RESULT: passed=0\/\d+ failed=\d+/)
    assert.match(output, /eligible_days/)
    assert.match(output, /Areas loaded: \d+/)

    // ห้าม sentinel ใด ๆ หลุด
    for (const sentinel of SENTINELS) {
      assert.ok(!output.includes(sentinel), `stdout/stderr ต้องไม่มี ${sentinel}`)
    }
    // ห้ามมี case ID (TC-xxx) และห้ามมีค่า expected/got รูปแบบเก่า
    assert.ok(!/TC-\d+/u.test(output), 'ห้ามมี case ID ใน output')
    assert.ok(!/expected .*got/u.test(output), 'ห้ามมี expected/got detail')
    assert.ok(!/multiplier_id=/u.test(output), 'ห้ามมี row id ใน output')
  } finally {
    await new Promise((r) => server.close(r))
  }
})

test('UAT CLI login ล้มเหลว — output มีแค่ status ไม่มี body/sentinel', async () => {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url.split('?')[0] === '/api/auth/login') {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'SENTINEL_ERROR_BODY', token: 'SENTINEL_TOKEN_ABC123' }))
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end('{}')
  })
  const port = await new Promise((r) => {
    server.listen(0, '127.0.0.1', () => r(server.address().port))
  })
  try {
    const result = await runCli({ API_BASE: `http://127.0.0.1:${port}` })
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    assert.equal(result.status, 2, output)
    assert.match(output, /LOGIN FAIL status=401/)
    assert.ok(!output.includes('SENTINEL_ERROR_BODY'), 'ห้ามมี error body')
    assert.ok(!output.includes('SENTINEL_TOKEN_ABC123'), 'ห้ามมี token')
  } finally {
    await new Promise((r) => server.close(r))
  }
})

test('UAT CLI รายงาน cleanup_failed เมื่อลบ row ไม่สำเร็จ และ exit 1', async () => {
  const cases = parseTemplateCases()
  const { server, port } = await startMock(cases, { deleteStatus: 500 })
  try {
    const result = await runCli({ API_BASE: `http://127.0.0.1:${port}` })
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`

    assert.equal(result.status, 1)
    // cleanup failure ต้องถูกนับและรายงาน — ห้ามปล่อยผ่านเป็น 0
    assert.match(output, /cleanup_failed=([1-9]\d*)/)
    // ยังคง privacy: ไม่มี sentinel ใด ๆ
    for (const sentinel of SENTINELS) {
      assert.ok(!output.includes(sentinel), `stdout/stderr ต้องไม่มี ${sentinel}`)
    }
    assert.ok(!/multiplier_id=/u.test(output))
  } finally {
    await new Promise((r) => server.close(r))
  }
})

test('formatSanitizedUatSummary เก็บเฉพาะชื่อฟิลด์ใน allowlist', () => {
  const summary = formatSanitizedUatSummary({
    total: 3,
    passed: 1,
    failed: 2,
    mismatchFields: ['personnel_id', 'eligible_days', 'province', 'eligible_days'],
  })

  assert.deepEqual(summary.mismatchFields, { eligible_days: 2 })
  assert.equal(summary.total, 3)
  assert.equal(summary.passed, 1)
  assert.equal(summary.failed, 2)
})
