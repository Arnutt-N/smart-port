# PRP Plan — Issue #127: Photo storage polish (phantom thumbnails + CSPRNG filenames)

- **Branch:** `issue-127-photo-storage-polish`
- **Date:** 2026-08-16
- **Decision:** Option (a) — remove the phantom thumbnail row insertion (issue ให้เลือก a/b)

## Why option (a)

1. GD ไม่ถูกติดตั้งทั้ง production image (`backend/Dockerfile` ใช้ `--ignore-platform-req=ext-gd`)
   และ test image (`Dockerfile.test` ไม่มี GD เลย) → option (b) "สร้าง thumbnail จริง"
   ต้องแก้ image ทั้งสอง + โค้ด resize ใหม่ = blast radius ใหญ่เกินจำเป็น
2. Frontend ไม่เคยอ่าน `versions` — grep `versions|thumb_` ใน `frontend/src/` ไม่พบ match
3. แถว `thumb_<file>` ที่ไม่มี bytes ทำให้ `GET /uploads/thumb_<file>` 404 เสมอ — โฆษณา asset ที่เข้าไม่ถึง

## Changes

### 1. `backend/helpers.php`
- ลบ `createPhotoVersions()` ทั้งฟังก์ชัน (เรียกจากที่เดียวคือ `storePhotoRecord`)

### 2. `backend/routes/photos.php`
- `storePhotoRecord()`: เอา `createPhotoVersions()` ออกจาก transaction, return `['photo_id' => ...]` ล้วน
- อัปเดต docblock/comment ที่อ้าง `uniqid` → CSPRNG (`bin2hex(random_bytes(16))`)

### 3. `backend/api.php` (case 'photos' POST)
- `$safeFileName = uniqid('photo_', true) . '.' . $ext;` → `'photo_' . bin2hex(random_bytes(16)) . '.' . $ext;`
  (drop-in: `fetchActivePhoto()` lookup ตาม `file_name` ที่เก็บไว้ — ชื่อเก่ายังเสิร์ฟได้)
- Response: เอา `'versions'` ออก (เหลือ `success/photo_id/path`)

### 4. `backend/tests/Integration/PhotoStorageTest.php`
- roundtrip test: แทน assert `thumb_...` ด้วย assert ว่า **ไม่มี** แถว `photo_versions` ถูกสร้าง
- cleanup() คงเดิม (กันแถวค้างเก่า)

### 5. `docs/adr/0003-photo-storage-tidb-blob.md`
- Decision ข้อ 4: `uniqid(..., true)` → `bin2hex(random_bytes(16))` (CSPRNG จริง; uniqid เป็น time+LCG)
- เพิ่มหมายเหตุ: ไม่สร้างแถว `photo_versions` แล้ว (issue #127)

### 6. แถว phantom เดิมใน DB (operational, ไม่บังคับ)
```sql
-- ทำครั้งเดียวถ้าต้องการล้างแถว thumb_* ที่ไม่มี bytes จริง
DELETE pv FROM photo_versions pv
JOIN civil_servant_photos p ON p.photo_id = pv.photo_id
WHERE pv.version_type = 'thumbnail' AND pv.file_name LIKE 'thumb\_%';
```
ตาราง `photo_versions` คงอยู่ (เผื่อทำ thumbnail จริงในอนาคต)

## Acceptance criteria

- [ ] ไม่มี phantom `photo_versions` row ถูกสร้างตอนอัปโหลด (test ครอบ)
- [ ] ชื่อไฟล์ใหม่มาจาก CSPRNG (`random_bytes`)
- [ ] รูปเดิม (ชื่อ uniqid เก่า) ยังเสิร์ฟได้ — lookup ตาม file_name ที่เก็บไว้
- [ ] Upload response ไม่มี `versions`
- [ ] Backend suite เขียว + CI gate ผ่าน

## Risks

- Client ภายนอกที่อ่าน `versions` จาก upload response → ไม่มี (grep frontend ไม่พบ)
- ชื่อใหม่ยาวขึ้น (photo_ + 32 hex + ext ≈ 43 ตัว) — ยังอยู่ในขีดจำกัด `isValidPhotoFileName` (≤255) และคอลัมน์ file_name
