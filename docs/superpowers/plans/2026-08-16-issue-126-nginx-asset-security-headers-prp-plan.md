# PRP Plan — Issue #126: nginx static-asset location gets the security headers

**Date:** 2026-08-16 · **Issue:** #126 · **Branch:** `issue-126-nginx-asset-security-headers`

## Problem

`frontend/nginx.conf` — regex location สำหรับ static assets (`*.js/.css/.png/...`)
มี `add_header` ของตัวเอง (Cache-Control) ดังนั้นตาม semantics ของ nginx มัน
**ไม่ inherit** server-level headers → asset responses จาก Docker path ไม่มี
security headers เลย (รวมถึง enforced CSP ที่เพิ่มใน #113)

## Plan

### 1. Single source: include snippet
- ไฟล์ใหม่ `frontend/nginx-security-headers.conf` — add_header 5 ตัว
  (X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, enforced CSP ชุด CSP_CORE)
- `location /` และ asset location ใช้ `include /etc/nginx/snippets/security-headers.conf;`
  แทนการคัดลอก header block (กัน drift ระหว่างสอง location)
- server-level headers คงเดิม (cover deny location / 50x fallback)
- `frontend/Dockerfile` เพิ่ม `COPY nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf`

### 2. Drift-guard test (`frontend/src/__tests__/securityHeaders.test.js`)
- อ่าน snippet file; assert CSP_CORE + header lines ครบใน snippet
- assert nginx.conf: ทั้ง `location /` และ asset location include snippet,
  asset location ยังมี `Cache-Control "public, immutable"`,
  และไม่มี broad CSP เก่า

### 3. Verification
- `npm test` (vitest) ใน frontend
- build image แล้ว `nginx -t` + `curl -sI` asset ใน container ตรวจ headers จริง
- `scripts/ci-local.ps1 -SkipInstall`

## Acceptance criteria
- [ ] Asset responses จาก Docker nginx มี security headers เท่ากับ document responses
- [ ] Header set มีแหล่งเดียว (snippet) — location ไหนต้องการก็ include
- [ ] securityHeaders.test.js ครอบ asset-location case และเขียว
- [ ] CI gate ผ่าน
