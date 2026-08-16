# PRP Plan — Issue #125: Render header precedence + object-src 'none'

วันที่: 2026-08-16 · Branch: `issue-125-render-headers-object-src` · Parent audit: review ของ #110–#115 (range `720dda6..a1fafa1`), finding 4 + promotion recommendation

## Problem

1. **Render Cache-Control overlap ยังไม่ถูก verify:** render.yaml ตั้ง `Cache-Control: no-cache`
   บน `/*` และ `public, max-age=31536000, immutable` บน `/assets/*` — docs ของ Render
   ไม่ระบุ precedence เมื่อสอง pattern ทับกัน
2. **CSP ทั้งสอง path ไม่มี `object-src 'none'`** — app ไม่ได้ใช้ plugin/embed เลย
   เพิ่ม `'none'` เป็น belt-and-braces ได้ฟรี

## Live observation (2026-08-16, curl smart-port.onrender.com)

ทั้ง `/` และ `/assets/index-B1YyXcfC.js` คืนค่า default ของ Render:
`Cache-Control: public, max-age=0, s-maxage=300` — **header set จาก render.yaml
ยังไม่ถูก apply เลย** (ไม่มี CSP-Report-Only / X-Frame-Options ฯลฯ) ทั้งที่ site ถูก
deploy ใหม่แล้ว (last-modified วันนี้) → blueprint ยังไม่ได้ "Sync" ใน Render dashboard
ตั้งแต่ #113; การ sync เป็น manual action บน dashboard

ผลต่อ acceptance ข้อ 1: บันทึกผลจริงที่วัดได้ + เงื่อนไขที่ต้องทำต่อ (sync blueprint →
deploy → curl ใหม่) ลง docs — การ verify สมบูรณ์เกิดหลัง sync ซึ่งอยู่นอก repo

[Render static-site headers docs](https://render.com/docs/static-site-headers) ยืนยันว่า
ไม่มีกฎ precedence สำหรับ pattern ทับกัน → ต้องวัดจริงหลัง deploy เท่านั้น

## Changes

### 1. เพิ่ม `object-src 'none'` ทั้งสอง CSP

- `render.yaml` — report-only policy (เพิ่มต่อจาก `form-action 'self'`)
- `frontend/nginx-security-headers.conf` — enforced policy (docker path)
- `docs/frontend-security-headers.md` — CSP block ใน doc

### 2. Tests

- `frontend/src/__tests__/securityHeaders.test.js`: เพิ่ม `"object-src 'none'"` ใน
  `CSP_CORE` → ครอบทั้ง render.yaml + snippet อัตโนมัติ; เพิ่ม explicit assertion

### 3. บันทึก live verification ลง docs

- `docs/frontend-security-headers.md`: เพิ่ม section "Live verification (#125)" —
  ผล curl วันนี้ (default ของ Render = blueprint ยังไม่ sync), checklist หลัง sync:
  curl `/` ต้องได้ `no-cache`, curl `/assets/*` ต้องได้ `public, max-age=31536000, immutable`;
  ถ้า `no-cache` ชนะบน assets → restructure ตามแผนใน issue

## Verification

1. `npx vitest run src/__tests__/securityHeaders.test.js` (threads pool) — เขียว
2. Full CI gate: `scripts/ci-local.ps1 -SkipInstall` (build frontend image = ตรวจ
   snippet syntax ทางอ้อมผ่าน nginx.conf include)
3. Live re-check ทำหลัง blueprint sync (นอกรอบ PR นี้)

## Acceptance

- [ ] `object-src 'none'` อยู่ใน render.yaml (report-only), nginx snippet (enforced), doc และ tests เขียว
- [ ] ผล live observation + เงื่อนไข verify ต่อ ถูกบันทึกใน docs/frontend-security-headers.md
- [ ] CI gate ผ่าน
