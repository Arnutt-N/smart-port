import { describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => ({ isAuthenticated: true, mustChangePassword: false, user: { role: 'admin' } }),
}))

vi.mock('@/composables/useNavProgress.js', () => ({
  useNavProgress: () => ({ isNavigating: { value: false } }),
}))

vi.mock('@/utils/chunkGuard.js', () => ({
  isChunkLoadError: () => false,
  shouldReloadForChunkError: () => false,
}))

const router = (await import('@/router/index.js')).default
const { CANDIDATE_SECTION_LABELS } = await import('@/router/index.js')
const { syncDocumentTitle } = await import('@/router/index.js')

describe('formerly-placeholder routes now resolve to real pages', () => {
  it.each([
    ['/profile', 'my-profile'],
    ['/work-results', 'work-results'],
    ['/awards', 'awards'],
    ['/analytics', 'analytics'],
    ['/admin', 'admin'],
    ['/royal-decorations', 'royal-decorations'],
    ['/retirement-report', 'retirement-report'],
  ])('resolves %s to its own route (%s), not the catch-all redirect', (path, name) => {
    expect(router.resolve(path).name).toBe(name)
  })

  it('each real page route maps to a distinct component loader (not a shared placeholder)', () => {
    const paths = ['/profile', '/work-results', '/awards', '/analytics', '/admin', '/royal-decorations', '/retirement-report']
    const loaders = paths.map((p) => router.resolve(p).matched.at(-1).components.default)
    loaders.forEach((loader) => expect(typeof loader).toBe('function'))
    expect(new Set(loaders).size).toBe(loaders.length)
  })

  it('work-results and awards no longer share the analytics destination', () => {
    expect(router.resolve('/work-results').path).not.toBe(router.resolve('/analytics').path)
    expect(router.resolve('/awards').path).not.toBe(router.resolve('/analytics').path)
    expect(router.resolve('/work-results').path).not.toBe(router.resolve('/awards').path)
  })

  it('keeps the personnel profile/:id route intact', () => {
    expect(router.resolve('/profile/42').name).toBe('profile')
  })

  it('admin route requires admin', () => {
    expect(router.resolve('/admin').meta.requiresAdmin).toBe(true)
  })

  it('every app-shell page route carries title + breadcrumb meta (no Dashboard fallback needed)', () => {
    const expected = {
      '/dashboard': ['Dashboard'],
      '/probation-end': ['พ้นทดลองปฏิบัติราชการ'],
      '/personnel': ['ข้อมูลบุคลากร'],
      '/profile': ['โปรไฟล์ของฉัน'],
      '/profile/42': ['โปรไฟล์ข้าราชการ'],
      '/work-results': ['ผลงานและข้อเสนอ'],
      '/awards': ['รางวัล/ความดีความชอบ'],
      '/analytics': ['การวิเคราะห์ข้อมูล'],
      '/admin': ['การจัดการงาน'],
      '/users': ['จัดการผู้ใช้'],
      '/audit': ['ประวัติการเปลี่ยนแปลง'],
      '/import': ['นำเข้าข้อมูลบุคลากร'],
      '/ocr': ['แปลงเอกสาร PDF'],
      '/time-counting': ['การนับเกื้อกูล'],
      '/time-multiplier': ['การนับทวีคูณ'],
      '/settings/account': ['ตั้งค่า'],
      '/settings/permissions': ['สิทธิ์ระบบ'],
      '/settings/special-areas': ['การนับทวีคูณ', 'จัดการพื้นที่พิเศษ'],
      '/time-difference': ['การนับแตกต่าง'],
      '/position-compare': ['การเทียบตำแหน่ง'],
      '/royal-decorations': ['เครื่องราชอิสริยาภรณ์'],
      '/retirement-report': ['รายงานผู้เกษียณ'],
    }
    for (const [path, breadcrumb] of Object.entries(expected)) {
      const resolved = router.resolve(path)
      expect(resolved.meta.title, `${path} title`).toBe(breadcrumb.at(-1))
      expect(resolved.meta.breadcrumb, `${path} breadcrumb`).toEqual(breadcrumb)
    }
  })

  it('candidates routes carry the Candidate Lists base trail (section label appended by Topbar)', () => {
    for (const section of ['overview', 'general', 'academic', 'support', 'management']) {
      const resolved = router.resolve(`/candidates/${section}`)
      expect(resolved.meta.breadcrumb).toEqual(['Candidate Lists'])
      expect(CANDIDATE_SECTION_LABELS[section]).toBeTruthy()
    }
    expect(CANDIDATE_SECTION_LABELS.overview).toBe('ภาพรวม')
  })

  describe('not-found route and document titles', () => {
    it('resolves unknown paths to the not-found page inside the app shell', () => {
      for (const path of ['/nope', '/a/b/c', '/login/xyz']) {
        const resolved = router.resolve(path)
        expect(resolved.name).toBe('not-found')
        expect(resolved.meta.title).toBe('ไม่พบหน้า')
        expect(resolved.meta.breadcrumb).toEqual(['ไม่พบหน้า'])
      }
    })

    it('keeps known routes away from the catch-all', () => {
      expect(router.resolve('/login').name).toBe('login')
      expect(router.resolve('/dashboard').name).toBe('dashboard')
      expect(router.resolve('/candidates/bogus-section').name).toBe('candidates')
    })

    it('covers the not-found route with the auth guard via AppLayout meta', () => {
      expect(router.resolve('/nope').meta.requiresAuth).not.toBe(false)
    })

    it('syncs document.title from route meta with the brand suffix', () => {
      syncDocumentTitle({ meta: { title: 'Dashboard' } })
      expect(document.title).toBe('Dashboard | ระบบสมุดพก')
      syncDocumentTitle({ meta: {} })
      expect(document.title).toBe('ระบบสมุดพก')
    })
  })
})
