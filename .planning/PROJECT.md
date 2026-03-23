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
- ✓ Backend API endpoints for candidate list queries (GET /candidates/:targetLevel with qualification engine) — Validated in Phase 02: backend-apis
- ✓ Backend API endpoints for probation tracking CRUD (GET/POST/PUT /probation) — Validated in Phase 02: backend-apis
- ✓ Qualification engine with education-aware rules (QualificationEngine.php) — Validated in Phase 02: backend-apis
- ✓ Shared Thai date formatting (Buddhist Era) and level code mapping helpers — Validated in Phase 02: backend-apis

### Active — v1.1 การนับเวลาเพิ่มเติม

- [ ] เมนูการนับเกื้อกูล (supportive experience) — CRUD + seed supportive_job_series mapping
- [ ] เมนูการนับแตกต่าง (diverse experience / 3 ต่าง) — CRUD + diff_count tracking
- [ ] เมนูการเทียบตำแหน่ง (position equivalence) — CRUD + approval workflow
- [ ] ขยาย QualificationEngine ให้รวม supportive/diverse/equivalence เข้าคำนวณ qualification_date
- [ ] Candidate List แสดงผลการคำนวณที่รวมข้อมูลเพิ่มเติมแล้ว

### Recently Validated (v1.0)
- ✓ Candidate List page with 5 section tabs (overview, ทั่วไป, วิชาการ, อำนวยการ placeholder, บริหาร placeholder) — v1.0
- ✓ Candidate List overview dashboard with Promise.allSettled aggregation, search, pagination — v1.0
- ✓ Probation tracking page with computed status (ยังไม่ครบกำหนด/ใกล้ครบกำหนด/พร้อมพ้นทดลอง/เกินกำหนด/กำลังดำเนินการ) — v1.0
- ✓ Shared composables (useCandidates, useProbation, useRemainingDays), StatusBadge extensions, PaginationBar — v1.0


### Out of Scope

- ประเภทอำนวยการ full implementation — Phase 2+ (M1, M2 levels with screening list requirements)
- ประเภทบริหาร full implementation — Phase 2+ (S1, S2 levels with complex equivalence rules)
- e-Learning integration — separate system (ก.พ.)
- Notification/email alerts — Phase 2+
- Report generation/PDF export — Phase 2+
- Mobile responsive optimization beyond current — Phase 2+

## Current State (v1.1 Milestone Complete 2026-03-23)

- **LOC**: ~7,500 (Vue/JS ~4,600 + PHP ~2,000 + SQL 849)
- **Database**: 42 tables, 4 views in MySQL 8.0 — v1.1 migration adds ratio_percent + GENERATED diff_count + 14 seed rows
- **API**: QualificationEngine (with supportive/diverse/equivalence integration) + Probation CRUD + 3 new CRUD APIs
- **Frontend**: Vue 3 SPA with candidate list (12 columns including 3 new), probation page, 3 CRUD pages
- **UAT**: Phase 01 (3/3 passed), Phase 03 (5/5 passed)
- **v1.1 Complete**: All 4 phases done — DB prep, backend CRUDs, frontend pages, engine integration

## Context

- Database schema references: `docs/gap_analysis_career_path_v2.sql` (PostgreSQL) and `docs/probation_tracking_schema.sql` (PostgreSQL) — converted to MySQL 8.0
- Career path rules from `docs/documents/ops-carrer-path.pdf` (86 pages) and `docs/documents/career 2569.03.21 master-prep.xlsx`
- Legal references: กฎ ก.พ. ว่าด้วยการทดลองปฏิบัติหน้าที่ราชการ พ.ศ. 2553, นร 1006/ว5, นร 1006/ว3, นร 1006/ว17
- Level code mapping: O1=ปฏิบัติงาน, O2=ชำนาญงาน, O3=อาวุโส, K1=ปฏิบัติการ, K2=ชำนาญการ, K3=ชำนาญการพิเศษ, K4=เชี่ยวชาญ, K5=ทรงคุณวุฒิ, M1=อำนวยการต้น, M2=อำนวยการสูง, S1=บริหารต้น, S2=บริหารสูง
- Existing CandidateListsPage.vue and ProbationEndPage.vue have UI structure but use mock/hardcoded data
- Backend now provides REST endpoints for candidate list queries and probation CRUD (Phase 02 complete)

## Constraints

- **Tech stack**: Must use existing stack — Vue 3/Vite/Tailwind frontend, PHP backend, MySQL 8.0
- **Database**: Must convert PostgreSQL schemas to MySQL syntax (BIGSERIAL→BIGINT AUTO_INCREMENT, etc.)
- **Language**: All UI in Thai (ภาษาไทย)
- **Auth**: Existing JWT flow must be maintained
- **Docker**: Must work within existing docker-compose setup

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 4 tabs by position type (ประเภท) | User preference — maps to Thai civil service categories | ✓ Good |
| MySQL instead of PostgreSQL | Existing stack uses MySQL 8.0 | ✓ Good |
| Phase 1: ทั่วไป + วิชาการ only | Most common promotion paths, อำนวยการ/บริหาร are more complex | ✓ Good |
| Color-coded probation days | Visual urgency indicator based on remaining days | ✓ Good |
| Computed probation status | Status derived from remaining_days + backend status, not hardcoded | ✓ Good |
| SET NAMES utf8mb4 in SQL init | Prevents double-encoding of Thai text in MySQL Docker init | ✓ Good |
| Case-insensitive auth header | Vite proxy lowercases headers; backend must handle both cases | ✓ Good |
| Thai IME composition guard | compositionstart/end events prevent debounce bypass | ✓ Good |

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

## Current Milestone: v1.1 การนับเวลาเพิ่มเติม

**Goal:** เพิ่มเมนูบันทึกข้อมูลการนับเกื้อกูล การนับแตกต่าง และการเทียบตำแหน่ง แล้วนำไปรวมคำนวณวันครบกำหนดเลื่อนระดับใน Candidate List

**Target features:**
- เมนูการนับเวลาเพิ่มเติม (3 sub-menus: เกื้อกูล, แตกต่าง, เทียบตำแหน่ง)
- Backend CRUD APIs สำหรับทั้ง 3 ประเภท
- ขยาย QualificationEngine ให้รวม supportive/diverse/equivalence days
- Seed data สำหรับ supportive_job_series mapping

---
*Last updated: 2026-03-23 after v1.1 milestone complete (Phase 07 qualificationengine-integration)*
