# Runbook: Rollback & Restore (Smart Port production บน Render + TiDB Cloud)

**Scope:** `smart-port` (frontend static site) · `smartport-backend` (Docker) · TiDB Cloud (`civil_service_mgmt`)
**Issue:** #114 · อัปเดตล่าสุด: 2026-08-15

## บทบาท (owners) และ decision points

| บทบาท | ใคร | ตัดสินใจเรื่อง |
|---|---|---|
| Incident lead | เจ้าของ repo (Arnutt-N) | ประกาศ rollback / go-no-go แต่ละขั้น |
| Operator | คนที่ถือ Render dashboard | กด deploy/rollback จริง |
| DB owner | คนที่ถือ TiDB Cloud console | restore/point-in-time recovery |

> กฎ: ทุกขั้นที่ต้องแตะ production ต้องได้ explicit go จาก incident lead ก่อน — ห้ามทำต่อเนื่องเอง

## 1. Rollback application (code) — ไม่แตะข้อมูล

ใช้เมื่อ deploy ใหม่พัง (5xx, login ไม่ได้, พฤติกรรมผิด) และยังไม่มีการแก้ข้อมูล

1. ตรวจ release ที่ live: `GET https://smartport-backend.onrender.com/` → ฟิลด์ `release`
   (commit SHA) — เทียบกับ `git log` เพื่อระบุว่า deploy ไหนพัง
2. ตรวจ readiness: `GET /readyz` — ถ้า `migrations_pending > 0` แสดงว่า image นำหน้า schema
   (ไปข้อ 2 ก่อน rollback เพราะ migration ค้างครึ่งทาง)
3. Render dashboard → `smartport-backend` → **Deploys** → เลือก deploy ก่อนหน้า → **Restore**
   (frontend ทำเหมือนกันที่ service `smart-port` ถ้าพังจากฝั่ง UI)
4. Verify: `/` 200 + `release` ตรงกับ commit ที่ตั้งใจ, `/readyz` 200, login smoke test
   (คำสั่งใน `docs/render-tidb-production.md` หัวข้อ 6)

**Decision point:** ถ้า deploy ที่พัง "รัน migration ไปแล้ว" → migration ของ repo นี้เป็นแบบ
additive (เพิ่มคอลัมน์/ตาราง ไม่ drop) ดังนั้น image เก่ามักรันกับ schema ใหม่ได้ แต่ถ้า migration
นั้นเปลี่ยน semantics ของคอลัมน์ที่โค้ดเก่าอ่าน ให้ incident lead ตัดสินใจว่าจะ restore DB ด้วยหรือไม่
(ข้อ 3)

## 2. Migration ล้มเหลวตอน start (container restart วน)

อาการ: Render log มี `[run-migrations]` error ต่อด้วย health check fail

1. อ่าน log ระบุไฟล์ migration ที่ล้ม (runner บอกชื่อไฟล์ก่อน statement ที่ error)
2. แก้ไฟล์ migration ใน repo ให้ idempotent/ถูกต้อง → merge → deploy ใหม่
   (runner ข้าม migration ที่ applied แล้วใน `schema_migrations` — ไฟล์ที่สำเร็จไม่ถูกรันซ้ำ)
3. ถ้าต้องแก้ข้อมูล/แถวที่ migration ครึ่งทางสร้างไว้: ทำโดย DB owner ผ่าน TiDB console
   หรือ mysql client แล้วบันทึกคำสั่งที่ใช้ไว้ใน incident note
4. Verify: `/readyz` → `migrations_pending: 0` และ status `ready`

**Decision point:** ห้ามลบแถว `schema_migrations` ด้วยมือเพื่อ "รีเซ็ต" เว้นแต่ incident lead
อนุมัติ — การ rerun migration ที่ไม่ idempotent ซ้ำอาจพัง schema

## 3. Restore ข้อมูล (TiDB Cloud)

ใช้เมื่อข้อมูลเสียหาย (ลบผิด, import ผิด, corruption) — ไม่ใช่เมื่อโค้ดพัง

1. TiDB Cloud console → cluster → **Backup & Restore**
   - เช็คเวลา backup ล่าสุด (Serverless มี automated backup ตาม policy ของ plan)
2. เลือกวิธี:
   - **Restore เป็น cluster ใหม่** (แนะนำ — ไม่กระทบของ live) แล้ว diff/คัดลอกเฉพาะส่วนที่ต้องการ
   - **Point-in-time restore** ถ้า plan รองรับและต้องการย้อนเวลาระหว่าง backup
3. DB owner รัน restore แล้วส่ง connection info ให้ incident lead (ห้ามโพสต์ credential ใน issue/chat)
4. เปรียบเทียบข้อมูลกับ production ก่อนสลับ: จำนวนแถวตารางหลัก (`personnel`, `users`),
   สุ่มตรวจ citizen_id checksum ด้วย `isValidCitizenId`
5. สลับ: อัปเดต `MYSQL_*` env ใน Render → redeploy → verify `/readyz` + login + หน้าหลัก

**Decision point:** การสลับ production ไป cluster ใหม่ต้องได้รับ go จาก incident lead เท่านั้น
และต้องอัปเดตเอกสารนี้พร้อมบันทึกเวลาที่ทำจริง

## 4. หลักฐานที่ต้องเก็บหลัง incident (recovery evidence)

- output ของ `GET /` และ `GET /readyz` (bind release SHA + สถานะ DB/migration)
- Render deploy log ของ deploy ที่ rollback/restore
- TiDB backup/restore job ID + เวลา
- บันทึก incident: timeline, root cause, ผลกระทบ (เก็บเป็น private note — ห้ามแนบ PII เช่น
  citizen_id/ชื่อ-สกุล ลง issue สาธารณะ)

## อ้างอิง

- `docs/render-tidb-production.md` — env vars, deploy verification
- `docs/adr/0001-no-framework-php-api.md` — ข้อจำกัด Render filesystem
- `docs/adr/0003-photo-storage-tidb-blob.md` — รูปอยู่ใน TiDB (กู้คืนพร้อมข้อ 3)
