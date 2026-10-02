// Env contract ฉบับจริง (docs/wayfinder/assets/service-account.md)
// มีแค่ชื่อตัวแปร — ค่าจริงห้ามเข้า repo (อยู่ใน Desktop config env)
export interface McpConfig {
  apiUrl: string
  username: string
  password: string
}

// host ที่ server ยอมส่ง credential ไปให้ — เทียบ hostname ตรงตัว (ไม่ใช่ suffix)
// เพิ่มได้ผ่าน SMARTPORT_API_ALLOWED_HOSTS (คั่น ,) แต่ยังบังคับ https เสมอ
const DEFAULT_ALLOWED_HOSTS: readonly string[] = ['smart-port.onrender.com']
const LOOPBACK_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '[::1]']

// DNS label ปกติ คั่นด้วย '.' เดี่ยว — ปฏิเสธ 'a..b', จุดนำ/ท้าย; รับ punycode 'xn--…' ได้
const HOST_ENTRY = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/

function parseAllowedHosts(raw: string | undefined): string[] {
  const extra = (raw ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host !== '')
  if (extra.some((host) => !HOST_ENTRY.test(host))) {
    throw new Error('SMARTPORT_API_ALLOWED_HOSTS รับเฉพาะชื่อ host (เช่น hr.example.go.th) คั่นด้วย , — ห้ามมี scheme/พอร์ต/path')
  }
  return [...DEFAULT_ALLOWED_HOSTS, ...extra]
}

// ข้อความ error ห้ามพิมพ์ค่า URL กลับ (อาจมี credential ฝังมา) — บอกแค่ว่าผิดข้อไหน
function assertSafeApiUrl(apiUrl: string, allowedHosts: readonly string[]): void {
  let url: URL
  try {
    url = new URL(apiUrl)
  } catch {
    throw new Error('SMARTPORT_API_URL ไม่ใช่ URL ที่ถูกต้อง')
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('SMARTPORT_API_URL ห้ามฝัง credential ใน URL — ใช้ SP_SERVICE_USERNAME/SP_SERVICE_PASSWORD')
  }
  const host = url.hostname.toLowerCase()
  const isLoopback = LOOPBACK_HOSTS.includes(host)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
    throw new Error('SMARTPORT_API_URL ต้องเป็น https (http อนุญาตเฉพาะ localhost/127.0.0.1/[::1])')
  }
  if (!isLoopback && !allowedHosts.includes(host)) {
    throw new Error('SMARTPORT_API_URL host ไม่อยู่ในรายการที่อนุญาต — เพิ่มด้วย SMARTPORT_API_ALLOWED_HOSTS')
  }
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
  assertSafeApiUrl(apiUrl, parseAllowedHosts(env.SMARTPORT_API_ALLOWED_HOSTS))
  return { apiUrl, username, password }
}
