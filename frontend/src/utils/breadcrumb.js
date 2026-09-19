/**
 * ป้ายชื่อ section ของ Candidate Lists — single source สำหรับ Topbar trail
 * (ตรงกับ categoryConfig.breadcrumb ใน CandidateListsPage.vue)
 * หมายเหตุ: ย้ายมาอยู่นี่แทน router/index.js เพื่อตัด circular import
 * (router → breadcrumb → router); router re-export ต่อเพื่อ compat กับเทสต์เดิม
 */
export const CANDIDATE_SECTION_LABELS = {
  overview: 'ภาพรวม',
  general: 'ทั่วไป',
  academic: 'วิชาการ',
  support: 'อำนวยการ',
  management: 'บริหาร',
}

/**
 * resolveTrail — single source ของ breadcrumb trail ใน Topbar
 * อ่านจาก route.meta.breadcrumb; เคส candidates ต่อท้ายด้วยชื่อ section แบบ dynamic
 * (overview=ภาพรวม, general=ทั่วไป, academic=วิชาการ, support=อำนวยการ, management=บริหาร)
 */
export function resolveTrail(route = {}) {
  route = route ?? {}
  if (route.name === 'candidates') {
    const label = CANDIDATE_SECTION_LABELS[String(route.params?.section ?? '')]
    return label ? ['Candidate Lists', label] : ['Candidate Lists']
  }
  const base = route.meta?.breadcrumb
  if (Array.isArray(base) && base.length > 0) return base.map(String)
  // trail ว่างเมื่อ meta ไม่มี breadcrumb — contract ตั้งใจ (PageBreadcrumb.test.js)
  return []
}
