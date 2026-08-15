# PRP Plan — Issue #115: Remediate high-severity frontend dependency advisories

**Date:** 2026-08-15 · **Issue:** #115 · **Branch:** `issue-115-frontend-dep-advisories`
**Parent audit:** #109

## Problem

`npm audit --omit=dev` รายงาน 2 high advisories ใน build chain ของ Vue compiler:

1. **nanoid ≤ 3.3.17** (installed: 3.3.11)
   - GHSA-28wg-ghj8-5hjv — non-secure generators loop indefinitely เมื่อ size ติดลบ
   - GHSA-2v37-7h3g-55p8 — custom generators loop เมื่อ size เป็นศูนย์
2. **postcss ≤ 8.5.22** (installed: 8.5.8)
   - GHSA-qx2v-qp2m-jg93 — XSS ผ่าน `</style>` ที่ไม่ escape ใน CSS stringify
   - GHSA-6g55-p6wh-862q — arbitrary file read ผ่าน attacker-controlled sourceMappingURL
   - GHSA-fxqj-rqcc-2cmp — fix ของตัวก่อนหน้าไม่สมบูรณ์
   - GHSA-r28c-9q8g-f849 — path traversal ใน previous-source-map auto-loading

Dependency path: `vue@3.5.30 → @vue/compiler-sfc@3.5.30 → postcss → nanoid`
เป็น build-time path เป็นหลัก (ลด browser-runtime exposure) แต่ production artifacts
ต้องไม่ build จาก dependency set ที่มี known high-severity advisory

## Plan

### 1. Update เฉพาะ lockfile (smallest compatible set)
- `npm audit fix` ใน `frontend/` — อัปเดตเฉพาะ transitive deps ที่ resolve ใหม่ใน lockfile
  ไม่แตะ `package.json` ranges ของโปรเจกต์
- ผลลัพธ์: `postcss 8.5.8 → 8.5.26`, `nanoid 3.3.11 → 3.3.18`
  ทั้งคู่อยู่ใน semver range เดิม (8.5.x / 3.3.x) → ไม่มี API/behavior change ตาม semver;
  changelog ของช่วงนี้เป็น security fix ล้วน (ตาม GHSA ข้างต้น) ไม่มีการเปลี่ยน
  behavior ของ Vue compiler, PostCSS stringify หรือ nanoid API

### 2. Gate ใน local CI (`scripts/ci-local.ps1`)
- เพิ่ม `npm audit --omit=dev --audit-level=high` ใน Frontend gate (หลัง npm ci, ก่อน vitest)
- **Severity policy:** prod deps ต้องไม่มี advisory ระดับ high/critical —
  moderate และ dev-only advisories ไม่บล็อก CI (triage ด้วยมือเป็นกรณีไป)
- เหตุผลที่ local CI เท่านั้น: GitHub Actions ถูก hold ไว้ (workflow_dispatch-only)
  และนโยบายลูปคือรัน gate ในเครื่องเท่านั้น

### 3. Verification
- `npm audit --omit=dev` = 0 vulnerabilities
- Frontend vitest suite + production build ผ่าน (ผ่าน ci-local gate)
- CSS/source-map smoke: build สำเร็จและ assets ถูก generate (CI build ครอบคลุม),
  E2E all-menus gate ผ่าน = เส้นทางหลัก render ได้จาก bundle ใหม่

## Acceptance criteria
- [x] `npm audit --omit=dev` ไม่มี high/critical advisory (พบ 0 vulnerabilities)
- [x] Frontend unit tests และ production build ผ่าน
- [x] CSS/source-map + representative routes ถูก smoke-test (E2E all-menus ใน ci-local)
- [x] เวอร์ชันที่แก้ถูกล็อกและบันทึกใน PR: `postcss@8.5.26`, `nanoid@3.3.18`
- [x] `npm audit --omit=dev` อยู่ใน local CI path พร้อม severity policy ที่ documented

## Verification
- `npm audit --omit=dev` ใน `frontend/`
- `scripts/ci-local.ps1 -SkipInstall` (frontend tests/build + audit gate + E2E + backend + docker)
