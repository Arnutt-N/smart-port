# Requirements: Smart Port — Candidate List & Probation Tracking

**Defined:** 2026-03-22
**Core Value:** HR สามารถดูบัญชีผู้มีคุณสมบัติเลื่อนระดับได้แบบ real-time พร้อมคำนวณวันครบเกณฑ์อัตโนมัติ และติดตามสถานะทดลองปฏิบัติราชการได้ทันท่วงที

## v1 Requirements

### Database Foundation

- [x] **DB-01**: MySQL schema for career path tables converted from gap_analysis_career_path_v2.sql (promotion_criteria, qualification_calculation, diverse_experience, supportive_experience, position_equivalence, screening_list, promotion_evaluation, supportive_job_series, rotation_assignment, promotion_required_training, professional_license)
- [x] **DB-02**: MySQL schema for probation tracking tables converted from probation_tracking_schema.sql (probation_program, probation_task_template, probation_enrollment, probation_stakeholder, probation_task_progress, elearning_course, elearning_enrollment, probation_evaluation, probation_committee, probation_committee_member)
- [x] **DB-03**: ALTER TABLE personnel to add current_level_start_date and current_level_code columns
- [x] **DB-04**: ALTER TABLE personnel to add probation_end_date column
- [x] **DB-05**: Seed data for promotion_criteria — rules for O1→O2, O2→O3 (ประเภททั่วไป) and K1→K2, K2→K3, K3→K4 (ประเภทวิชาการ) with education-dependent year thresholds
- [x] **DB-06**: Dashboard view vw_probation_dashboard converted to MySQL syntax
- [x] **DB-07**: Views vw_job_series_tenure and vw_executive_tenure converted to MySQL syntax

### Candidate List — Backend

- [x] **CL-01**: Qualification calculation engine (QualificationEngine.php) that computes qualification status from promotion_criteria + personnel tenure + education level
- [x] **CL-02**: API endpoint GET /candidates/:targetLevel — returns list of personnel with computed qualification status for a target level (e.g., K2, K3, O2, O3, K4)
- [x] **CL-03**: API endpoint GET /candidates/:targetLevel/:personnelId — returns detailed qualification breakdown for one person
- [x] **CL-04**: Qualification status computation: remaining_days, qualification_date, status (ถึงเกณฑ์นานแล้ว / ยังไม่ถึงเกณฑ์ / Check Data)
- [x] **CL-05**: Education-aware calculation — K1→K2 requires 6 years (ป.ตรี), 4 years (ป.โท), 2 years (ป.เอก)

### Candidate List — Frontend

- [x] **CL-06**: Candidate List page with 4 main tabs: ประเภททั่วไป, ประเภทวิชาการ, ประเภทอำนวยการ (pending), ประเภทบริหาร (pending)
- [ ] **CL-07**: Sub-tabs within ประเภททั่วไป: ปฏิบัติงาน→ชำนาญงาน (O1→O2), ชำนาญงาน→อาวุโส (O2→O3)
- [ ] **CL-08**: Sub-tabs within ประเภทวิชาการ: ปฏิบัติการ→ชำนาญการ (K1→K2), ชำนาญการ→ชำนาญการพิเศษ (K2→K3), ชำนาญการพิเศษ→เชี่ยวชาญ (K3→K4)
- [ ] **CL-09**: ประเภทอำนวยการ and ประเภทบริหาร tabs show "อยู่ระหว่างพัฒนา" placeholder
- [ ] **CL-10**: Stat cards per sub-tab: ทั้งหมดในบัญชี, มีสิทธิ์ (ถึงเกณฑ์), ยังไม่ถึงเกณฑ์
- [ ] **CL-11**: Table columns: ลำดับ, ชื่อ-สกุล, ตำแหน่งปัจจุบัน, ระดับ, วันเข้าสู่ระดับปัจจุบัน, วันครบกำหนด, วันคงเหลือ, สถานะ
- [x] **CL-12**: Status badges: green (ถึงเกณฑ์นานแล้ว), gray (ยังไม่ถึงเกณฑ์), orange (Check Data)
- [ ] **CL-13**: Search/filter by name and position
- [ ] **CL-14**: Connect to backend API (replace mock data with live data)

### Probation Tracking — Backend

- [x] **PT-01**: API endpoint GET /probation — returns list of probation enrollments with remaining days
- [x] **PT-02**: API endpoint GET /probation/:enrollmentId — returns detailed probation info (stakeholders, tasks)
- [x] **PT-03**: API endpoint POST /probation — create new enrollment
- [x] **PT-04**: API endpoint PUT /probation/:enrollmentId — update enrollment status
- [x] **PT-05**: Remaining days computed dynamically as DATEDIFF(end_date, CURDATE()) — not stored

### Probation Tracking — Frontend

- [ ] **PT-06**: Probation list page with stat cards: ทั้งหมด, พร้อมดำเนินการ, ใกล้ครบกำหนด, เกินกำหนด
- [ ] **PT-07**: Table columns: ลำดับ, ชื่อ-สกุล, ตำแหน่ง, หน่วยงาน, วันเริ่มทดลอง, วันครบกำหนด, วันคงเหลือ, สถานะ
- [ ] **PT-08**: Color-coded remaining days: green (>30), yellow (15-30), orange (7-14), red (<7)
- [x] **PT-09**: Status badges: IN_PROGRESS, COMPLETED, FAILED, EXTENDED
- [ ] **PT-10**: Search/filter by name, position, department
- [ ] **PT-11**: Connect to backend API (replace mock data with live data)

### Shared / Cross-cutting

- [x] **SH-01**: Thai date formatting utility — display dates in Buddhist Era (พ.ศ.) format
- [x] **SH-02**: Thai level code to name mapping utility (O1→ปฏิบัติงาน, K2→ชำนาญการ, etc.)
- [x] **SH-03**: Pinia store or composable for candidate list API calls
- [x] **SH-04**: Pinia store or composable for probation API calls

## v2 Requirements

### Detail Views & Enhancements

- **DV-01**: Drill-down view per candidate showing full qualification breakdown (tenure days, education, supportive days, qualification date)
- **DV-02**: Probation task checklist per enrollment (training, e-learning, assessments)
- **DV-03**: Probation stakeholder display (mentor, supervisor, director)
- **DV-04**: Supportive experience (เกื้อกูล) calculation integrated into qualification engine
- **DV-05**: Batch recalculation endpoint for all qualification statuses
- **DV-06**: CSV export for candidate list and probation list

### Advanced Categories

- **AC-01**: ประเภทอำนวยการ full implementation (M1, M2) with screening list, diverse experience (3 ต่าง), combination rules
- **AC-02**: ประเภทบริหาร full implementation (S1, S2) with position equivalence, complex combination groups

### Notifications & Reports

- **NR-01**: Email notifications at 30/15/7 day thresholds for probation
- **NR-02**: PDF report generation with Thai fonts for committee meetings
- **NR-03**: Probation evaluation forms (multi-evaluator scoring workflow)

## Out of Scope

| Feature | Reason |
|---------|--------|
| e-Learning API integration with ก.พ. | ก.พ. e-Learning is a separate platform with no documented API |
| Approval workflow for promotions | Promotion approval involves committees and physical signatures — separate project |
| Mobile-responsive optimization | Desktop-focused, current Tailwind provides basic responsiveness |
| Multi-organization support | Schema and rules specific to สำนักงานปลัดกระทรวงยุติธรรม |
| Real-time chat/collaboration | Not relevant to HR workflow |
| Data migration from existing Excel | One-time effort, handled separately |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | Phase 1 | Complete |
| DB-02 | Phase 1 | Complete |
| DB-03 | Phase 1 | Complete |
| DB-04 | Phase 1 | Complete |
| DB-05 | Phase 1 | Complete |
| DB-06 | Phase 1 | Complete |
| DB-07 | Phase 1 | Complete |
| CL-01 | Phase 2 | Complete |
| CL-02 | Phase 2 | Complete |
| CL-03 | Phase 2 | Complete |
| CL-04 | Phase 2 | Complete |
| CL-05 | Phase 2 | Complete |
| CL-06 | Phase 3 | Complete |
| CL-07 | Phase 3 | Pending |
| CL-08 | Phase 3 | Pending |
| CL-09 | Phase 3 | Pending |
| CL-10 | Phase 3 | Pending |
| CL-11 | Phase 3 | Pending |
| CL-12 | Phase 3 | Complete |
| CL-13 | Phase 3 | Pending |
| CL-14 | Phase 3 | Pending |
| PT-01 | Phase 2 | Complete |
| PT-02 | Phase 2 | Complete |
| PT-03 | Phase 2 | Complete |
| PT-04 | Phase 2 | Complete |
| PT-05 | Phase 2 | Complete |
| PT-06 | Phase 3 | Pending |
| PT-07 | Phase 3 | Pending |
| PT-08 | Phase 3 | Pending |
| PT-09 | Phase 3 | Complete |
| PT-10 | Phase 3 | Pending |
| PT-11 | Phase 3 | Pending |
| SH-01 | Phase 2 | Complete |
| SH-02 | Phase 2 | Complete |
| SH-03 | Phase 3 | Complete |
| SH-04 | Phase 3 | Complete |

**Coverage:**
- v1 requirements: 36 total
- Mapped to phases: 36
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after initial definition*
