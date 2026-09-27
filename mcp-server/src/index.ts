import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { SmartPortClient } from './api.js'
import { loadConfig } from './config.js'
import { selfTest } from './selftest.js'
import { registerCandidateTool } from './tools/candidates.js'
import { registerDashboardTool } from './tools/dashboard.js'
import { registerProbationTool } from './tools/probation.js'

function createServer(): McpServer {
  const config = loadConfig()
  const api = new SmartPortClient(config.apiUrl, config.username, config.password)
  const server = new McpServer({ name: 'smartport', version: '0.1.0' })
  registerDashboardTool(server, api)
  registerCandidateTool(server, api)
  registerProbationTool(server, api)
  // ปิด process = เพิกถอน refresh token ฝั่ง server (best-effort, ไม่ขวาง exit)
  const shutdown = (): void => {
    void api.logout().finally(() => process.exit(0))
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  return server
}

if (process.argv.includes('--self-test')) {
  void selfTest().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : 'self-test ล้มเหลว')
      process.exit(1)
    },
  )
} else {
  // stdout สงวนให้ protocol — banner ลง stderr เท่านั้น
  void serveStdio(createServer)
  console.error('smartport MCP server running on stdio')
}
