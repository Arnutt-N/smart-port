import { beforeEach, describe, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/server'
import { createRuntime } from '../src/runtime.js'

// vi.mock ถูก hoist ขึ้นก่อน import — ตัวแปรที่ factory ใช้ต้องมาจาก vi.hoisted
const mocks = vi.hoisted(() => ({ ctor: vi.fn(), logout: vi.fn() }))
vi.mock('../src/api.js', () => ({
  SmartPortClient: class {
    constructor(...args: unknown[]) {
      mocks.ctor(...args)
    }

    logout = mocks.logout
  },
}))

const VALID_ENV = {
  SMARTPORT_API_URL: 'https://smart-port.onrender.com/api',
  SP_SERVICE_USERNAME: 'u',
  SP_SERVICE_PASSWORD: 'p',
}

// vi.fn ใน vi.hoisted ไม่ถูกล้างอัตโนมัติ (ไม่มี clearMocks ใน config) — ไม่ล้างจะทำให้จำนวนเรียกข้ามเทสต์
beforeEach(() => {
  mocks.ctor.mockClear()
  mocks.logout.mockClear()
  mocks.logout.mockResolvedValue(undefined)
})

const signalListeners = (): number => process.listenerCount('SIGINT') + process.listenerCount('SIGTERM')

describe('createRuntime (MS-04 / MS-05)', () => {
  it('config ผิดล้มทันทีที่ createRuntime (ก่อนมี connection) และไม่สร้าง client', () => {
    expect(() => createRuntime({})).toThrow('SMARTPORT_API_URL')
    expect(() => createRuntime({ ...VALID_ENV, SMARTPORT_API_URL: 'https://evil.example/api' })).toThrow(
      'ไม่อยู่ในรายการที่อนุญาต',
    )
    expect(mocks.ctor).not.toHaveBeenCalled()
  })

  it('createServer เรียกหลายครั้ง (SDK เรียกต่อ connection) ได้ McpServer คนละตัวแต่ใช้ client ตัวเดียว', () => {
    const runtime = createRuntime(VALID_ENV)
    const first = runtime.createServer()
    const second = runtime.createServer()
    expect(first).toBeInstanceOf(McpServer)
    expect(second).toBeInstanceOf(McpServer)
    expect(first).not.toBe(second)
    expect(mocks.ctor).toHaveBeenCalledTimes(1)
  })

  it('shutdown เรียกซ้ำ/พร้อมกันได้ promise เดียวกัน และ logout ครั้งเดียว', async () => {
    const runtime = createRuntime(VALID_ENV)
    const flights = [runtime.shutdown(), runtime.shutdown(), runtime.shutdown()]
    expect(Object.is(flights[0], flights[1])).toBe(true)
    expect(Object.is(flights[1], flights[2])).toBe(true)
    await Promise.all(flights)
    expect(mocks.logout).toHaveBeenCalledTimes(1)
  })

  // ล็อก regression "ลง signal handler ใน factory (ต่อ connection)" — การต่อสาย SIGINT/SIGTERM/stdin 'end'/fail-fast จริงอยู่ที่ index.ts
  // ซึ่งไม่มี unit test (ต้อง spawn process): ตรวจด้วย smoke ใน PRP T8 ไม่ใช่ test นี้ (finding ที่เลื่อน: MS-15)
  it('createRuntime + createServer หลายครั้ง ไม่เพิ่ม signal listener (ลงที่ index.ts ครั้งเดียวต่อ process)', () => {
    const before = signalListeners()
    const runtime = createRuntime(VALID_ENV)
    runtime.createServer()
    runtime.createServer()
    expect(signalListeners()).toBe(before)
  })
})
