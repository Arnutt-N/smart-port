import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Issue #113 — automated header assertions: กัน drift ของ security headers ที่ประกาศใน
// render.yaml (Render static site path จริง) และ frontend/nginx.conf (docker path)
// นโยบายเต็มอยู่ใน docs/frontend-security-headers.md

const here = dirname(fileURLToPath(import.meta.url))
const renderYaml = readFileSync(resolve(here, '../../../render.yaml'), 'utf8')
const nginxConf = readFileSync(resolve(here, '../../nginx.conf'), 'utf8')

// CSP ชุดที่ตกลงกัน — Vite build: script/style ไฟล์ภายนอก, Noto Sans Thai จาก Google Fonts
const CSP_CORE = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data:",
  "connect-src 'self'",
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

  it('documents the cache decision: shell revalidates, hashed assets immutable', () => {
    expect(renderYaml).toMatch(/Cache-Control\s*\n\s*value:\s*no-cache/)
    expect(renderYaml).toContain('/assets/*')
    expect(renderYaml).toContain('public, max-age=31536000, immutable')
  })

  it('does not reintroduce the old broad CSP allowances', () => {
    expect(renderYaml).not.toContain("default-src 'self' http:")
  })
})

describe('nginx.conf security headers (docker path)', () => {
  it('enforces the same CSP (not report-only) without the old broad allowances', () => {
    expect(nginxConf).toContain('add_header Content-Security-Policy')
    expect(nginxConf).not.toContain('Content-Security-Policy-Report-Only')
    for (const directive of CSP_CORE) {
      expect(nginxConf).toContain(directive)
    }
    expect(nginxConf).not.toContain("http: https: data: blob:")
  })

  it('uses DENY framing, strict referrer, permissions policy, and nosniff', () => {
    expect(nginxConf).toContain('X-Frame-Options "DENY"')
    expect(nginxConf).not.toContain('X-Frame-Options "SAMEORIGIN"')
    expect(nginxConf).toContain('Referrer-Policy "strict-origin-when-cross-origin"')
    expect(nginxConf).toContain('Permissions-Policy "camera=(), geolocation=(), microphone=(), payment=()"')
    expect(nginxConf).toContain('X-Content-Type-Options "nosniff"')
    expect(nginxConf).not.toContain('X-XSS-Protection')
  })
})
