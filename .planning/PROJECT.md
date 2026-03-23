# Smart Port — Candidate List & Probation Tracking

## What This Is

ระบบบัญชีรายชื่อผู้มีคุณสมบัติเลื่อนระดับ (Candidate List) และระบบติดตามพ้นทดลองปฏิบัติราชการ (Probation Tracking) สำหรับสำนักงานปลัดกระทรวงยุติธรรม เป็นส่วนขยายของระบบ Smart Port (HRIS) ที่มีอยู่ ใช้งานโดย HR และผู้บริหารเพื่อติดตามความก้าวหน้าในสายอาชีพของข้าราชการ รองรับการนับเวลาเกื้อกูล การนับแตกต่าง และการเทียบตำแหน่ง พร้อมคำนวณวันครบเกณฑ์เลื่อนระดับอัตโนมัติ

## Core Value

HR สามารถดูบัญชีผู้มีคุณสมบัติเลื่อนระดับได้แบบ real-time พร้อมคำนวณวันครบเกณฑ์อัตโนมัติ (รวมวันเกื้อกูล/เทียบตำแหน่ง) และติดตามสถานะทดลองปฏิบัติราชการของข้าราชการบรรจุใหม่ได้ทันท่วงที

## Requirements

### Validated

- ✓ Authentication (JWT login/logout) — existing
- ✓ Dashboard with stat cards — existing
- ✓ Vue 3 + Vite + Tailwind CSS 4 frontend — existing
- ✓ PHP REST API backend with MySQL 8.0 — existing
- ✓ Docker Compose setup — existing
- ✓ Sidebar navigation with menu structure — existing
- ✓ MySQL schema for career path / candidate list tables — v1.0
- ✓ MySQL schema for probation tracking tables — v1.0
- ✓ Seed data for promotion_criteria (K-series + O-series) — v1.0
- ✓ Backend API endpoints for candidate list queries — v1.0
- ✓ Backend API endpoints for probation tracking CRUD — v1.0
- ✓ Qualification engine with education-aware rules — v1.0
- ✓ Shared Thai date formatting (Buddhist Era) and level code mapping — v1.0
- ✓ Candidate List page with 5 section tabs + overview dashboard — v1.0
- ✓ Probation tracking page with computed status — v1.0
- ✓ Shared composables, StatusBadge, PaginationBar — v1.0
- ✓ Seed data for supportive_job_series (14 K-series directional mappings) — v1.1
- ✓ GENERATED diff_count column + ratio_percent column — v1.1
- ✓ Supportive experience CRUD API with ratio lookup + effective_days — v1.1
- ✓ Diverse experience CRUD API with GENERATED column handling + qualified_date — v1.1
- ✓ Position equivalence CRUD API with approval workflow — v1.1
- ✓ Supportive experience Vue page with personnel autocomplete — v1.1
- ✓ Diverse experience Vue page with 4-dimension checkboxes + live diff_count — v1.1
- ✓ Position equivalence Vue page with approve/reject workflow — v1.1
- ✓ QualificationEngine extended with supportive/diverse/equivalence integration — v1.1
- ✓ Candidate List UI with 3 new columns (วันเกื้อกูล, สถานะ 3 ต่าง, วันเทียบ ตน.) — v1.1

### Active

(No active requirements — awaiting next milestone definition)

### Out of Scope

- ประเภทอำนวยการ full implementation — v2 (M1, M2 levels with screening list + combination rules)
- ประเภทบริหาร full implementation — v2 (S1, S2 levels with complex equivalence rules)
- Drill-down view per candidate — v2 (DV-01)
- Probation task checklist per enrollment — v2 (DV-02)
- CSV export for candidate list and probation list — v2 (DV-03)
- e-Learning integration — separate system (ก.พ.)
- Notification/email alerts — v2
- Report generation/PDF export — v2
- Mobile responsive optimization — v2
- RBAC / role-based approval — v2

## Current State (v1.1 Complete 2026-03-23)

- **LOC**: ~7,500 (Vue/JS ~4,600 + PHP ~2,000 + SQL 849)
- **Database**: 42 tables, 4 views in MySQL 8.0
- **API**: 6 route handlers (candidates, probation, supportive, diverse, equivalence + dashboard)
- **Frontend**: Vue 3 SPA — 5 candidate tabs, probation page, 3 CRUD pages (supportive, diverse, equivalence)
- **Engine**: QualificationEngine with supportive/diverse/equivalence LEFT JOIN integration
- **UAT**: v1.0 (8/8), v1.1 (26/26) — all passed

## Context

- Database schema references: `docs/gap_analysis_career_path_v2.sql` (PostgreSQL) → MySQL 8.0
- Career path rules from `docs/documents/ops-carrer-path.pdf` (86 pages)
- Legal references: กฎ ก.พ. ว่าด้วยการทดลองปฏิบัติหน้าที่ราชการ พ.ศ. 2553, นร 1006/ว5, นร 1006/ว3, นร 1006/ว17
- Level codes: O1-O3 (ทั่วไป), K1-K5 (วิชาการ), M1-M2 (อำนวยการ), S1-S2 (บริหาร)

## Constraints

- **Tech stack**: Vue 3/Vite/Tailwind CSS 4 frontend, PHP 8.3 backend, MySQL 8.0
- **Language**: All UI in Thai (ภาษาไทย)
- **Auth**: JWT (HMAC-SHA256, 1-hour expiry), any authenticated user = admin
- **Docker**: docker-compose with backend, frontend, db services
- **Deployment**: Production on Render (smart-port.onrender.com)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 4 tabs by position type (ประเภท) | Maps to Thai civil service categories | ✓ Good |
| MySQL instead of PostgreSQL | Existing stack uses MySQL 8.0 | ✓ Good |
| Phase 1: ทั่วไป + วิชาการ only | Most common promotion paths | ✓ Good |
| Color-coded probation days | Visual urgency indicator | ✓ Good |
| SET NAMES utf8mb4 in SQL init | Prevents Thai text double-encoding | ✓ Good |
| Thai IME composition guard | compositionstart/end prevents debounce bypass | ✓ Good |
| DATEDIFF+1 inclusive counting | Thai HR convention for day counting | ✓ Good |
| COALESCE(...,0) regression safety | Engine returns unchanged results when no v1.1 data exists | ✓ Good |
| Modal dialogs for CRUD forms | Keeps table visible, consistent with admin UX patterns | ✓ Good |
| One-way approval state machine | PENDING→APPROVED/REJECTED, no reverse transitions | ✓ Good |
| MySQL GENERATED STORED for diff_count | Auto-compute from 4 boolean flags, no client manipulation | ✓ Good |
| LEFT JOIN derived tables in engine | Aggregate per personnel_id, no duplicate rows | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-03-23 after v1.1 milestone complete*
