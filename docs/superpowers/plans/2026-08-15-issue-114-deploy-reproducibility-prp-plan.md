# PRP Plan — Issue #114: Reproducible Render deployment + DB readiness + release identity

**Date:** 2026-08-15 · **Issue:** #114 · **Branch:** `issue-114-deploy-reproducibility`

## Problem

1. `render.yaml` ตั้ง `MYSQL_SSL=true` แต่ไม่มี `MYSQL_SSL_CA` — `config.php::buildSslOptions()`
   fail-closed throw → fresh blueprint deploy ต่อ DB ไม่ได้ (backend พังทั้ง service เพราะ lazy
   connection ทำให้ `/` health ยัง 200 หลอกตา)
2. buildFilter ไม่รวม root `Dockerfile` → แก้ Dockerfile อย่างเดียวไม่ trigger deploy
3. frontend ใช้ `npm install` (ไม่ deterministic) ควรใช้ `npm ci`
4. `/` เป็น liveness ที่ตั้งใจไม่แตะ DB — ไม่มี readiness ที่เช็ค DB + migration state
5. ไม่มี release identity — ผูก service ที่ live กับ commit SHA ไม่ได้
6. ไม่มี rollback/restore runbook

## Changes

### 1. Blueprint contract (`render.yaml`)
- เพิ่ม `MYSQL_SSL_CA=/etc/ssl/certs/ca-certificates.crt` — CA bundle มากับ image
  `php:8.3-apache` อยู่แล้ว (TiDB Serverless chain จบที่ public root ที่อยู่ใน bundle)
  → ไม่ต้องเพิ่ม secret/ไฟล์ใหม่, fresh deploy สำเร็จจาก documented inputs ล้วน ๆ
- buildFilter backend เพิ่ม `Dockerfile` (root) — `backend/**` ครอบคลุม entrypoint อยู่แล้ว
- frontend `buildCommand: npm ci && npm run build`

### 2. Release identity
- Render inject `RENDER_GIT_COMMIT` ให้ runtime อัตโนมัติ → เพิ่มใน Dockerfile `PassEnv`
- `GET /` (liveness) และ readiness report คืน `release` (fallback 'dev' เมื่อไม่มี env)

### 3. Readiness endpoint (ใหม่: `GET /readyz`)
- `backend/routes/readyz.php::readyzReport(PDO)` — public, minimal disclosure:
  `{status:'ready', release, db:'ok', migrations_bundled:N, migrations_pending:M}`
  ไม่บอกชื่อตาราง/migration — ตัวเลขอย่างเดียว (pattern เดียวกับ `index.php`)
- DB ลง connection → `config.php` exit 503 อยู่แล้ว = not-ready โดยธรรมชาติ
- api.php เพิ่ม public exemption (เหมือน `uploads`) + `case 'readyz'`
- pending = bundled files − schema_migrations (ข้าม test-seed เหมือน runner เมื่อไม่ได้ตั้ง
  APPLY_TEST_SEED_MIGRATIONS)

### 4. Docs
- `docs/render-tidb-production.md`: เพิ่มแถว `MYSQL_SSL_CA`, readyz + release ใน verification
- `docs/runbooks/rollback-restore.md` (ใหม่): rollback deploy, migration failure recovery,
  TiDB backup/restore พร้อม owner + decision points

### 5. Tests (`backend/tests/Integration/ReadyzTest.php`)
- `readyzReport()` บน DB จริง: `db='ok'`, pending ≥ 0 เป็น int, bundle count > 0
- liveness semantics: `index.php` ยังไม่แตะ DB (คงเดิม) — readiness ต้องแตะ DB (ต่าง semantics)

## Acceptance criteria (จาก issue)
- [ ] fresh blueprint deploy สำเร็จจาก documented inputs (MYSQL_SSL_CA อยู่ใน blueprint)
- [ ] Dockerfile-only changes trigger backend deploy (buildFilter)
- [ ] liveness ≠ readiness + มีเทส
- [ ] ผูก live service กับ release SHA + พิสูจน์ DB/migration readiness โดยไม่รั่ว schema
- [ ] rollback/restore runbook มี owner + decision points

## Verification
- `bash backend/tests/run.sh` (ReadyzTest + full suite)
- smoke ใน dev container: `GET /` มี release, `GET /readyz` ready + counts
- `scripts/ci-local.ps1 -SkipInstall`
