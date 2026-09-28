import type { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import type { SmartPortClient } from '../api.js'
import { logToolCall } from '../logger.js'
import { toolErrorText } from './shared.js'

export const dashboardInput = z.object({})

export function registerDashboardTool(server: McpServer, api: SmartPortClient): void {
  server.registerTool(
    'dashboard_summary',
    {
      description:
        'ภาพรวมทั้งองค์กร: จำนวนบุคลากร, สถานะพ้นทดลองปฏิบัติราชการ (รวม/กำลังดำเนินการ/ใกล้ครบกำหนด/เกินกำหนด), ' +
        'ยอดรายการนับเวลา (เกื้อกูล/แตกต่าง/เทียบตำแหน่ง), สถิตินับทวีคูณ, จำนวนผู้มีคุณสมบัติเลื่อนระดับแยกตามระดับ — ไม่มีพารามิเตอร์',
      inputSchema: dashboardInput,
    },
    async () => {
      const started = Date.now()
      try {
        const { status, json } = await api.get('/dashboard')
        logToolCall('dashboard_summary', {}, status, Date.now() - started)
        return { content: [{ type: 'text', text: JSON.stringify(json) }] }
      } catch (error) {
        logToolCall('dashboard_summary', {}, 0, Date.now() - started)
        return { content: [{ type: 'text', text: toolErrorText(error) }], isError: true }
      }
    },
  )
}
