# Runbook — เก็บกวาดข้อมูลทดสอบ CSP ออกจาก production (TiDB Cloud)

- **งาน:** ลบข้อมูลทดสอบ `ทดสอบCSP` ที่สร้างผ่าน API วันที่ 22 ส.ค. 2026 (CSP report-only walkthrough) ออกจาก production จริง
- **ขอบเขตที่ owner ยืนยัน (owner decisions 2026-08-24 ข้อ 4):** `personnel` ชื่อขึ้นต้น `ทดสอบCSP` · `special_area_multiplier` จังหวัดขึ้นต้น `ทดสอบCSP-`
- **ระดับ:** ⚠️ **DESTRUCTIVE** — ต้องทำตามลำดับใน runbook นี้ทุกขั้น ไม่ข้าม
- **สิทธิ์:** production DB = TiDB Cloud (เชื่อมผ่าน Render env `MYSQL_PORT=4000` + SSL) — repo ไม่มี credential → **owner รันเองผ่าน TiDB Cloud console**
- **สคริปต์:** `scripts/sql/cleanup-csp-test-data.sql` (SELECT → DELETE → SELECT ยืนยัน)

## ข้อตกลงสำคัญ

1. **ห้ามรัน DELETE ก่อน export backup และก่อน owner เห็นผล SELECT ด้วยตา**
2. `audit_log` เก็บไว้โดยตั้งใจ — แถว history ของรายการที่ถูกลบ (CREATE/UPDATE ที่เคยทำตอนสร้างข้อมูลทดสอบ) **ไม่ถูกลบ** เพราะ audit trail ต้องอยู่รอด (21-audit-log.sql) การลบข้อมูลทดสอบจึงเหลือร่องรอยใน `/audit` ตาม design
3. ตารางจริงคือ `special_area_multiplier` — ไม่มีตารางชื่อ `multiplier_areas` (นั่นคือชื่อ resource ของ API `/multiplier/areas`)

## ขั้นตอน

### 1) Export backup (บังคับ ก่อนแตะข้อมูล)

ใช้ mysqldump เฉพาะแถวในขอบเขต (utf8mb4 เสมอ — กัน Thai mojibake ตาม `docs/render-tidb-production.md`):

```bash
# แทนที่ <HOST> <PORT> <USER> ด้วยค่าจาก Render env ของ service smartport-backend
mysqldump --default-character-set=utf8mb4 --set-charset \
  -h <HOST> -P <PORT> -u <USER> -p --ssl-mode=REQUIRED \
  civil_service_mgmt personnel \
  --where="first_name LIKE 'ทดสอบCSP%' OR last_name LIKE 'ทดสอบCSP%'" \
  > backup-csp-personnel-$(date +%Y%m%d).sql

mysqldump --default-character-set=utf8mb4 --set-charset \
  -h <HOST> -P <PORT> -u <USER> -p --ssl-mode=REQUIRED \
  civil_service_mgmt special_area_multiplier \
  --where="province LIKE 'ทดสอบCSP-%'" \
  > backup-csp-areas-$(date +%Y%m%d).sql
```

- เก็บไฟล์ **นอก repo** (ธรรมเนียมเดียวกับ repair dumps — `docs/render-tidb-production.md` ห้าม commit dump เป็น source)
- ยืนยันว่าไฟล์ไม่ว่างและเปิดดูเนื้อหาได้ (มีแถวครบตามที่คาด)

### 2) SELECT ก่อนลบ + ให้ owner ยืนยัน scope

รัน **เฉพาะบล็อก 1** ของ `scripts/sql/cleanup-csp-test-data.sql` (SELECT personnel + special_area_multiplier) ผ่าน TiDB Cloud console แล้ว:

- ✅ ตรวจว่าแถวที่โผล่คือข้อมูลทดสอบ `ทดสอบCSP` จริงทุกแถว (ไม่มีชื่อจริงปน)
- ✅ owner ยืนยันยอมรับ scope นี้ (จำนวนแถว + คอลัมน์ที่แสดง)
- ถ้าไม่ตรงตามที่คาด → **หยุด** แล้วตรวจสอบก่อน (อย่าเดา)

### 3) DELETE (owner เท่านั้น)

รัน **เฉพาะบล็อก 2** ของสคริปต์ (DELETE สองตารางตาม WHERE เดียวกับ SELECT)

### 4) ยืนยันหลังลบ

รัน **เฉพาะบล็อก 3** — `personnel_left` และ `areas_left` ต้องเป็น **0 ทั้งคู่**

- ถ้าไม่ใช่ 0 → ตรวจสอบว่าทำไม (ข้อมูลใหม่อาจถูกสร้างขึ้นระหว่างทาง? รูปแบบชื่อต่าง?)
- ตรวจ `/audit` ในแอปว่า history ยังอยู่ (ตาม design ข้อ 2)

### 5) บันทึกผล

- Comment ผล (จำนวนแถวที่ลบ, path backup ไฟล์) ลง issue ที่ติดตามงานนี้
- อัปเดต `docs/frontend-security-headers.md` — ลบข้อความ "ข้อมูลทดสอบที่ยังค้างใน production (ต้องเก็บกวาด)" เมื่อเคลียร์จริง

## ข้อมูลอ้างอิง

- ที่มาของข้อมูล: สร้างผ่าน API 22 ส.ค. (`POST /api/personnel`, `POST /api/multiplier/areas`) ระหว่าง CSP report-only walkthrough — `docs/frontend-security-headers.md` (write path ที่ทดสอบจริง)
- วิธี connect production: `docs/render-tidb-production.md` (L50–58: TiDB Cloud, port 4000, SSL)
- สคริปต์: `scripts/sql/cleanup-csp-test-data.sql`
