# Phase 0 Validation Pack — การนับทวีคูณ

เอกสารนี้ใช้สำหรับยืนยัน master data ก่อนเริ่มพัฒนา/ทำ migration ฟีเจอร์ "การนับเวลาราชการเป็นทวีคูณ" ใน Smart Port

สถานะ: `test-seed` — validator 2026-07-13: **12/12 PASS** ด้วย `TEST_SEED` (ยังไม่ใช่ HR sign-off จริง; ห้ามถือว่า production-ready จนกว่า HR ยืนยัน)

## เป้าหมาย Phase 0

ก่อนเริ่มเขียน migration หรือ backend calculation ต้องยืนยันข้อมูล 4 ชุดนี้ให้ครบ:

1. พื้นที่ที่นับทวีคูณได้: จังหวัด/อำเภอ
2. ช่วงวันที่มีผลบังคับใช้ของแต่ละพื้นที่
3. ฐานประกาศ/เอกสารอ้างอิงที่ HR ใช้จริง
4. ตัวอย่างผลคำนวณจาก Excel/วิธีเดิมสำหรับ UAT

ห้ามนำข้อมูล mockup ไปใช้เป็น production seed จนกว่า checklist นี้จะผ่าน sign-off

## Blocking Decisions

| # | Decision | Required answer | Status | Owner | Notes |
|---|----------|-----------------|--------|-------|-------|
| 1 | อัตราทวีคูณ MVP | `200% fixed` | confirmed | Product/HR | PRD ปิด open question แล้ว |
| 2 | ช่วง martial-law initial period | `2004-01-26` ถึง `2004-09-30` | needs HR/source confirmation | HR | Reviewer ระบุให้แก้จาก draft เดิม |
| 3 | สตูล scope | เฉพาะ 4 อำเภอ ไม่ใช่ทั้งจังหวัด | needs HR/source confirmation | HR | ต้องระบุชื่ออำเภอจริงก่อน seed |
| 4 | ช่วงหลังปี 2548 | ต้องมี coverage ตาม พ.ร.ก.ฉุกเฉิน ถ้าใช้ใน Excel เดิม | needs HR/source confirmation | HR | ระบุ start/end และพื้นที่ให้ครบ |
| 5 | Self-view | ไม่อยู่ใน MVP | confirmed | Product/Tech | รอ auth ownership ใน roadmap |

## Master Data Template

กรอก 1 แถวต่อ 1 พื้นที่/ช่วงเวลา/ฐานประกาศ หากพื้นที่เดียวมีหลายช่วง ให้แยกหลายแถว

| Row ID | Province | District | Whole province? | Basis type | Ratio | Effective start | Effective end | Legal reference | Source reference | HR confirmed? | Notes |
|--------|----------|----------|-----------------|------------|-------|-----------------|---------------|-----------------|------------------|---------------|-------|
| M-001 | ยะลา | `NULL` | yes/no | `MARTIAL_LAW` | 200.00 | 2004-01-26 | 2004-09-30 | TODO | TODO | no | Confirm whole-province coverage |
| M-002 | ปัตตานี | `NULL` | yes/no | `MARTIAL_LAW` | 200.00 | 2004-01-26 | 2004-09-30 | TODO | TODO | no | Confirm whole-province coverage |
| M-003 | นราธิวาส | `NULL` | yes/no | `MARTIAL_LAW` | 200.00 | 2004-01-26 | 2004-09-30 | TODO | TODO | no | Confirm whole-province coverage |
| M-004 | สงขลา | เทพา | no | `MARTIAL_LAW` | 200.00 | 2004-01-26 | 2004-09-30 | TODO | TODO | no | Confirm district list |
| M-005 | สงขลา | สะบ้าย้อย | no | `MARTIAL_LAW` | 200.00 | 2004-01-26 | 2004-09-30 | TODO | TODO | no | Confirm district list |
| M-006 | สงขลา | นาทวี | no | `MARTIAL_LAW` | 200.00 | 2004-01-26 | 2004-09-30 | TODO | TODO | no | Confirm district list |
| M-007 | สงขลา | จะนะ | no | `MARTIAL_LAW` | 200.00 | 2004-01-26 | 2004-09-30 | TODO | TODO | no | Confirm district list |
| M-008 | สตูล | TODO อำเภอ 1 | no | `MARTIAL_LAW` | 200.00 | 2004-01-26 | 2004-09-30 | TODO | TODO | no | Must be one of confirmed 4 districts |
| M-009 | สตูล | TODO อำเภอ 2 | no | `MARTIAL_LAW` | 200.00 | 2004-01-26 | 2004-09-30 | TODO | TODO | no | Must be one of confirmed 4 districts |
| M-010 | สตูล | TODO อำเภอ 3 | no | `MARTIAL_LAW` | 200.00 | 2004-01-26 | 2004-09-30 | TODO | TODO | no | Must be one of confirmed 4 districts |
| M-011 | สตูล | TODO อำเภอ 4 | no | `MARTIAL_LAW` | 200.00 | 2004-01-26 | 2004-09-30 | TODO | TODO | no | Must be one of confirmed 4 districts |
| E-001 | ยะลา | `NULL` | yes/no | `EMERGENCY_DECREE` | 200.00 | TODO | TODO/NULL | TODO | TODO | no | Post-2548 coverage |
| E-002 | ปัตตานี | `NULL` | yes/no | `EMERGENCY_DECREE` | 200.00 | TODO | TODO/NULL | TODO | TODO | no | Post-2548 coverage |
| E-003 | นราธิวาส | `NULL` | yes/no | `EMERGENCY_DECREE` | 200.00 | TODO | TODO/NULL | TODO | TODO | no | Post-2548 coverage |

## Source Evidence Checklist

แนบหรืออ้างอิงเอกสารสำหรับทุกแถวใน master data

| Evidence ID | Document name | Issuer | Date issued | Covers rows | File/path/link | Verified by | Verified date | Notes |
|-------------|---------------|--------|-------------|-------------|----------------|-------------|---------------|-------|
| EV-001 | TODO | TODO | TODO | M-001..M-011 | TODO | TODO | TODO | Initial period |
| EV-002 | TODO | TODO | TODO | E-001..E-003 | TODO | TODO | TODO | Emergency decree period |

ดู source research notes และช่องทางค้นเอกสารที่ `docs/multiplier_phase0_source_research.md`

ไฟล์สำหรับส่งให้ HR กรอก:

- `docs/multiplier_phase0_hr_request.md`
- `docs/multiplier_phase0_master_data_template.csv`
- `docs/multiplier_phase0_uat_cases_template.csv`

## UAT Expected Cases

ต้องมีอย่างน้อย 10 รายการจริงจาก Excel/วิธีเดิม และต้องมี case คร่อมวันเริ่ม/สิ้นสุดประกาศ

Calculation rules ที่ต้องเทียบ:

- `service_days`: inclusive days จาก `start_date` ถึง `end_date`
- `eligible_start_date`: `MAX(start_date, effective_start_date)`
- `eligible_end_date`: `MIN(end_date, effective_end_date หรือ end_date ถ้า NULL)`
- `eligible_days`: inclusive days หลัง clamp
- `effective_days`: `eligible_days * 200 / 100`
- `bonus_days`: `eligible_days * (200 - 100) / 100`
- `net_years/net_months/net_day_remainder`: 360-day breakdown จาก `effective_days`

| Case ID | Personnel/example | Province | District | Service start | Service end | Expected eligible start | Expected eligible end | Expected eligible days | Expected effective days | Expected bonus days | Expected net Y/M/D | Excel/source ref | HR confirmed? | Notes |
|---------|-------------------|----------|----------|---------------|-------------|-------------------------|-----------------------|------------------------|-------------------------|--------------------|------------------|------------------|---------------|-------|
| TC-001 | Example clamp start | ยะลา | `NULL` | 2004-01-01 | 2004-02-10 | 2004-01-26 | 2004-02-10 | 16 | 32 | 16 | 0/1/2 | TODO | no | Starts before effective period |
| TC-002 | Example clamp end | ยะลา | `NULL` | 2004-08-01 | 2004-10-15 | 2004-08-01 | 2004-09-30 | 61 | 122 | 61 | 0/4/2 | TODO | no | Ends after effective period |
| TC-003 | TODO real case | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | no | HR Excel case |
| TC-004 | TODO real case | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | no | HR Excel case |
| TC-005 | TODO real case | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | no | HR Excel case |
| TC-006 | TODO real case | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | no | HR Excel case |
| TC-007 | TODO real case | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | no | HR Excel case |
| TC-008 | TODO real case | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | no | HR Excel case |
| TC-009 | TODO real case | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | no | HR Excel case |
| TC-010 | TODO real case | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | no | HR Excel case |

## Data Quality Checks Before Migration

ต้องผ่านทุกข้อก่อนสร้าง `database/13-multiplier-time-counting.sql`

| Check | Pass criteria | Status | Notes |
|-------|---------------|--------|-------|
| No whole-province Satun row | ไม่มี row `province = 'สตูล' AND district IS NULL` | pending | สตูลต้องเป็น 4 อำเภอเท่านั้น |
| No missing legal reference | ทุก row มี `legal_reference` | pending | ห้ามเป็น TODO ใน final seed |
| No missing source reference | ทุก row มี `source_reference` | pending | ระบุไฟล์/หน้า/ลิงก์ |
| No ambiguous active overlap | province+district+basis_type ไม่มีช่วงซ้อนที่ทำให้ lookup ไม่ deterministic | pending | ใช้ helper query จาก `docs/multiplier_seed_data_mockup.sql` |
| District precedence reviewed | district-level row ไม่ถูก province-level row กลบผลผิด | pending | ตรวจ case สงขลา/สตูล |
| Emergency decree coverage reviewed | ช่วงหลังปี 2548 ครบตาม Excel เดิม | pending | ถ้าไม่มี ต้องระบุเหตุผล |
| UAT cases complete | มีอย่างน้อย 10 cases และ HR confirm expected output | pending | รวม clamp start/end |

## Sign-Off

| Role | Name | Decision | Date | Notes |
|------|------|----------|------|-------|
| HR owner | TODO | approve/reject | TODO | Master data |
| Product owner | TODO | approve/reject | TODO | MVP scope |
| Technical owner | TODO | approve/reject | TODO | Migration readiness |

## Output After Sign-Off

เมื่อ Phase 0 ผ่าน ให้สร้างงานต่อไปนี้:

1. `database/13-multiplier-time-counting.sql`
2. Backend calculation tests จาก UAT expected cases
3. `backend/routes/multiplier.php`
4. `frontend/src/composables/useMultiplier.js`
5. `frontend/src/pages/MultiplierPage.vue`
6. Sidebar/router wiring

อ้างอิง mock seed: `docs/multiplier_seed_data_mockup.sql`
