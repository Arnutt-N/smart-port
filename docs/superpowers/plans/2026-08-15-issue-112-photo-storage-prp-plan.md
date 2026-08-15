# PRP Plan — Issue #112: Move personnel photos off Render ephemeral filesystem

**Date:** 2026-08-15 · **Issue:** #112 · **Branch:** `issue-112-durable-photo-storage`

## Problem

รูปเจ้าหน้าที่ถูกเขียนลง `backend/uploads` ใน container ซึ่ง filesystem ของ Render
ไม่ persist ข้าม deploy (ADR-0001) — แถว DB อยู่ต่อแต่ไฟล์หาย ไม่มี disk/object store
ใน `render.yaml`

## Decision: เก็บ bytes ใน TiDB (DB BLOB)

Production ใช้ TiDB Cloud Serverless อยู่แล้ว (external, persistent, มี backup ในตัว)
เทียบกับตัวเลือกอื่น:

| ตัวเลือก | ข้อจำกัด |
|---|---|
| Render persistent disk | ต้อง paid plan (prod อยู่ free tier ตาม ADR-0001), ไม่มี auto-backup |
| Object storage (S3/R2) | ต้องสร้าง account + credential ใหม่ + dependency ใหม่ |
| **TiDB BLOB** | **ใช้ infra เดิมที่มีอยู่, ไม่มี credential ใหม่, ทดสอบ local ได้กับ MySQL docker** |

ข้อจำกัดที่ยอมรับ: DB โตขึ้น (รูป cap 5MB/ไฟล์, MEDIUMBLOB รองรับ 16MB) และ
serving ผ่าน PHP แทน Apache static — ยอมรับได้เพราะ traffic เป็น internal HR

## Changes

### 1. Schema (`database/30-photo-blob-storage.sql` + parity 3 ที่)
```sql
ALTER TABLE civil_servant_photos
  ADD COLUMN file_data MEDIUMBLOB NULL,
  ADD COLUMN mime_type VARCHAR(60) NULL,
  ADD COLUMN file_size INT UNSIGNED NULL;
```
- แตะ `database/tidb-init.sql` (เติมคอลัมน์ใน CREATE TABLE) + mount ใน
  `docker-compose.yaml` และ `.github/workflows/ci.yml` — ตรวจด้วย
  `node scripts/validate-schema-parity.mjs` (ตาม ADR-0002)
- คอลัมน์ NULL ได้ — แถวเก่าที่ไฟล์หายไปแล้วจะมี file_data=NULL (reconcile = อัปโหลดใหม่)

### 2. Upload (`backend/api.php` case 'photos')
- เลิก `move_uploaded_file` ลง filesystem → อ่าน bytes แล้ว INSERT
  `file_data/mime_type/file_size` ใน transaction เดียวกับแถวรูป
- `file_path` ยังเก็บ relative path (`uploads/xxx.jpg`) เหมือนเดิม → frontend
  (`apiAssetUrl`) ไม่ต้องแก้
- validation เดิมครบ: extension/MIME/getimagesize/size 5MB + `requirePermission('create','photos')`

### 3. Serving (ใหม่: `GET /uploads/{filename}` → `backend/routes/photos.php`)
- `.htaccess` rewrite ไฟล์ที่ไม่มีอยู่จริงเข้า `api.php` อยู่แล้ว → เพิ่ม `case 'uploads'`
- หาด้วย `file_name` (sanitize `^[A-Za-z0-9_.-]+$` กัน traversal) + `is_active = 1`
- Stream bytes พร้อม Content-Type/Content-Length/Cache-Control
- ไม่พบ → 404 + `error_log` เฉพาะ file_name (ไม่มี PII)

### 4. Reconciliation / ops doc (`docs/adr/0003-photo-storage-tidb-blob.md`)
- แถวเก่า `file_data IS NULL` = ไฟล์สูญหายจาก ephemeral disk → UI แสดงรูป placeholder,
  แก้โดยอัปโหลดใหม่ (มี reconcile query ใน doc)
- Backup = ตาม TiDB retention; failure modes: insert ล้มเหลว rollback ทั้งแถว
  (ไม่มี partial write — bytes กับ metadata มาใน transaction เดียว)

### 5. Tests (`backend/tests/Integration/PhotoStorageTest.php`)
- store → fetch roundtrip (bytes ตรง, mime ตรง)
- fetch ไฟล์ที่ไม่มี / inactive → null (serving 404)
- filename traversal (`../`) ถูก reject

## Acceptance criteria (จาก issue)
- [ ] redeploy ไม่ลบรูป (bytes อยู่ใน TiDB ไม่ใช่ container fs)
- [ ] missing/partial-write ถูกจัดการ predictably + log ไม่มี PII
- [ ] แถวเก่ามี documented migration/reconciliation path
- [ ] ไม่มี credential ใหม่นอกระบบ (ใช้ TiDB credential เดิม)
- [ ] มี test ครอบคลุม store/fetch/replace semantics

## Verification
- `node scripts/validate-schema-parity.mjs`
- `bash backend/tests/run.sh` (full suite + PhotoStorageTest)
- `scripts/ci-local.ps1 -SkipInstall`
