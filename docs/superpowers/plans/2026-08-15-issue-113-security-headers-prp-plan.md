# PRP Plan — Issue #113 (ระยะที่ 1): Security headers บน Render static site + CSP report-only

**Date:** 2026-08-15 · **Issue:** #113 · **Branch:** `issue-113-security-headers-token-storage`

## Problem (ส่วนที่ทำรอบนี้)

Live frontend บน Render ขาด CSP, frame-ancestors, Referrer-Policy, Permissions-Policy —
`frontend/nginx.conf` มี headers อยู่แต่ Render static site ไม่ได้ใช้ nginx.conf เลย
(คนละ deploy path) และ CSP เดิมใน nginx กว้างเกินไป (`default-src 'self' http: https: data: blob: 'unsafe-inline'`)

## Scope decision

**ทำรอบนี้ (headers/cache/CSP):** ข้อ 1, 2, 5 ของ plan ใน issue
**แยกเป็น follow-up (ต้องออกแบบต่างหาก):** การย้าย refresh token ไป HttpOnly cookie
(ข้อ 3–4) เพราะแตะ backend auth + CSRF redesign + multi-tab behavior และต้องการ
browser regression จริง — ทำเป็น PR เฉพาะจะได้รีวิว/ทดสอบถูกจุด (จดใน docs)

## Changes

### 1. Headers บน Render static site จริง (`render.yaml` → `headers:`)
- `/*`:
  - `Content-Security-Policy-Report-Only` — เริ่ม report-only เพื่อ inventory ก่อน enforce:
    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;`
    `font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self';`
    `frame-ancestors 'none'; base-uri 'self'; form-action 'self'; report-uri /api/csp-report`
    (Vite build: script/style เป็นไฟล์ภายนอก; `style-src 'unsafe-inline'` เผื่อ Vue inline style attr;
    Noto Sans Thai โหลดจาก Google Fonts)
  - `X-Frame-Options: DENY` · `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=()`
  - `X-Content-Type-Options: nosniff` · `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Cache-Control: no-cache` — app shell revalidate ทุกครั้ง (กัน stale shell ชี้ chunk hash หาย
    เหตุผลเดียวกับ nginx.conf)
- `/assets/*`: `Cache-Control: public, max-age=31536000, immutable` (hashed filenames)

### 2. CSP report collector (`backend/api.php` → `POST /csp-report`)
- public, ไม่ผ่าน JWT/CSRF (browser ส่งเอง), cap body 10KB, log จำนวน violation type ผ่าน
  `error_log` (ไม่มี PII) แล้วคืน 204 — ทำให้ "monitor ก่อน enforce" วัดผลได้จริงบน Render log

### 3. nginx.conf parity (docker frontend 8081)
- เปลี่ยน CSP เดิมที่กว้างเกินเป็น enforced policy ชุดเดียวกัน (ตัด `http: https: data: blob:`
  ออกจาก default-src) + เพิ่ม Referrer-Policy/Permissions-Policy, X-Frame-Options DENY

### 4. Automated header assertions (vitest)
- `frontend/src/__tests__/securityHeaders.test.js`: assert ว่า render.yaml ประกาศ header ครบชุด
  ตามข้อตกลง (กัน drift/regression ตอนแก้ blueprint) + assert nginx.conf enforce CSP ชุดเดียวกัน

### 5. Docs
- `docs/frontend-security-headers.md`: policy set, cache decision, วิธีอ่าน report,
  เกณฑ์ promote report-only → enforce, และ follow-up cookie migration

## Acceptance (ส่วนนี้)
- [ ] Render static-site path ประกาศ header ครบชุด (verify จาก blueprint + test)
- [ ] CSP report-only + collector ทำงาน (monitor ก่อน enforce ไม่พัง Thai UI)
- [ ] cache behavior ของ app shell ถูก document + test
- [ ] nginx.conf ไม่มี unsafe allowance เดิม

## Verification
- `cd frontend && npm test` (securityHeaders.test.js + suite เดิม)
- `scripts/ci-local.ps1 -SkipInstall`
