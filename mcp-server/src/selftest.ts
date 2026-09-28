// --self-test: ยิงสายอ่านทั้ง 3 tools + refresh จริง แล้วจบด้วย logout
// พิมพ์แค่โครง (keys/ยอดนับ/สถานะ) — ห้ามชื่อคน/PII (stdout ใช้ได้ในโหมดนี้เพราะไม่ใช่ protocol)
// ทุก response ต้อง assert success===true + ค่าหลักเป็น number — "พิมพ์ค่าแล้วผ่าน" = ผ่านเงียบ
import { SmartPortClient } from './api.js'
import { loadConfig } from './config.js'

interface MeBody {
  success: boolean
  data: { id: number, role: string }
}

interface DashboardBody {
  success: boolean
  total_personnel: number
}

interface OverviewBody {
  success: boolean
  summary: Record<string, number>
  top5: unknown[]
}

interface LevelBody {
  success: boolean
  summary: Record<string, number>
  pagination: { total: number }
}

interface ProbationListBody {
  success: boolean
  data: Array<{ enrollment_id: number }>
  summary: Record<string, number>
}

interface ProbationDetailBody {
  success: boolean
  data: { enrollment_id: number }
}

function expect(cond: boolean, label: string): void {
  if (!cond) throw new Error(`assert failed: ${label}`)
}

export async function selfTest(): Promise<number> {
  const config = loadConfig()
  const api = new SmartPortClient(config.apiUrl, config.username, config.password)
  try {
    const me = await api.get<MeBody>('/auth/me')
    expect(me.json.success === true, 'me.success')
    expect(typeof me.json.data?.id === 'number', 'me.data.id')
    console.log(`me: id=${me.json.data.id} role=${me.json.data.role} http=${me.status}`)

    const dash = await api.get<DashboardBody>('/dashboard')
    expect(dash.json.success === true, 'dashboard.success')
    expect(typeof dash.json.total_personnel === 'number', 'dashboard.total_personnel')
    console.log(`dashboard: personnel=${dash.json.total_personnel} http=${dash.status}`)

    const overview = await api.get<OverviewBody>('/candidates/overview')
    expect(overview.json.success === true, 'overview.success')
    expect(Array.isArray(overview.json.top5), 'overview.top5')
    console.log(
      `candidates/overview: qualified=${overview.json.summary.qualified_total ?? 0} ` +
        `top5=${overview.json.top5.length} http=${overview.status}`,
    )

    const level = await api.get<LevelBody>('/candidates/K2?limit=1&offset=0')
    expect(level.json.success === true, 'level.success')
    expect(typeof level.json.pagination?.total === 'number', 'level.pagination.total')
    console.log(
      `candidates/K2: total=${level.json.pagination.total} ` +
        `qualified=${level.json.summary.qualified ?? 0} http=${level.status}`,
    )

    const list = await api.get<ProbationListBody>('/probation?limit=1&offset=0')
    expect(list.json.success === true, 'probation.success')
    expect(Array.isArray(list.json.data), 'probation.data')
    console.log(
      `probation: in_progress=${list.json.summary.in_progress ?? 0} ` +
        `near=${list.json.summary.near_deadline ?? 0} http=${list.status}`,
    )
    const firstId = list.json.data[0]?.enrollment_id
    if (firstId !== undefined) {
      const detail = await api.get<ProbationDetailBody>(`/probation/${firstId}`)
      expect(detail.json.success === true, 'probation/detail.success')
      console.log(`probation/${firstId}: ok=${detail.json.success} http=${detail.status}`)
    } else {
      console.log('probation/detail: skipped (no rows)')
    }

    console.log('self-test: PASS')
    return 0
  } catch (error) {
    console.log(`self-test: FAIL — ${error instanceof Error ? error.message : 'unknown'}`)
    return 1
  } finally {
    await api.logout()
  }
}
