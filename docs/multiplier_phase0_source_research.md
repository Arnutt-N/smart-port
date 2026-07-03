# Phase 0 Source Research Notes — การนับทวีคูณ

สถานะ: `research notes only`

เอกสารนี้บันทึก source candidates และช่องว่างข้อมูลสำหรับ GitHub issue #18: Validate multiplier master data and UAT fixtures

## Current Finding

ยังไม่พบเอกสารราชการออนไลน์ที่ยืนยัน master data ครบพอสำหรับ production seed โดยตรง

ข้อมูลใน `docs/multiplier_seed_data_mockup.sql` และ `docs/multiplier_phase0_validation_pack.md` จึงยังเป็น mockup/checklist เท่านั้น ห้ามใช้เป็น final seed จนกว่า HR/source owner จะยืนยันเอกสารอ้างอิง

## Official Source Candidates To Query

| Source | Purpose | URL | Query terms | Output needed |
|--------|---------|-----|-------------|---------------|
| สำนักเลขาธิการคณะรัฐมนตรี | ค้นมติ ครม. ที่กำหนดพื้นที่/ช่วงเวลาหรือหลักการนับทวีคูณ | https://www.soc.go.th/ | `นับเวลาราชการเป็นทวีคูณ`, `กฎอัยการศึก`, `จังหวัดชายแดนภาคใต้`, `สตูล`, `สงขลา` | เลขที่/วันที่มติ, พื้นที่, วันที่เริ่ม/สิ้นสุด |
| ระบบค้นหามติคณะรัฐมนตรี | ค้นมติ ครม. แบบเจาะจง | https://resolution.soc.go.th/ | Same as above | PDF/record ของมติที่อ้างอิงได้ |
| ราชกิจจานุเบกษา | ค้นประกาศ/พระราชกำหนด/ประกาศสถานการณ์ฉุกเฉิน | https://ratchakitcha.soc.go.th/ | `สถานการณ์ฉุกเฉิน`, `กฎอัยการศึก`, `ปัตตานี`, `ยะลา`, `นราธิวาส`, `สตูล`, `สงขลา` | เล่ม/ตอน/หน้า, วันที่ประกาศ, text/PDF |
| ก.พ./สำนักงาน ก.พ. | ค้นหนังสือเวียนหรือหลักเกณฑ์การนับเวลาราชการ | https://www.ocsc.go.th/ | `นับเวลาราชการเป็นทวีคูณ`, `พื้นที่พิเศษ`, `จังหวัดชายแดนภาคใต้` | หนังสือเวียน/แนวปฏิบัติ |
| HR internal Excel/current workflow | Source of truth สำหรับ UAT expected output | Internal | workbook ที่ใช้อยู่จริง | expected eligible/effective/bonus/net values |

## Secondary Clues Only

แหล่งรองอาจช่วยหาคำค้นหรือวันที่ตั้งต้น แต่ห้ามใช้แทน official source:

- แหล่งรองระบุว่ากฎอัยการศึกเกี่ยวกับภาคใต้เริ่มถูกประกาศในปัตตานี ยะลา นราธิวาส เมื่อปี 2004 และมีบางอำเภอของสงขลาในปี 2005
- ข้อมูลนี้ยังไม่ยืนยันสิทธิ์ "การนับเวลาราชการเป็นทวีคูณ" และยังไม่ยืนยันช่วงวันที่ PRD ใช้ ต้องตรวจจากมติ/ประกาศ/หนังสือเวียนจริง

## Questions For HR / Source Owner

1. เอกสารหลักที่ใช้ใน Excel เดิมคืออะไร: มติ ครม., หนังสือเวียน ก.พ., ประกาศจังหวัด, หรือคู่มือภายใน?
2. วันที่ `2004-01-26` ถึง `2004-09-30` มาจากเอกสารใด?
3. สตูล 4 อำเภอคืออำเภอใดบ้าง และมาจากเอกสารใด?
4. สงขลามีอำเภอใดบ้างใน scope final?
5. ช่วง พ.ร.ก.ฉุกเฉินหลังปี 2548 ใช้ start/end ใด และครอบคลุมพื้นที่ใด?
6. Excel เดิมคิดวันแบบ inclusive หรือมี rule เฉพาะเรื่องวันเริ่ม/สิ้นสุดหรือไม่?
7. Net breakdown ใช้ 360-day year / 30-day month ตรงกับ Excel เดิมหรือไม่?

## Phase 0 Evidence Acceptance Rule

ก่อนย้ายข้อมูลเข้า migration จริง ทุก master data row ต้องมี:

- `legal_reference`: ชื่อเอกสาร/มติ/ประกาศ/หนังสือเวียนที่ตรวจสอบย้อนกลับได้
- `source_reference`: path/link/เลขหน้า หรือไฟล์ภายในที่ HR ยืนยัน
- `verified_by`
- `verified_date`
- UAT case อย่างน้อย 1 case ที่ใช้พื้นที่/ช่วงนั้น หรือเหตุผลที่ไม่มี case จริง

## Related Files

- `docs/multiplier_phase0_validation_pack.md`
- `docs/multiplier_seed_data_mockup.sql`
- `.claude/PRPs/prds/multiplier-time-counting.prd.md`
- GitHub issue #18: https://github.com/Arnutt-N/smart-port/issues/18
