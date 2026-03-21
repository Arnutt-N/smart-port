# Smart Port — Candidate List & Probation Tracking

## What This Is

ระบบบัญชีรายชื่อผู้มีคุณสมบัติเลื่อนระดับ (Candidate List) และระบบติดตามพ้นทดลองปฏิบัติราชการ (Probation Tracking) สำหรับสำนักงานปลัดกระทรวงยุติธรรม เป็นส่วนขยายของระบบ Smart Port (HRIS) ที่มีอยู่ ใช้งานโดย HR และผู้บริหารเพื่อติดตามความก้าวหน้าในสายอาชีพของข้าราชการ

## Core Value

HR สามารถดูบัญชีผู้มีคุณสมบัติเลื่อนระดับได้แบบ real-time พร้อมคำนวณวันครบเกณฑ์อัตโนมัติ และติดตามสถานะทดลองปฏิบัติราชการของข้าราชการบรรจุใหม่ได้ทันท่วงที

## Requirements

### Validated

- ✓ Authentication (JWT login/logout) — existing
- ✓ Dashboard with stat cards — existing
- ✓ Vue 3 + Vite + Tailwind CSS 4 frontend — existing
- ✓ PHP REST API backend with MySQL 8.0 — existing
- ✓ Docker Compose setup — existing
- ✓ Sidebar navigation with menu structure — existing
- ✓ MySQL schema for career path / candidate list tables — Validated in Phase 01: database-foundation
- ✓ MySQL schema for probation tracking tables — Validated in Phase 01: database-foundation
- ✓ Seed data for promotion_criteria (K-series + O-series) — Validated in Phase 01: database-foundation

### Active
- [ ] Candidate List page with 4 tabs:
  - Tab 1: ประเภททั่วไป (General) — ปฏิบัติงาน→ชำนาญงาน, ชำนาญงาน→อาวุโส
  - Tab 2: ประเภทวิชาการ (Academic) — ปฏิบัติการ→ชำนาญการ, ชำนาญการ→ชำนาญการพิเศษ, ชำนาญการพิเศษ→เชี่ยวชาญ
  - Tab 3: ประเภทอำนวยการ (Management) — pending/อยู่ระหว่างพัฒนา
  - Tab 4: ประเภทบริหาร (Executive) — pending/อยู่ระหว่างพัฒนา
- [ ] Candidate List calculates qualification status from promotion_criteria + qualification_calculation tables
- [ ] Probation End page with real database integration (probation_enrollment + related tables)
- [ ] Probation page with color-coded remaining days (green >30, yellow 15-30, orange 7-14, red <7)
- [ ] Backend API endpoints for candidate list CRUD
- [ ] Backend API endpoints for probation tracking CRUD


### Out of Scope

- ประเภทอำนวยการ full implementation — Phase 2+ (M1, M2 levels with screening list requirements)
- ประเภทบริหาร full implementation — Phase 2+ (S1, S2 levels with complex equivalence rules)
- e-Learning integration — separate system (ก.พ.)
- Notification/email alerts — Phase 2+
- Report generation/PDF export — Phase 2+
- Mobile responsive optimization beyond current — Phase 2+

## Context

- Database schema references: `docs/gap_analysis_career_path_v2.sql` (PostgreSQL) and `docs/probation_tracking_schema.sql` (PostgreSQL) — must convert to MySQL 8.0 syntax
- Career path rules from `docs/documents/ops-carrer-path.pdf` (86 pages) and `docs/documents/career 2569.03.21 master-prep.xlsx`
- Legal references: กฎ ก.พ. ว่าด้วยการทดลองปฏิบัติหน้าที่ราชการ พ.ศ. 2553, นร 1006/ว5, นร 1006/ว3, นร 1006/ว17
- Level code mapping: O1=ปฏิบัติงาน, O2=ชำนาญงาน, O3=อาวุโส, K1=ปฏิบัติการ, K2=ชำนาญการ, K3=ชำนาญการพิเศษ, K4=เชี่ยวชาญ, K5=ทรงคุณวุฒิ, M1=อำนวยการต้น, M2=อำนวยการสูง, S1=บริหารต้น, S2=บริหารสูง
- Existing CandidateListsPage.vue and ProbationEndPage.vue have UI structure but use mock/hardcoded data
- Backend has no endpoints for these features yet

## Constraints

- **Tech stack**: Must use existing stack — Vue 3/Vite/Tailwind frontend, PHP backend, MySQL 8.0
- **Database**: Must convert PostgreSQL schemas to MySQL syntax (BIGSERIAL→BIGINT AUTO_INCREMENT, etc.)
- **Language**: All UI in Thai (ภาษาไทย)
- **Auth**: Existing JWT flow must be maintained
- **Docker**: Must work within existing docker-compose setup

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 4 tabs by position type (ประเภท) | User preference — maps to Thai civil service categories | — Pending |
| MySQL instead of PostgreSQL | Existing stack uses MySQL 8.0 | — Pending |
| Phase 1: ทั่วไป + วิชาการ only | Most common promotion paths, อำนวยการ/บริหาร are more complex | — Pending |
| Color-coded probation days | Visual urgency indicator (green/yellow/orange/red) | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-22 after Phase 01 completion — database foundation complete*
