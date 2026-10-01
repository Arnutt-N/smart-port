import type { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import type { SmartPortClient } from '../api.js'
import { logToolCall } from '../logger.js'
import { toolErrorText, toolJsonText } from './shared.js'

// ระดับเป้าหมายตาม routes/candidates.php:78 (+ O1 ไม่มีใน valid targets — อย่าเพิ่มเอง)
const TARGET_LEVELS = ['K2', 'K3', 'K4', 'O2', 'O3', 'M1', 'M2', 'S1', 'S2'] as const

export const candidateInput = z.object({
  target_level: z
    .enum(TARGET_LEVELS)
    .optional()
    .describe('ระดับเป้าหมาย เช่น K2 — ไม่ส่ง = ภาพรวมทุกระดับ (ยอดรวม + top5 ใกล้ครบเกณฑ์)'),
  search: z.string().max(200).optional().describe('ค้นชื่อ/ตำแหน่ง — ใช้กับรายระดับเท่านั้น'),
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
})

type CandidateArgs = z.infer<typeof candidateInput>

export function registerCandidateTool(server: McpServer, api: SmartPortClient): void {
  server.registerTool(
    'candidate_search',
    {
      description:
        'บัญชีรายชื่อผู้มีคุณสมบัติเลื่อนระดับ: ไม่ส่ง target_level = ภาพรวมทุกระดับ; ส่ง target_level = รายชื่อรายระดับ ' +
        'พร้อมสถานะ qualified (ครบเกณฑ์แล้ว) / not_yet (ยังไม่ครบ) / check_data (ข้อมูลไม่พอ), วันครบเกณฑ์ (qualification_date_thai), ' +
        'วันเหลือ (remaining_days — ติดลบ = เลยเกณฑ์มาแล้ว), วันใกล้เกณฑ์ = เหลือ 1–90 วัน',
      inputSchema: candidateInput,
    },
    async (args: CandidateArgs) => {
      const started = Date.now()
      try {
        let path = '/candidates/overview'
        if (args.target_level !== undefined) {
          const params = new URLSearchParams()
          if (args.search !== undefined && args.search !== '') params.set('search', args.search)
          params.set('limit', String(args.limit))
          params.set('offset', String(args.offset))
          path = `/candidates/${args.target_level}?${params.toString()}`
        }
        const { status, json } = await api.get(path)
        const text = toolJsonText(json)
        logToolCall('candidate_search', args, status, Date.now() - started)
        return { content: [{ type: 'text', text }] }
      } catch (error) {
        logToolCall('candidate_search', args, 0, Date.now() - started)
        return { content: [{ type: 'text', text: toolErrorText(error) }], isError: true }
      }
    },
  )
}
