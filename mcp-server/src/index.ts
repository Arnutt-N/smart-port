import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createRuntime, type Runtime } from './runtime.js'
import { selfTest } from './selftest.js'

if (process.argv.includes('--self-test')) {
  // MS-12: process.exit() ตรงนี้ทำให้ libuv crash บน Windows เมื่อยังมี handle ค้าง
  // (undici keep-alive) — ตั้ง exitCode แล้วปล่อยให้ event loop ว่างก่อนจบเอง
  // fallback force-exit ต้องเริ่มหลัง selfTest settle เท่านั้น ไม่งั้นเครือข่ายช้า
  // จะถูกบังคับออกด้วย code ที่ยังไม่ใช่ผลจริง (false PASS)
  void selfTest().then(
    (code) => {
      process.exitCode = code
      setTimeout(() => process.exit(code), 1000).unref()
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : 'self-test ล้มเหลว')
      process.exitCode = 1
      setTimeout(() => process.exit(1), 1000).unref()
    },
  )
} else {
  let runtime: Runtime
  try {
    runtime = createRuntime() // ล้มที่นี่ = ก่อน banner/ก่อนรับ connection
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'ตั้งค่า server ไม่ถูกต้อง')
    process.exit(1)
  }
  // ปิด process = เพิกถอน refresh token ฝั่ง server (best-effort; logout มี timeout 5 วิ ไม่ค้าง)
  const stop = (): void => {
    void runtime.shutdown().finally(() => process.exit(0))
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  // client ปิด pipe (stdin EOF): transport ปิดเองและ process จบเอง — แต่ต้อง revoke refresh token ก่อนจบ
  process.stdin.once('end', () => {
    void runtime.shutdown()
  })
  // stdout สงวนให้ protocol — banner ลง stderr เท่านั้น
  void serveStdio(runtime.createServer)
  console.error('smartport MCP server running on stdio')
}
