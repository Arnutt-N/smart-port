import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Issue #113 — automated header assertions: กัน drift ของ security headers ที่ประกาศใน
// render.yaml (Render static site path จริง), frontend/nginx.conf (docker path) และ
// frontend/nginx-security-headers.conf (snippet ที่ nginx.conf include ในทุก location
// ที่ตั้ง add_header เอง — Issue #126)
// นโยบายเต็มอยู่ใน docs/frontend-security-headers.md

const here = dirname(fileURLToPath(import.meta.url))
const renderYaml = readFileSync(resolve(here, '../../../render.yaml'), 'utf8')
const nginxConf = readFileSync(resolve(here, '../../nginx.conf'), 'utf8')
const nginxHeadersSnippet = readFileSync(resolve(here, '../../nginx-security-headers.conf'), 'utf8')

// CSP ชุดที่ตกลงกัน — Vite build: script/style ไฟล์ภายนอก, Noto Sans Thai จาก Google Fonts
const CSP_CORE = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data:",
  "connect-src 'self'",
  // Issue #125: app ไม่ใช้ plugin/embed — 'none' เป็น defense-in-depth ฟรี
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
]

describe('render.yaml security headers (Render static-site path)', () => {
  it('declares CSP report-only with the agreed directives and report collector', () => {
    expect(renderYaml).toContain('Content-Security-Policy-Report-Only')
    for (const directive of CSP_CORE) {
      expect(renderYaml).toContain(directive)
    }
    expect(renderYaml).toContain('report-uri /api/csp-report')
  })

  it('sets frame, referrer, permissions, MIME, and HSTS policies', () => {
    expect(renderYaml).toContain('X-Frame-Options')
    expect(renderYaml).toMatch(/X-Frame-Options\s*\n\s*value:\s*DENY/)
    expect(renderYaml).toMatch(/Referrer-Policy\s*\n\s*value:\s*strict-origin-when-cross-origin/)
    expect(renderYaml).toContain('Permissions-Policy')
    expect(renderYaml).toContain('camera=()')
    expect(renderYaml).toMatch(/X-Content-Type-Options\s*\n\s*value:\s*nosniff/)
    expect(renderYaml).toContain('Strict-Transport-Security')
    expect(renderYaml).toContain('max-age=31536000; includeSubDomains')
  })

  it('documents the cache decision: single deterministic no-cache rule for the whole site', () => {
    expect(renderYaml).toMatch(/Cache-Control\s*\n\s*value:\s*no-cache/)
    // 2026-08-17: ตัดกฎ /assets/* immutable ออก — Render จัดกฎ Cache-Control ซ้อนทับ
    // แบบ non-deterministic (วัดจริง) เหลือกฎเดียว no-cache ทั้ง site
    // (คำว่า immutable ยังได้อยู่ใน comment อธิบายเหตุผล — เลยยืนที่ path rule + value)
    expect(renderYaml).not.toMatch(/- path: \/assets\//)
    expect(renderYaml).not.toMatch(/value:\s*public, max-age=\d+, immutable/)
  })

  it('does not reintroduce the old broad CSP allowances', () => {
    expect(renderYaml).not.toContain("default-src 'self' http:")
  })
})

describe('nginx security-headers snippet (docker path, Issue #126)', () => {
  it('enforces the agreed CSP and header set (not report-only) without the old broad allowances', () => {
    expect(nginxHeadersSnippet).toContain('add_header Content-Security-Policy')
    expect(nginxHeadersSnippet).not.toContain('Content-Security-Policy-Report-Only')
    for (const directive of CSP_CORE) {
      expect(nginxHeadersSnippet).toContain(directive)
    }
    expect(nginxHeadersSnippet).not.toContain("http: https: data: blob:")
  })

  it('uses DENY framing, strict referrer, permissions policy, and nosniff', () => {
    expect(nginxHeadersSnippet).toContain('X-Frame-Options "DENY"')
    expect(nginxHeadersSnippet).not.toContain('X-Frame-Options "SAMEORIGIN"')
    expect(nginxHeadersSnippet).toContain('Referrer-Policy "strict-origin-when-cross-origin"')
    expect(nginxHeadersSnippet).toContain('Permissions-Policy "camera=(), geolocation=(), microphone=(), payment=()"')
    expect(nginxHeadersSnippet).toContain('X-Content-Type-Options "nosniff"')
    expect(nginxHeadersSnippet).not.toContain('X-XSS-Protection')
  })
})

describe('nginx.conf wiring (docker path)', () => {
  const SNIPPET_INCLUDE = 'include /etc/nginx/snippets/security-headers.conf;'

  const stripComments = (conf) =>
    conf.split('\n').map((line) => line.replace(/#.*$/, '')).join('\n')

  // แตก nginx.conf เป็น location blocks (brace-matching) เพื่อ scan ทีละ block
  const locationBlocks = (conf) => {
    const blocks = []
    const re = /location\b[^{]*\{/g
    let match
    while ((match = re.exec(conf)) !== null) {
      let depth = 1
      let i = re.lastIndex
      while (i < conf.length && depth > 0) {
        if (conf[i] === '{') depth++
        else if (conf[i] === '}') depth--
        i++
      }
      blocks.push({ header: match[0], body: conf.slice(re.lastIndex, i - 1) })
      re.lastIndex = i
    }
    return blocks
  }

  // add_header ไม่ inherit จาก server level เมื่อ location มี add_header ของตัวเอง —
  // ทุก location ที่ตั้ง header เองต้อง include snippet (location / และ static assets)
  it('every location that sets add_header includes the security-headers snippet', () => {
    const conf = stripComments(nginxConf)
    expect(conf).toContain(SNIPPET_INCLUDE) // server-level include

    const blocks = locationBlocks(conf)
    expect(blocks.length).toBeGreaterThanOrEqual(4)
    for (const { header, body } of blocks) {
      expect(
        !body.includes('add_header') || body.includes(SNIPPET_INCLUDE),
        `${header.trim()} sets add_header without ${SNIPPET_INCLUDE} — headers จะไม่ออก response`,
      ).toBe(true)
    }
  })

  it('static assets keep the immutable cache policy and both Dockerfiles ship the snippet', () => {
    const conf = stripComments(nginxConf)
    const asset = locationBlocks(conf).find(({ header }) => header.includes('(js|css|png'))
    expect(asset?.body).toContain('Cache-Control "public, immutable"')
    expect(asset?.body).toContain(SNIPPET_INCLUDE)

    const dockerfile = readFileSync(resolve(here, '../../Dockerfile'), 'utf8')
    expect(dockerfile).toContain('COPY nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf')
    const devDockerfile = readFileSync(resolve(here, '../../Dockerfile.dev'), 'utf8')
    expect(devDockerfile).toContain('nginx-security-headers.conf')
  })

  it('does not reintroduce duplicated literal header blocks or the old broad CSP', () => {
    expect(nginxConf).not.toContain('add_header Content-Security-Policy ')
    expect(nginxConf).not.toContain('add_header X-Frame-Options')
    expect(nginxConf).not.toContain("http: https: data: blob:")
  })
})
