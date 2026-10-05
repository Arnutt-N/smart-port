// MS-15: index.ts wiring — spawn process จริง (brittle ใน CI จึงเก็บแยกจาก unit test)
// ต้อง build ก่อน (npm run build) — ถ้าไม่มี dist/ skip อย่างมีเสียง ไม่ fail เงียบ
import { describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const DIST_INDEX = resolve(import.meta.dirname, '../dist/index.js')

interface RunResult { code: number | null, stdout: string, stderr: string }

function runCli(env: NodeJS.ProcessEnv, stdinEnds: boolean): Promise<RunResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [DIST_INDEX], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('error', rejectPromise)
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }))
    if (stdinEnds) child.stdin.end()
    else setTimeout(() => child.stdin.end(), 500).unref()
    setTimeout(() => { child.kill('SIGKILL'); rejectPromise(new Error(`timeout\nstdout:${stdout}\nstderr:${stderr}`)) }, 10_000).unref()
  })
}

const distReady = existsSync(DIST_INDEX)
describe.skipIf(!distReady)('index wiring (MS-15)', () => {
  it('env ขาด SMARTPORT_API_URL → exit 1 + error ชัดเจน + ไม่มี banner', async () => {
    const r = await runCli({ SMARTPORT_API_URL: '', SP_SERVICE_USERNAME: 'x', SP_SERVICE_PASSWORD: 'y' }, true)
    expect(r.code).toBe(1)
    expect(r.stderr).toContain('SMARTPORT_API_URL')
    expect(r.stderr).not.toContain('running on stdio')
  })

  it('env ครบ (loopback) + stdin EOF → banner ไป stderr และ exit 0', async () => {
    const r = await runCli(
      { SMARTPORT_API_URL: 'http://127.0.0.1:8000/api', SP_SERVICE_USERNAME: 'svc', SP_SERVICE_PASSWORD: 'pw' },
      true,
    )
    expect(r.code).toBe(0)
    expect(r.stderr).toContain('running on stdio')
    expect(r.stdout.trim()).toBe('') // stdout สงวนให้ protocol
  })

  it('--self-test กับ env ขาด → exit 1', async () => {
    const result = await new Promise<RunResult>((resolvePromise) => {
      const child = spawn(process.execPath, [DIST_INDEX, '--self-test'], {
        env: { ...process.env, SMARTPORT_API_URL: '', SP_SERVICE_USERNAME: '', SP_SERVICE_PASSWORD: '' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let out = ''; let err = ''
      child.stdout.on('data', (d) => { out += d })
      child.stderr.on('data', (d) => { err += d })
      child.on('close', (code) => resolvePromise({ code, stdout: out, stderr: err }))
      setTimeout(() => { child.kill('SIGKILL'); resolvePromise({ code: null, stdout: out, stderr: err }) }, 10_000).unref()
    })
    expect(result.code).toBe(1)
  })
})

if (!distReady) console.log('index.wiring.test: dist/index.js ไม่มี — ข้ามไว้ก่อน (npm run build ก่อนรัน)')
