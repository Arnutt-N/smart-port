# ADR-0003: เก็บรูปเจ้าหน้าที่เป็น BLOB ในฐานข้อมูล (TiDB) แทน filesystem

- **Status**: Accepted
- **Date:** 2026-08-15 (issue #112)

## Context

รูปเจ้าหน้าที่เคยถูกเขียนลง `backend/uploads/` ใน container แล้วเก็บแค่ relative path
ใน DB แต่ filesystem ของ Render **ไม่ persist ข้าม deploy** (ดู ADR-0001) — ทุกครั้งที่
redeploy/restart รูปทั้งหมดหาย ขณะที่แถว DB ยังอ้างอิงอยู่ (dangling records)

ตัวเลือกที่พิจารณา:

| ตัวเลือก | สรุป |
|---|---|
| Render persistent disk | ต้อง paid instance (prod อยู่ free tier) และไม่มี auto-backup |
| Object storage (S3/R2) | ต้องสร้าง account/credential ใหม่ + dependency ใหม่ + ไม่ทดสอบได้ใน local CI |
| **BLOB ในฐานข้อมูล** | **เลือก** — production ใช้ TiDB Cloud Serverless อยู่แล้ว ซึ่งเป็น storage ภายนอกที่ persist และมี backup ในตัว ไม่มี credential ใหม่ ทดสอบกับ MySQL docker ใน CI ได้ |

## Decision

1. เพิ่มคอลัมน์ `civil_servant_photos.file_data` (MEDIUMBLOB), `mime_type`, `file_size`
   — migration `database/30-photo-blob-storage.sql` (sync ใน `tidb-init.sql` ตาม ADR-0002)
2. Upload (`POST /photos`) อ่าน bytes แล้ว INSERT ทั้งแถว+bytes ใน transaction เดียว
   (all-or-nothing — ไม่มี partial-write state) ผ่าน `backend/routes/photos.php::storePhotoRecord()`
3. Serving (`GET /uploads/{file}`) stream จาก DB ผ่าน `handleUploadsAsset()` —
   URL เดิมที่ frontend ใช้ (`apiAssetUrl('uploads/...')`) ทำงานต่อโดยไม่ต้องแก้ frontend
   เพราะ `.htaccess` rewrite ไฟล์ที่ไม่มีอยู่จริงเข้า `api.php`
4. การอ่านเป็น **public** เหมือนตอน Apache เสิร์ฟ static file — ชื่อไฟล์สร้างจาก
   `uniqid(..., true)` (entropy สูง เดาไม่ได้) จึงทำหน้าที่เป็น capability URL
5. อัปโหลดยังคง validation เดิม: extension/MIME/`getimagesize`/size ≤ 5MB +
   `requirePermission('create', 'photos')`

## Consequences

**เชิงบวก**

- redeploy/restart ไม่ลบรูป — bytes อยู่ใน TiDB ไม่ใช่ container
- ไม่มี infrastructure/credential ใหม่; backup/retention ของรูป = ตาม TiDB policy
- local/dev/CI ทดสอบ storage path เต็มที่ได้ด้วย MySQL docker

**เชิงลบ / ข้อจำกัดที่ต้องรับ**

- DB โตขึ้นตามจำนวนรูป (cap 5MB/ไฟล์, MEDIUMBLOB รองรับ 16MB) — traffic เป็น
  internal HR จึงยอมรับ serving ผ่าน PHP แทน Apache static ได้
- หากอนาคตจำนวนรูปมากจนกระทบ DB ให้พิจารณา object storage โดยแก้เฉพาะ
  `routes/photos.php` (จุด store/fetch อยู่ที่เดียว)

## Operations

**Backup/retention:** ตาม TiDB Cloud policy ของโปรเจกต์ — ไม่มีขั้นตอนเพิ่ม

**Failure modes:**

- INSERT ล้มเหลว → rollback ทั้งแถว (ไม่มีแถว DB ที่ไร้ bytes) + log
  `[photos] store failed: ...` (ไม่มี PII)
- อ่านรูปที่ไม่พบ/inactive → 404 + log `[photos] asset not found or inactive: <file_name>`
  (file_name เป็น uniqid ไม่มี PII)

**Migration/reconciliation สำหรับแถวเก่า** (ไฟล์สูญหายจาก ephemeral disk ไปแล้ว
ตั้งแต่ก่อน migration นี้ — กู้คืนไม่ได้):

```sql
-- แถวที่รูปหาย (UI จะแสดง placeholder เพราะ GET /uploads/... ได้ 404)
SELECT photo_id, servant_id, file_name
FROM civil_servant_photos
WHERE is_active = 1 AND file_data IS NULL;
```

การแก้ = อัปโหลดรูปใหม่ผ่าน UI ตามปกติ (ระบบรองรับหลายรูปต่อคนและเลือก
`is_primary` ได้) หรือ mark `is_active = 0` สำหรับแถวที่ไม่ต้องการ

## References

- Issue #112 · Migration: `database/30-photo-blob-storage.sql`
- Code: `backend/routes/photos.php`, `backend/api.php` (case 'uploads', 'photos')
- ADR-0001 (filesystem ไม่ persist) · ADR-0002 (schema parity gate)
