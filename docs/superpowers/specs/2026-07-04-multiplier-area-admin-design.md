# Design — จัดการพื้นที่ทวีคูณ (Multiplier Area Admin)

> วันที่ 2026-07-04 · branch `feat/multiplier-area-admin` · ต่อยอด PR #24 (merged `34e6cfc`)
> ที่มา: brainstorming session — user เลือกทางเลือก (A) "พื้นที่ ratio หลากหลาย ≥ 100%" + แนวทาง 2 "หน้า Admin แยก"

## 1. เป้าหมาย

ให้ HR (admin) จัดการ master data `special_area_multiplier` ได้เองผ่านหน้าจอ โดยกำหนด
`multiplier_ratio` ได้อิสระ (เช่น 150%, 175%, 300%) ภายใต้ constraint เดิม `>= 100.00` —
ปัจจุบันเพิ่มพื้นที่ได้ทาง SQL เท่านั้น (seed 7 แถว ratio 200% ทั้งหมด)

## 2. ขอบเขต

**ทำ:**
- เพิ่มพื้นที่ใหม่ (create)
- ปิด/เปิดใช้งาน (toggle `is_active`) — ต้องมี "เปิดกลับ" เพราะปิดผิดแล้วเพิ่มแถวเดิมซ้ำไม่ได้ (ติด unique index) จะไม่มีทางกู้คืน
- หน้า admin แยก + รายการ sidebar

**ไม่ทำ (ยืนยันกับ user แล้ว):**
- แก้ไขพื้นที่ (edit) — master data เป็น immutable: ข้อมูลผิด = ปิดตัวเก่า + เพิ่มตัวใหม่
- ลบถาวร (hard delete)
- สิทธิ์แยก super-admin (ทุก admin จัดการได้ ผ่าน `requireAdmin()` เดิม)
- ratio < 100% (นับลด/ครึ่งเวลา = คนละ concept, `CHECK (multiplier_ratio >= 100.00)` คงเดิม)

**เหตุผลเลือกหน้าแยก (แนวทาง 2) เหนือ tab ในหน้าเดิม:** master data มี lifecycle/governance
ต่างจาก record รายวัน, `MultiplierPage.vue` ~500 บรรทัดไม่ควรโตต่อ, route แยกติด permission
guard แยกได้ในอนาคต, และระบบราชการมี master data เพิ่มเรื่อยๆ (คู่สายงานเกื้อกูล, ตารางเทียบตำแหน่ง)

## 3. Backend API (เพิ่มใน `backend/routes/multiplier.php` เดิม)

ทั้งสอง endpoint อยู่ใต้ `requireAdmin()` gate ที่ต้น `handleMultiplier()` อัตโนมัติ

### 3.1 `POST /multiplier/areas` — เพิ่มพื้นที่

Request body (JSON):

| field | required | กติกา |
|---|---|---|
| `province` | ✅ | ไม่ว่าง |
| `district` | — | ว่าง/null = ทั้งจังหวัด (`district_key` generated column จัดการ) |
| `basis_type` | ✅ | free text (เช่น `MARTIAL_LAW`) |
| `multiplier_ratio` | ✅ | ตัวเลข `>= 100` และ `<= 999.99` (เพดาน `DECIMAL(5,2)`) |
| `effective_start_date` | ✅ | `Y-m-d` — parse ด้วย `DateTime::createFromFormat('Y-m-d\|', ...)` ตาม pattern เดิม |
| `effective_end_date` | — | ถ้ามี ต้อง `>= effective_start_date` |
| `legal_reference` | — | string ≤ 300 |
| `source_reference` | — | string ≤ 500 |

- Validation ทำฝั่ง server ทุกข้อ (ไม่เชื่อ client) — error message ภาษาไทย, 400
- **กันซ้ำ:** unique index `uq_area_multiplier_exact_period` (province, district_key, basis_type,
  effective_start_date) มีอยู่แล้ว → catch `PDOException` SQLSTATE `23000` → **409**
  "มีพื้นที่/ช่วงเวลานี้อยู่แล้ว" (ไม่ pre-check SELECT — ให้ index เป็น source of truth กัน race)
- บันทึก `created_by` = `user_id` จาก JWT (ดู §4)
- Response **201**: `{ success, area_multiplier_id, data: <row ที่ decorate แล้ว> }`
  (decorate = `area_label`, วันที่ไทย, `source_pending` — reuse logic เดียวกับ `getMultiplierAreas()`
  โดย extract เป็น function `decorateAreaRow()` ใช้ร่วมกัน)

### 3.2 `PUT /multiplier/areas/{id}/status` — ปิด/เปิดใช้งาน

- Body: `{ "is_active": 0 | 1 }` — ค่าอื่น → 400
- id ไม่พบ → 404
- Idempotent: ตั้งค่าซ้ำค่าเดิม → 200 ปกติ (ไม่ error)
- ใช้ **PUT ไม่ใช่ PATCH** — CORS header ใน `api.php` อนุญาตแค่ GET/POST/PUT/DELETE
  และ `useApi()` composable มีแค่ `get/post/put/del`
- Response 200: `{ success, data: <row ล่าสุด decorate แล้ว> }`

### 3.3 `GET /multiplier/areas` (เดิม — ไม่แก้ logic)

หน้า admin เรียกด้วย `?active_only=0` เพื่อเห็นทุกแถวรวมที่ปิดใช้งาน (param มีอยู่แล้ว)

### ผลกระทบต่อการคำนวณ: ศูนย์

`computeMultiplierFields()` และ `QualificationEngine` **ไม่ถูกแตะ** — สูตร
`bonus_days = eligible_days × (ratio − 100) / 100` รองรับ ratio ใดๆ ≥ 100 อยู่แล้ว
งานนี้คือ "เปิดประตูให้ข้อมูลใหม่เข้า" ไม่ใช่เปลี่ยนตรรกะ

## 4. Schema — ไฟล์ใหม่ `database/14-multiplier-area-admin.sql`

```sql
ALTER TABLE special_area_multiplier ADD COLUMN created_by BIGINT NULL;
```

- audit ว่าใครเพิ่ม master data — ตาม pattern `multiplier_experience.created_by` ที่มีแล้ว
- ไม่แตะ CHECK / index / seed เดิม
- mount เพิ่มใน `docker-compose.yaml` ตาม pattern ไฟล์ 13 (init รันเฉพาะ fresh volume)
- **prod TiDB Cloud ต้อง apply มือ** เหมือนไฟล์ 13 (บันทึกใน follow-up เดิมแล้ว)

## 5. Frontend

### 5.1 หน้าใหม่ `frontend/src/pages/MultiplierAreasPage.vue`

- Route `/time-multiplier/areas` (ตาม naming เดิมของ SPA `/time-multiplier`; backend API = `/multiplier/areas`) — lazy-load, `meta.requiresAdmin` (pattern มีแล้วใน router)
- Sidebar: เพิ่มรายการ "จัดการพื้นที่พิเศษ" ใกล้รายการทวีคูณเดิม
- โครงหน้า:
  - Summary cards: จำนวนพื้นที่ทั้งหมด / ใช้งานอยู่ / รอยืนยันแหล่งอ้างอิง (`source_pending`)
  - ตาราง: พื้นที่ (`area_label`) · `basis_type` · **ratio %** · ช่วงมีผล (วันที่ไทย) ·
    อ้างอิงกฎหมาย + badge `SOURCE_PENDING` · สถานะ (ใช้งาน/ปิด) · ปุ่มปิด/เปิดใช้งาน
  - ปุ่มปิด/เปิดใช้งานมี **confirm** ก่อนยิง (ข้อความบอกผล: พื้นที่ที่ปิดจะไม่ขึ้นใน dropdown
    ตอนบันทึก record ใหม่ — record เดิมไม่กระทบเพราะ snapshot ค่าไว้แล้ว)
  - ปุ่ม "เพิ่มพื้นที่" → modal ฟอร์ม

### 5.2 Modal ฟอร์มเพิ่มพื้นที่

- `province` text · `district` text พร้อม hint "เว้นว่าง = ทั้งจังหวัด"
- `basis_type` text + `<datalist>` จากค่า distinct ที่มีอยู่ (ไม่ hardcode หมวดกฎหมาย)
- `multiplier_ratio` number (min 100, max 999.99, step 0.01) + chips ลัด `150 / 200 / 300`
- ช่วงวันที่มีผล (start required, end optional) · `legal_reference` · `source_reference`
- Validation ฝั่ง client ก่อนส่ง (required, ratio ≥ 100, end ≥ start) — server ตรวจซ้ำเสมอ
- a11y ตาม pattern `MultiplierPage.vue`: `role=dialog`, `aria-modal`, Escape ปิด,
  cleanup listener ใน `onBeforeUnmount`
- Error จาก server (400/409) แสดงในฟอร์ม; สำเร็จ → toast + refresh ตาราง

### 5.3 เชื่อมกับหน้า record เดิม (`MultiplierPage.vue`)

- ลิงก์ "จัดการพื้นที่ →" (router-link) ข้าง dropdown เลือกพื้นที่ — จุดเดียวที่แตะไฟล์เดิม
- dropdown สดเองเมื่อกลับมา เพราะหน้า remount → `onMounted` refetch อยู่แล้ว (ไม่เขียนเพิ่ม)

## 6. Error handling สรุป

| กรณี | ตอบ |
|---|---|
| body ไม่ใช่ JSON / field ขาด / ratio นอกช่วง / วันที่ผิด | 400 + ข้อความไทยระบุ field |
| พื้นที่+ช่วงเวลาซ้ำ (unique index) | 409 |
| `{id}` ไม่พบ (status endpoint) | 404 |
| `is_active` ไม่ใช่ 0/1 | 400 |
| PDOException อื่น | 500 generic (catch กลางใน `handleMultiplier()` เดิม — ไม่ leak SQL) |
| ไม่ใช่ admin | 403 (จาก `requireAdmin()` เดิม) |

## 7. Testing / Verification

1. **Integration test (PHPUnit + MySQL จริง)** — เพิ่มใน suite เดิม:
   - insert พื้นที่ ratio **150** ชั่วคราว → `computeMultiplierFields()` ต้องได้
     `bonus_days = eligible × 0.5` → พิสูจน์ ratio อื่นนอกจาก 200 ไหลถูกทั้งสาย
   - ต่อด้วย QualificationEngine: record จากพื้นที่ ratio 150 ต้องเลื่อน `qualification_date`
     เท่ากับ `FLOOR(bonus_days)` (relative-shift + `finally` cleanup ตาม pattern test เดิม)
   - golden values เดิมต้องไม่ regress
2. **Route smoke** — curl script ยิง POST (สำเร็จ/ซ้ำ 409/ratio 80 → 400) + PUT status
   (route handler ไม่มี harness ครอบ — ข้อจำกัดเดิมของ repo)
3. **Frontend** — `npm run build` + test suite เดิมผ่าน; ทดลองหน้าใหม่ผ่าน browser
4. PHP lint ผ่าน `php:8.3-cli` container (host ไม่มี PHP CLI)

## 8. ความเสี่ยง / หมายเหตุ

- **Data governance:** พื้นที่ที่ HR เพิ่มเองต้องกรอก `legal_reference` — ฟอร์มไม่บังคับ (optional
  ตาม schema) แต่ตารางแสดง badge เตือนถ้าขาด เพื่อไม่บล็อกงานแต่มองเห็นหนี้
- Satun (สตูล) ยังห้าม seed ทั้งจังหวัด (รอยืนยัน 4 อำเภอ) — หน้านี้ทำให้ HR เพิ่มเองได้
  เมื่อยืนยันแล้ว โดยไม่ต้องพึ่ง SQL
- `SOURCE_PENDING` ใน seed เดิมยังต้องแทนด้วยอ้างอิงจริงก่อน production (follow-up เดิม)
