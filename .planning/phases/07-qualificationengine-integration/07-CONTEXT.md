# Phase 7: QualificationEngine Integration - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

ขยาย QualificationEngine.php ให้รวมข้อมูลจาก 3 ตาราง (supportive_experience, diverse_experience, position_equivalence) เข้าคำนวณ qualification_date แล้วอัปเดต CandidateListsPage.vue ให้แสดงผลใหม่ ไม่เปลี่ยนโครงสร้าง API หรือ routing — แก้ SQL query ภายใน engine กับเพิ่มคอลัมน์ใน UI เท่านั้น

</domain>

<decisions>
## Implementation Decisions

### สูตรคำนวณ qualification_date
- **D-01:** `qualification_date = current_level_start_date + min_years - supportive_effective_days - equivalence_approved_days` — ลบวันเกื้อกูล+เทียบตำแหน่ง = ครบเกณฑ์เร็วขึ้น
- **D-02:** คำนวณใน SQL ด้วย `DATE_SUB(DATE_ADD(...), INTERVAL total_extra_days DAY)` — ใช้ subquery รวม SUM(effective_days) + SUM(approved_total_days) เป็น total_extra_days
- **D-03:** ถ้าไม่มีข้อมูล supportive/equivalence สำหรับคนนั้น → ใช้ 0 (COALESCE) — ผลลัพธ์เดิมไม่เปลี่ยน (regression safety)
- **D-04:** ต้อง aggregate per personnel_id เพราะคนหนึ่งอาจมีหลาย record → `SUM(effective_days)` group by personnel_id

### เงื่อนไข Diverse Experience (การนับแตกต่าง)
- **D-05:** สำหรับ M1 (อำนวยการต้น) — ต้องมี diverse_experience record ที่ diff_count >= 3 จึงจะผ่านเกณฑ์
- **D-06:** ถ้า diverse record ≥3 ต่าง → แสดง status badge "ผ่านเกณฑ์ 3 ต่าง" (สีเขียว)
- **D-07:** ถ้า diverse record <3 ต่าง หรือไม่มี record → แสดง flag "ยังไม่ครบ 3 ต่าง" (สีส้ม) — ไม่ block แต่เตือน
- **D-08:** เงื่อนไข 3 ต่างใช้เฉพาะ target_level_code = 'M1' เท่านั้น — ระดับอื่นไม่ต้องเช็ค

### เงื่อนไข Position Equivalence (การเทียบตำแหน่ง)
- **D-09:** เฉพาะ record ที่ approval_status = 'APPROVED' เท่านั้นที่นำมารวม — ตรงกับ success criteria #4
- **D-10:** ใช้สำหรับ cross-type promotions เช่น K4 → S1 — ตรวจจาก promotion_criteria.requires_equiv_years
- **D-11:** `approved_total_days` จากทุก APPROVED records ของคนนั้น SUM เข้าเป็น equivalence_days

### การแสดงผลใน Candidate List UI
- **D-12:** เพิ่ม 3 คอลัมน์ใหม่ในตาราง candidate list: "วันเกื้อกูล" (supportive_days), "สถานะ 3 ต่าง" (diverse badge — M1 เท่านั้น), "วันเทียบ ตน." (equivalence_days)
- **D-13:** คอลัมน์ supportive_days แสดงเป็นตัวเลข (เช่น "120 วัน") หรือ "-" ถ้าไม่มี
- **D-14:** คอลัมน์ equivalence_days แสดงเป็นตัวเลข หรือ "-" ถ้าไม่มี
- **D-15:** qualification_date ที่แสดง = ค่าที่คำนวณแล้ว (รวม supportive + equivalence) — ไม่แสดงค่าเดิม

### Regression Safety
- **D-16:** ถ้าบุคลากรไม่มี supportive/diverse/equivalence data → ผลลัพธ์ต้องเหมือนเดิมทุกประการ (qualification_date, remaining_days, status ไม่เปลี่ยน)
- **D-17:** ทดสอบ regression: query engine สำหรับ K2/K3 (ที่ไม่มี data ใหม่) → ผลต้องตรงกับก่อนแก้

### Claude's Discretion
- วิธี JOIN subquery (LEFT JOIN vs correlated subquery vs CTE)
- ลำดับคอลัมน์ใหม่ในตาราง UI
- การ cache/optimize query ถ้าช้า
- Detail view (computeDetail) — ควรแสดงรายละเอียดเกื้อกูล/แตกต่าง/เทียบตำแหน่งด้วย

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### QualificationEngine (PRIMARY — แก้ไขไฟล์นี้)
- `backend/QualificationEngine.php` — computeForLevel() และ computeDetail() — SQL query ที่ต้องแก้ไข

### Database schema (ข้อมูลที่ต้อง JOIN)
- `database/04-career-path.sql` — ตาราง supportive_experience, diverse_experience, position_equivalence, promotion_criteria
- `database/08-career-path-v11.sql` — ratio_percent, GENERATED diff_count

### Backend APIs (ข้อมูลที่ engine ส่งกลับ)
- `backend/routes/candidates.php` — route handler ที่เรียก engine
- `backend/helpers.php` — formatThaiDate, getLevelName

### Frontend (UI ที่ต้องอัปเดต)
- `frontend/src/pages/CandidateListsPage.vue` — ตาราง candidate list ที่ต้องเพิ่มคอลัมน์
- `frontend/src/composables/useCandidates.js` — composable ที่เรียก API

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `QualificationEngine.php` — computeForLevel() ใช้ LEFT JOIN promotion_criteria แล้ว DATE_ADD — ต้องเพิ่ม subquery สำหรับ supportive/equivalence
- `StatusBadge.vue` — มี DIFF_PASS/DIFF_NOT_YET keys แล้ว (จาก Phase 6)
- `formatThaiDate()` — ใช้แปลง qualification_date ที่คำนวณใหม่

### Established Patterns
- Engine ใช้ SQL subquery/JOIN ไม่ใช้ PHP loop — ต้องเพิ่ม supportive/equivalence เป็น LEFT JOIN subquery
- Response format: `{ success, data, summary, pagination }` — ไม่เปลี่ยน
- Summary counts: qualified/not_yet/check_data — อาจเพิ่ม diverse_warning count สำหรับ M1

### Integration Points
- `computeForLevel()` — SELECT clause ต้องเพิ่ม supportive_days, equivalence_days, diverse_status
- `computeDetail()` — ต้องเพิ่มข้อมูลเดียวกัน + อาจแสดงรายละเอียดแต่ละ record
- `CandidateListsPage.vue` — เพิ่ม `<th>` และ `<td>` สำหรับ 3 คอลัมน์ใหม่

</code_context>

<deferred>
## Deferred Ideas

- Detailed breakdown per candidate (drill-down view) — v2 requirement DV-01
- ประเภทอำนวยการ full implementation (M1, M2 combination groups) — v2 requirement AC-01
- ประเภทบริหาร full implementation (S1, S2 complex equivalence) — v2 requirement AC-02
- Performance optimization (materialized view / cache) — defer ถ้า query ไม่ช้า

</deferred>

---

*Phase: 07-qualificationengine-integration*
*Context gathered: 2026-03-23*
