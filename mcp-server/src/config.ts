// Env contract ฉบับจริง (docs/wayfinder/assets/service-account.md)
// มีแค่ชื่อตัวแปร — ค่าจริงห้ามเข้า repo (อยู่ใน Desktop config env)
export interface McpConfig {
  apiUrl: string
  username: string
  password: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const apiUrl = (env.SMARTPORT_API_URL ?? '').trim().replace(/\/+$/, '')
  const username = (env.SP_SERVICE_USERNAME ?? '').trim()
  const password = env.SP_SERVICE_PASSWORD ?? ''
  const missing: string[] = []
  if (apiUrl === '') missing.push('SMARTPORT_API_URL')
  if (username === '') missing.push('SP_SERVICE_USERNAME')
  if (password === '') missing.push('SP_SERVICE_PASSWORD')
  if (missing.length > 0) {
    throw new Error(`ขาด env ที่จำเป็น: ${missing.join(', ')} (ดู .env.example)`)
  }
  return { apiUrl, username, password }
}
