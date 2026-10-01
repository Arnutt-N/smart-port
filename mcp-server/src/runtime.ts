import { McpServer } from '@modelcontextprotocol/server'
import { SmartPortClient } from './api.js'
import { loadConfig } from './config.js'
import { registerCandidateTool } from './tools/candidates.js'
import { registerDashboardTool } from './tools/dashboard.js'
import { registerProbationTool } from './tools/probation.js'

export interface Runtime {
  createServer: () => McpServer
  shutdown: () => Promise<void>
}

// state ระดับ process (config + client + shutdown) สร้างครั้งเดียว — SDK เรียก factory ต่อ connection
export function createRuntime(env: NodeJS.ProcessEnv = process.env): Runtime {
  const config = loadConfig(env)
  const api = new SmartPortClient(config.apiUrl, config.username, config.password)
  let shutdownFlight: Promise<void> | null = null
  return {
    createServer: () => {
      const server = new McpServer({ name: 'smartport', version: '0.1.0' })
      registerDashboardTool(server, api)
      registerCandidateTool(server, api)
      registerProbationTool(server, api)
      return server
    },
    shutdown: () => (shutdownFlight ??= api.logout()),
  }
}
