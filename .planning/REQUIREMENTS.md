# Requirements: Smart Port — การนับเวลาเพิ่มเติม

**Defined:** 2026-03-22
**Core Value:** HR สามารถบันทึกข้อมูลการนับเกื้อกูล การนับแตกต่าง และการเทียบตำแหน่ง แล้วนำไปรวมคำนวณวันครบกำหนดเลื่อนระดับใน Candidate List ได้อัตโนมัติ

## v1.1 Requirements

### การนับเกื้อกูล (Supportive Experience)

- [ ] **SE-01**: Seed data สำหรับ supportive_job_series mapping (สายงานไหนเกื้อกูลกัน + อัตราลดทอน)
- [x] **SE-02**: API CRUD endpoints สำหรับ supportive_experience (GET list, POST create, PUT update, DELETE)
- [x] **SE-03**: หน้าการนับเกื้อกูล แสดงรายการ + ฟอร์มบันทึกวันเกื้อกูลต่อบุคคล
- [x] **SE-04**: คำนวณ effective_days = total_days × ratio จาก supportive_job_series mapping

### การนับแตกต่าง (Diverse Experience)

- [x] **DE-01**: API CRUD endpoints สำหรับ diverse_experience (GET list, POST create, PUT update, DELETE)
- [x] **DE-02**: หน้าการนับแตกต่าง แสดงรายการ 4 มิติ (สายงาน/หน่วยงาน/พื้นที่/ลักษณะงาน) + ฟอร์มบันทึก
- [x] **DE-03**: คำนวณ diff_count อัตโนมัติ + qualified_date เมื่อ ≥3 ต่าง

### การเทียบตำแหน่ง (Position Equivalence)

- [x] **PE-01**: API CRUD endpoints สำหรับ position_equivalence (GET list, POST request, PUT approve/reject)
- [x] **PE-02**: หน้าการเทียบตำแหน่ง แสดงรายการ + ฟอร์มยื่นคำขอ + สถานะอนุมัติ
- [x] **PE-03**: คำนวณ approved_total_days จาก approved records เท่านั้น

### QualificationEngine Integration

- [x] **QE-01**: ขยาย QualificationEngine ให้รวม supportive effective_days เข้า qualification_date
- [x] **QE-02**: ขยาย QualificationEngine ให้เช็ค diverse_experience ≥3 ต่าง สำหรับ M1
- [x] **QE-03**: ขยาย QualificationEngine ให้รวม position_equivalence approved_days สำหรับ cross-type promotions
- [ ] **QE-04**: Candidate List แสดงผลการคำนวณที่รวมข้อมูลเพิ่มเติมแล้ว

## v2 Requirements

### Detail Views & Enhancements (deferred from v1.0)

- **DV-01**: Drill-down view per candidate showing full qualification breakdown
- **DV-02**: Probation task checklist per enrollment
- **DV-03**: CSV export for candidate list and probation list

### Advanced Categories (deferred from v1.0)

- **AC-01**: ประเภทอำนวยการ full implementation (M1, M2) with screening list + combination rules
- **AC-02**: ประเภทบริหาร full implementation (S1, S2) with position equivalence + complex combination groups

## Out of Scope

| Feature | Reason |
|---------|--------|
| RBAC / role-based approval | v1.1 ใช้ JWT auth เดิม (any authenticated user = admin) |
| e-Learning integration | ระบบ ก.พ. แยกต่างหาก ไม่มี API |
| Notification/email alerts | Defer to v2 |
| PDF report generation | Defer to v2 |
| Mobile responsive optimization | Defer to v2 |
| supportive_job_series extraction from PDF | Manual seed — ไม่ parse PDF อัตโนมัติ |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SE-01 | Phase 4 | Pending |
| SE-02 | Phase 5 | Complete |
| SE-03 | Phase 6 | Complete |
| SE-04 | Phase 5 | Complete |
| DE-01 | Phase 5 | Complete |
| DE-02 | Phase 6 | Complete |
| DE-03 | Phase 5 | Complete |
| PE-01 | Phase 5 | Complete |
| PE-02 | Phase 6 | Complete |
| PE-03 | Phase 5 | Complete |
| QE-01 | Phase 7 | Complete |
| QE-02 | Phase 7 | Complete |
| QE-03 | Phase 7 | Complete |
| QE-04 | Phase 7 | Pending |

**Coverage:**
- v1.1 requirements: 14 total
- Mapped to phases: 14/14
- Unmapped: 0

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after roadmap creation*
