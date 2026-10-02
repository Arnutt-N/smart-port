// --self-test: ยิงสายอ่านทั้ง 3 tools + refresh จริง แล้วจบด้วย logout
// พิมพ์แค่โครง (keys/ยอดนับ/สถานะ) — ห้ามชื่อคน/PII (stdout ใช้ได้ในโหมดนี้เพราะไม่ใช่ protocol)
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

export async function selfTest(): Promise<number> {
  const config = loadConfig()
  const api = new SmartPortClient(config.apiUrl, config.username, config.password)
  try {
    const me = await api.get<MeBody>('/auth/me')
    console.log(`me: id=${me.json.data.id} role=${me.json.data.role} http=${me.status}`)

    const dash = await api.get<DashboardBody>('/dashboard')
    console.log(`dashboard: personnel=${dash.json.total_personnel} http=${dash.status}`)

    const overview = await api.get<OverviewBody>('/candidates/overview')
    console.log(
      `candidates/overview: qualified=${overview.json.summary.qualified_total ?? 0} ` +
        `top5=${overview.json.top5.length} http=${overview.status}`,
    )

    const level = await api.get<LevelBody>('/candidates/K2?limit=1&offset=0')
    console.log(
      `candidates/K2: total=${level.json.pagination.total} ` +
        `qualified=${level.json.summary.qualified ?? 0} http=${level.status}`,
    )

    const list = await api.get<ProbationListBody>('/probation?limit=1&offset=0')
    console.log(
      `probation: in_progress=${list.json.summary.in_progress ?? 0} ` +
        `near=${list.json.summary.near_deadline ?? 0} http=${list.status}`,
    )
    const firstId = list.json.data[0]?.enrollment_id
    if (typeof firstId === 'number' && Number.isSafeInteger(firstId)) {
      const detail = await api.get<ProbationDetailBody>(`/probation/${firstId}`)
      console.log(`probation/${firstId}: ok=${detail.json.success} http=${detail.status}`)
    } else {
      console.log('probation/detail: skipped (no usable rows)')
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
