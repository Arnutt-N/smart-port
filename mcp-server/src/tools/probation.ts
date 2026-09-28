import type { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import type { SmartPortClient } from '../api.js'
import { logToolCall } from '../logger.js'
import { toolErrorText } from './shared.js'

export const probationInput = z.object({
  enrollment_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('ระบุ = รายละเอียดรายคน (ผลการประเมิน/ขยายเวลา/คำสั่ง), ไม่ระบุ = รายชื่อทั้งหมด'),
  search: z.string().max(200).optional().describe('ค้นชื่อ/ตำแหน่ง/หน่วย — ใช้กับรายชื่อเท่านั้น'),
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
})

type ProbationArgs = z.infer<typeof probationInput>

export function registerProbationTool(server: McpServer, api: SmartPortClient): void {
  server.registerTool(
    'probation_watch',
    {
      description:
        'ติดตามพ้นทดลองปฏิบัติราชการ: ไม่ส่ง enrollment_id = รายชื่อพร้อม remaining_days (วันเหลือ — ติดลบ = เกินกำหนด), ' +
        'สถานะ IN_PROGRESS/COMPLETED/FAILED/EXTENDED, งานที่ทำแล้ว/ทั้งหมด, สรุปยอดรวม/ใกล้ครบ/เกินกำหนด; ' +
        'วันใกล้ครบกำหนด = เหลือ 0–30 วัน (รวมวันครบกำหนด)',
      inputSchema: probationInput,
    },
    async (args: ProbationArgs) => {
      const started = Date.now()
      try {
        let path = ''
        if (args.enrollment_id !== undefined) {
          path = `/probation/${args.enrollment_id}`
        } else {
          const params = new URLSearchParams()
          if (args.search !== undefined && args.search !== '') params.set('search', args.search)
          params.set('limit', String(args.limit))
          params.set('offset', String(args.offset))
          path = `/probation?${params.toString()}`
        }
        const { status, json } = await api.get(path)
        logToolCall('probation_watch', args, status, Date.now() - started)
        return { content: [{ type: 'text', text: JSON.stringify(json) }] }
      } catch (error) {
        logToolCall('probation_watch', args, 0, Date.now() - started)
        return { content: [{ type: 'text', text: toolErrorText(error) }], isError: true }
      }
    },
  )
}
