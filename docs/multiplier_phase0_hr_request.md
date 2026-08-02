# HR Request — Phase 0 การนับทวีคูณ

เอกสารนี้ใช้ส่งให้ HR/source owner เพื่อขอข้อมูลที่ต้องยืนยันก่อนเริ่มพัฒนาฟีเจอร์ "การนับเวลาราชการเป็นทวีคูณ"

## สิ่งที่ต้องการจาก HR

กรุณายืนยันข้อมูล 3 ชุดนี้:

1. **Master data พื้นที่/ช่วงเวลา**
   - จังหวัด
   - อำเภอ ถ้าไม่ใช่ทั้งจังหวัด
   - ฐานประกาศ เช่น `MARTIAL_LAW`, `EMERGENCY_DECREE`, หรืออื่น ๆ
   - วันที่เริ่ม/สิ้นสุดที่มีสิทธินับทวีคูณ
   - อัตราทวีคูณ รอบ MVP ใช้ 200%
   - เอกสารอ้างอิงที่ใช้จริง

2. **เอกสารอ้างอิง**
   - มติ ครม.
   - ราชกิจจานุเบกษา
   - หนังสือเวียน ก.พ.
   - ประกาศจังหวัด/อ.ก.พ./ก.จ.จ.
   - คู่มือหรือไฟล์ Excel ภายในที่ใช้อยู่จริง

3. **ตัวอย่าง UAT จาก Excel เดิม**
   - อย่างน้อย 10 รายการ
   - ต้องมีตัวอย่างที่วันปฏิบัติงานคร่อมวันเริ่มประกาศ
   - ต้องมีตัวอย่างที่วันปฏิบัติงานคร่อมวันสิ้นสุดประกาศ
   - ระบุผลลัพธ์จาก Excel เดิม: วันเข้าข่าย, วันทวีคูณ, วัน bonus, และ breakdown ปี/เดือน/วัน

## ไฟล์ที่ให้ HR กรอก (ส่งไฟล์นี้เป็นหลัก)

**ไฟล์หลัก:** `docs/multiplier_phase0_hr_workbook.xlsx`

| Sheet | กรอกอะไร |
|-------|----------|
| `คำชี้แจง` | อ่านอย่างเดียว — วิธีกรอกวันที่ (ค.ศ. `YYYY-MM-DD`) |
| `1-พื้นที่ทวีคูณ` | master data ทุกแถว + เอกสารอ้างอิง + ผู้ยืนยัน |
| `2-ตัวอย่างจริง UAT` | อย่างน้อย 10 เคสจาก Excel เดิม (มีคร่อมวันเริ่ม/สิ้นสุด) |
| `เครื่องช่วยตรวจคำนวณ` | ใช้ช่วยเทียบตัวเลขกับ Excel เดิม (ไม่บังคับ) |

ไฟล์สำรอง (CSV เทียบเท่า — ใช้เมื่อ HR ไม่สะดวกกับ xlsx):

- `docs/multiplier_phase0_master_data_template.csv`
- `docs/multiplier_phase0_uat_cases_template.csv`

## สถานะหลัง technical UAT (2026-08-02)

ทีมพัฒนาตรวจแล้วบน Docker local:

| Gate | Result |
|------|--------|
| `node scripts/validate-multiplier-phase0.mjs` | **12/12 PASS** (TEST_SEED) |
| `node scripts/uat-multiplier-live-api.mjs` | **10/10 PASS** (TC-001..TC-010) |
| DB data-quality queries | **PASS** (0 bad rows) |
| Director readiness | **NO** — รอ HR แทนที่ TEST_SEED |

รายละเอียด: `docs/multiplier_phase0_validation_pack.md`, `frontend/docs/multiplier_verification_report.md`

## ช่องว่างที่ต้องปิดก่อน production (สถานะ gate)

- **Dev/test gate:** ผ่านแล้วด้วย `TEST_SEED` (ไม่ใช่ HR sign-off)
- **Production / director gate:** ยังต้องให้ HR กรอก workbook จริงแล้วแทนที่ `TEST_SEED` ทุกแถว

| # | สิ่งที่ HR ต้องยืนยันแทน TEST_SEED | Checklist |
|---|-------------------------------------|-----------|
| 1 | สตูล 4 อำเภอที่มีสิทธิจริง (ตอนนี้ provisional: ควนโดน/ควนกาหลง/ท่าแพ/มะนัง) | [ ] |
| 2 | `legal_reference` จากมติ/ประกาศ/หนังสือเวียนจริง | [ ] |
| 3 | `source_reference` (ไฟล์/หน้า/ลิงก์หลักฐาน) | [ ] |
| 4 | ช่วง พ.ร.ก.ฉุกเฉินหลังปี 2548 (ตอนนี้ provisional start `2005-07-20`) | [ ] |
| 5 | UAT ≥ 10 เคสจาก Excel เดิม (ตอนนี้เป็น synthetic) | [ ] |
| 6 | `verified_by` / `verified_date` ของ HR จริง | [ ] |

## จุดที่ต้องยืนยันเป็นพิเศษ

| Topic | Required confirmation |
|-------|-----------------------|
| สตูล | ต้องระบุ 4 อำเภอที่มีสิทธิ ห้าม seed เป็นทั้งจังหวัด |
| สงขลา | ต้องยืนยันอำเภอที่มีสิทธิจริง |
| Initial period | ยืนยันช่วง `2004-01-26` ถึง `2004-09-30` พร้อมเอกสารอ้างอิง |
| Post-2548 period | ยืนยันช่วง พ.ร.ก.ฉุกเฉินหลังปี 2548 พร้อมพื้นที่ที่ครอบคลุม |
| Excel rule | ยืนยันว่า Excel เดิมนับวันแบบ inclusive หรือมี rule เฉพาะอื่น |
| 360-day breakdown | ยืนยันว่า Excel เดิมใช้ 1 ปี = 360 วัน, 1 เดือน = 30 วัน |

## เกณฑ์ผ่าน Phase 0

Phase 0 ผ่านเมื่อ:

- ทุก master data row มี legal/source reference
- ไม่มี row สตูลแบบทั้งจังหวัด
- ไม่มีช่วงเวลาซ้อนที่ทำให้ lookup ไม่ deterministic
- มี UAT cases อย่างน้อย 10 รายการ และ HR ยืนยัน expected output
- `node scripts/validate-multiplier-phase0.mjs` ได้ 12/12 exit 0
- HR owner, product owner, technical owner sign off ใน `docs/multiplier_phase0_validation_pack.md`

## หลัง HR ส่งข้อมูลกลับ

ทีมพัฒนาจะทำต่อ:

1. วางไฟล์ xlsx ที่กรอกแล้วทับ `docs/multiplier_phase0_hr_workbook.xlsx` (หรือระบุ path อื่น)
2. `python scripts/sync-multiplier-phase0-from-xlsx.py` → อัปเดต CSV
3. `node scripts/validate-multiplier-phase0.mjs` → ต้อง 12/12 บนข้อมูลจริง
4. `node scripts/uat-multiplier-live-api.mjs` → ต้อง 10/10 กับ expected จาก Excel
5. อัปเดต `docs/multiplier_phase0_validation_pack.md` + Sign-Off เป็น approve
6. อัปเดต production seed / `tidb-init` ตาม ADR-0002 (ห้ามใช้ TEST_SEED)
7. ปิด GitHub issue #23 เมื่อ director package พร้อม
