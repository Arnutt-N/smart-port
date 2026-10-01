import { afterEach, describe, expect, it, vi } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/server'
import type { SmartPortClient } from '../src/api.js'
import { registerCandidateTool } from '../src/tools/candidates.js'
import { registerDashboardTool } from '../src/tools/dashboard.js'
import { registerProbationTool } from '../src/tools/probation.js'

interface ToolResult {
  content: Array<{ text: string }>
  isError?: boolean
}
type Handler = (args: Record<string, unknown>) => Promise<ToolResult>

const LEAK = '1234567890123'

// ลงทะเบียน tool กับ server จำลอง แล้วดึง handler จริงออกมาเรียก — api.get ถูก stub ให้คืน payload ที่ต้องการ
function captureHandler(
  register: (s: McpServer, a: SmartPortClient) => void,
  json: unknown,
  failure?: Error,
): Handler {
  let handler: Handler | undefined
  const server = {
    registerTool: (_name: string, _config: unknown, h: Handler) => {
      handler = h
    },
  } as unknown as McpServer
  const get = failure === undefined ? vi.fn().mockResolvedValue({ status: 200, json }) : vi.fn().mockRejectedValue(failure)
  const api = { get } as unknown as SmartPortClient
  register(server, api)
  if (handler === undefined) throw new Error('tool ไม่ได้ลงทะเบียน handler')
  return handler
}

const TOOLS: Array<[string, (s: McpServer, a: SmartPortClient) => void, Record<string, unknown>]> = [
  ['dashboard_summary', registerDashboardTool, {}],
  ['candidate_search', registerCandidateTool, {}],
  ['probation_watch', registerProbationTool, { limit: 20, offset: 0 }],
]

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tool handlers — M3 guard ต่อสายครบทุก tool', () => {
  it.each(TOOLS)('%s: payload สะอาดผ่านและเท่ากับ JSON.stringify (สัญญาเดิมไม่เปลี่ยน)', async (_name, register, args) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const payload = { ok: 1, rows: [{ enrollment_id: 7 }] }
    const result = await captureHandler(register, payload)(args)
    expect(result.isError).toBeUndefined()
    expect(result.content[0].text).toBe(JSON.stringify(payload))
  })

  it.each(TOOLS)('%s: payload ที่มีเลข 13 หลัก → isError และไม่ส่งเลขต่อให้ model', async (_name, register, args) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await captureHandler(register, { citizen_id: LEAK })(args)
    expect(result.isError).toBe(true)
    expect(result.content[0].text).not.toContain(LEAK)
    expect(result.content[0].text).toContain('13 หลัก')
  })

  it.each(TOOLS)('%s: log ตอน guard ทำงานมี status 0 และไม่มีเลขที่ตรวจเจอ', async (name, register, args) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await captureHandler(register, { citizen_id: LEAK })(args)
    const logged = spy.mock.calls.map((call) => String(call[0]))
    expect(logged.join('\n')).not.toContain(LEAK)
    // parse เฉพาะบรรทัด JSON — ถ้ามี log รูปแบบอื่นแทรกในอนาคตจะไม่ทำให้ test ล้มด้วย SyntaxError ที่อ่านไม่รู้เรื่อง
    const entries = logged
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line) as { tool?: string, status?: number })
    expect(entries.some((entry) => entry.tool === name && entry.status === 0)).toBe(true)
  })

  it.each(TOOLS)('%s: api.get ล้ม → isError พร้อมข้อความเดิมของ error (ไม่ใช่ payload) และ log status 0', async (name, register, args) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await captureHandler(register, undefined, new Error('ล็อกอินไม่สำเร็จ — ตรวจรหัสบัญชี'))(args)
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('ล็อกอินไม่สำเร็จ — ตรวจรหัสบัญชี')
    const entries = spy.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line) as { tool?: string, status?: number })
    expect(entries.some((entry) => entry.tool === name && entry.status === 0)).toBe(true)
  })
})
