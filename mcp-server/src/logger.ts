// Log ลง stderr เท่านั้น (stdout สงวนให้ MCP protocol) + sanitize ตามมติ pii-policy:
// เก็บได้แค่ metadata + internal ID — ห้ามชื่อคน/search text/citizen_id/credential
const ALLOWED_PARAM_KEYS = new Set([
  'target_level',
  'limit',
  'offset',
  'enrollment_id',
  'personnel_id',
  'area_multiplier_id',
  'province',
  'district',
  'active_only',
])

export function sanitizeParams(params: unknown): Record<string, unknown> {
  if (typeof params !== 'object' || params === null) return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    out[key] = ALLOWED_PARAM_KEYS.has(key) ? value : '[redacted]'
  }
  return out
}

export function logToolCall(tool: string, params: unknown, status: number, latencyMs: number): void {
  console.error(JSON.stringify({ tool, params: sanitizeParams(params), status, latencyMs }))
}

// detail รับได้แค่รหัสสถานะ (เช่น http=401) — ห้าม body/cookie/token
export function logSession(event: 'login' | 'refresh' | 'logout', ok: boolean, detail = ''): void {
  console.error(JSON.stringify({ session: event, ok, ...(detail === '' ? {} : { detail }) }))
}
