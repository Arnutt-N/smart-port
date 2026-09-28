// scripts/stdio-smoke.mjs — คุย JSON-RPC กับ server จริงผ่าน stdio (ต้องการ env credential)
// รัน: $env:SP_SERVICE_PASSWORD='...' (ดู README); พิมพ์แค่โครงสร้าง ไม่พิมพ์ชื่อคน
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const child = spawn('node', [path.join(root, 'dist', 'index.js')], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env,
})

let failures = 0
const check = (label, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`)
  if (!cond) failures += 1
}

child.stderr.on('data', (chunk) => {
  for (const line of String(chunk).split('\n')) {
    if (line.trim() !== '') console.log(`[server:stderr] ${line.trim()}`)
  }
})

const pending = new Map()
let nextId = 1
let buffer = ''
child.stdout.on('data', (chunk) => {
  buffer += String(chunk)
  let idx
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (line === '') continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      check('response is JSON', false)
      continue
    }
    const waiter = pending.get(msg.id)
    if (waiter !== undefined) {
      pending.delete(msg.id)
      waiter(msg)
    }
  }
})

function request(method, params) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`timeout waiting ${method}`))
    }, 20000)
    pending.set(id, (msg) => {
      clearTimeout(timer)
      resolve(msg)
    })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
}

function notify(method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
}

function textOf(callResult) {
  return callResult?.result?.content?.[0]?.text ?? ''
}

const finish = (code) => {
  child.kill()
  process.exit(code)
}
process.on('uncaughtException', (error) => {
  console.log(`FAIL uncaught: ${error.message}`)
  finish(1)
})

const init = await request('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'stdio-smoke', version: '0.1.0' },
})
check('initialize', init.result?.serverInfo?.name === 'smartport')
check('protocol negotiated', typeof init.result?.protocolVersion === 'string')
notify('notifications/initialized', {})

const listed = await request('tools/list', {})
const names = (listed.result?.tools ?? []).map((t) => t.name).sort()
check(
  'tools/list has 3 tools',
  JSON.stringify(names) === JSON.stringify(['candidate_search', 'dashboard_summary', 'probation_watch']),
)

const dash = await request('tools/call', { name: 'dashboard_summary', arguments: {} })
const dashJson = JSON.parse(textOf(dash))
check('dashboard_summary keys', dashJson.success === true && typeof dashJson.total_personnel === 'number')

const cand = await request('tools/call', {
  name: 'candidate_search',
  arguments: { target_level: 'K2', limit: 1 },
})
const candJson = JSON.parse(textOf(cand))
check('candidate_search K2', candJson.success === true && typeof candJson.pagination?.total === 'number')

const prob = await request('tools/call', { name: 'probation_watch', arguments: { limit: 1 } })
const probJson = JSON.parse(textOf(prob))
check('probation_watch list', probJson.success === true && Array.isArray(probJson.data))

console.log(failures === 0 ? 'smoke: PASS' : 'smoke: FAIL')
finish(failures === 0 ? 0 : 1)
