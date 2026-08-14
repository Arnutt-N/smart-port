# Phase 0 Validation Pack — การนับทวีคูณ

เอกสารนี้ใช้สำหรับยืนยัน master data และ UAT readiness ของฟีเจอร์ "การนับเวลาราชการเป็นทวีคูณ" ใน Smart Port

สถานะ (อัปเดต 2026-08-02): `test-seed-technical-uat-pass`

- Offline validator: **12/12 PASS** (`node scripts/validate-multiplier-phase0.mjs`)
- Live API UAT: **10/10 PASS** (`node scripts/uat-multiplier-live-api.mjs`, TC-001..TC-010)
- DB data-quality: **PASS** (ไม่มีสตูลทั้งจังหวัด / ไม่มี TODO refs / ไม่มี duplicate หรือ overlap)
- **ยังไม่ใช่ HR sign-off จริง — ห้ามถือว่า production/director-ready**

Source of truth ของ fixtures:

- `docs/multiplier_phase0_master_data_template.csv` (14 แถว: M-001..M-011, E-001..E-003)
- `docs/multiplier_phase0_uat_cases_template.csv` (10 เคส: TC-001..TC-010)

## เป้าหมาย Phase 0

ก่อน seed production ต้องยืนยันข้อมูล 4 ชุดนี้ให้ครบ:

1. พื้นที่ที่นับทวีคูณได้: จังหวัด/อำเภอ
2. ช่วงวันที่มีผลบังคับใช้ของแต่ละพื้นที่
3. ฐานประกาศ/เอกสารอ้างอิงที่ HR ใช้จริง
4. ตัวอย่างผลคำนวณจาก Excel/วิธีเดิมสำหรับ UAT

ห้ามนำ `TEST_SEED` ไปใช้เป็น production seed จนกว่า checklist นี้จะผ่าน sign-off จาก HR

## Blocking Decisions

| # | Decision | Required answer | Status | Owner | Notes |
|---|----------|-----------------|--------|-------|-------|
| 1 | อัตราทวีคูณ MVP | `200% fixed` | confirmed | Product/HR | PRD ปิด open question แล้ว |
| 2 | ช่วง martial-law initial period | `2004-01-26` ถึง `2004-09-30` | TEST_SEED only | HR | ต้องยืนยันด้วยเอกสารจริง |
| 3 | สตูล scope | เฉพาะ 4 อำเภอ ไม่ใช่ทั้งจังหวัด | TEST_SEED only | HR | provisional: ควนโดน/ควนกาหลง/ท่าแพ/มะนัง |
| 4 | ช่วงหลังปี 2548 | พ.ร.ก.ฉุกเฉิน open-ended จาก `2005-07-20` | TEST_SEED only | HR | ต้องยืนยัน start/end และพื้นที่ |
| 5 | Self-view | ไม่อยู่ใน MVP | confirmed | Product/Tech | รอ auth ownership ใน roadmap |

## Master Data (CSV)

กรอก/ตรวจใน `docs/multiplier_phase0_master_data_template.csv` — สรุปสถานะปัจจุบัน:

| Row IDs | Coverage | Ratio | Period | Verified by |
|---------|----------|-------|--------|-------------|
| M-001..M-003 | ยะลา/ปัตตานี/นราธิวาส ทั้งจังหวัด | 200% | 2004-01-26..2004-09-30 MARTIAL_LAW | TEST_SEED |
| M-004..M-007 | สงขลา 4 อำเภอ | 200% | same | TEST_SEED |
| M-008..M-011 | สตูล 4 อำเภอ | 200% | same | TEST_SEED |
| E-001..E-003 | ยะลา/ปัตตานี/นราธิวาส | 200% | 2005-07-20..NULL EMERGENCY_DECREE | TEST_SEED |

ทุกแถวยังใช้ `legal_reference` / `source_reference` แบบ `TEST_SEED: ... (not HR-confirmed)`

## Source Evidence Checklist

| Evidence ID | Document name | Issuer | Date issued | Covers rows | File/path/link | Verified by | Verified date | Notes |
|-------------|---------------|--------|-------------|-------------|----------------|-------------|---------------|-------|
| EV-001 | pending HR | pending | pending | M-001..M-011 | pending | — | — | Initial martial-law period |
| EV-002 | pending HR | pending | pending | E-001..E-003 | pending | — | — | Emergency decree period |

ดู source research notes ที่ `docs/multiplier_phase0_source_research.md`

ไฟล์สำหรับส่งให้ HR กรอก:

- `docs/multiplier_phase0_hr_request.md`
- `docs/multiplier_phase0_master_data_template.csv`
- `docs/multiplier_phase0_uat_cases_template.csv`

## UAT Expected Cases (CSV)

Calculation rules ที่ต้องเทียบ:

- `service_days`: inclusive days จาก `start_date` ถึง `end_date`
- `eligible_start_date`: `MAX(start_date, effective_start_date)`
- `eligible_end_date`: `MIN(end_date, effective_end_date หรือ end_date ถ้า NULL)`
- `eligible_days`: inclusive days หลัง clamp
- `effective_days`: `eligible_days * 200 / 100`
- `bonus_days`: `eligible_days * (200 - 100) / 100`
- `net_years/net_months/net_day_remainder`: 360-day breakdown จาก `effective_days`

เคสปัจจุบัน (synthetic TEST_SEED) อยู่ใน CSV:

| Case ID | Focus | Live API (2026-08-02) |
|---------|-------|------------------------|
| TC-001 | Clamp start (ยะลา) | PASS |
| TC-002 | Clamp end (ยะลา) | PASS |
| TC-003 | Full month inside martial | PASS |
| TC-004 | สงขลา เทพา | PASS |
| TC-005 | สตูล ควนโดน | PASS |
| TC-006 | Clamp start district | PASS |
| TC-007 | Clamp end province | PASS |
| TC-008 | Emergency decree period | PASS |
| TC-009 | นราธิวาส inside martial | PASS |
| TC-010 | สงขลา สะบ้าย้อย | PASS |

Mismatch log: **ไม่มี** (0 FAIL)

## Data Quality Checks

| Check | Pass criteria | Status (CSV) | Status (DB local 2026-08-02) | Notes |
|-------|---------------|--------------|------------------------------|-------|
| No whole-province Satun row | ไม่มี `province='สตูล' AND district IS NULL` | PASS | PASS (0) | สตูลเป็น 4 อำเภอ |
| No missing legal reference | ทุก row มี `legal_reference` | PASS (TEST_SEED text) | PASS (0 empty/TODO) | ยังไม่ใช่เอกสาร HR |
| No missing source reference | ทุก row มี `source_reference` | PASS (TEST_SEED text) | PASS (0 empty/TODO) | ยังไม่ใช่เอกสาร HR |
| No duplicate exact periods | ไม่มี period ซ้ำ exact | PASS | PASS (0) | |
| No ambiguous active overlap | ไม่มีช่วงซ้อนคลุมเครือ | PASS | PASS (0) | |
| District precedence reviewed | สงขลา/สตูลเป็น district-level | PASS | PASS (8 district rows) | |
| Emergency decree coverage reviewed | มี E-001..E-003 | PASS (TEST_SEED) | PASS (3 rows) | รอ HR confirm วันที่ |
| UAT case structure complete | ≥ 10 cases + clamp | PASS | Live 10/10 PASS | synthetic เท่านั้น |

Local DB snapshot: 14 areas (ยะลา 2, ปัตตานี 2, นราธิวาส 2, สงขลา 4, สตูล 4)

## Sign-Off

| Role | Name | Decision | Date | Notes |
|------|------|----------|------|-------|
| HR owner | pending | reject / pending | — | ยังไม่มี Excel/เอกสารจริง |
| Product owner | pending | pending | — | รอ HR |
| Technical owner | engineering | conditional approve (TEST_SEED only) | 2026-08-02 | Technical UAT ผ่าน; **NOT ready for director review** |

### Director readiness verdict

**NOT ready for director review.**

เหตุผล:

1. Master data และ UAT expected ยังเป็น `TEST_SEED` ไม่ใช่เคสจาก Excel ของ HR
2. `legal_reference` / `source_reference` ยังเป็น placeholder
3. Acceptance ของ issue #23 ต้องการเทียบ HR expected 100% — รอบนี้พิสูจน์ได้แค่ engine/API ตรงกับ synthetic fixtures

เมื่อ HR ส่ง workbook กลับ: sync CSV → รัน validator + live UAT ซ้ำ → อัปเดตตาราง Sign-Off เป็น approve ก่อนนำเสนอ director

## Output After Sign-Off (HR)

เมื่อ Phase 0 ผ่าน HR จริง:

1. แทนที่ `TEST_SEED` ใน CSV / workbook
2. อัปเดต production seed / `tidb-init` ตาม ADR-0002 (หลัง validator ผ่านบนข้อมูลจริง)
3. ปิด gate production ใน `docs/multiplier_phase0_hr_request.md`
4. ปิด GitHub issue #23 เมื่อ director package พร้อม

อ้างอิงรายงานเทคนิค: `frontend/docs/multiplier_verification_report.md`
