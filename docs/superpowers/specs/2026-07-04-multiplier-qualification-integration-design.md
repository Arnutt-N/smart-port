# Design — Multiplier (การนับทวีคูณ) → QualificationEngine Integration (#22)

> วันที่ 2026-07-04 · branch `feat/multiplier-time-counting`
> Scope: **linear path only** (`buildBaseQuery`). Executive path (M/S) out of scope.

## 1. เป้าหมาย

ให้ `bonus_days` ที่บันทึกไว้ใน `multiplier_experience` ไปลด `qualification_date` ของบุคลากรสายตรง (target level K2/K3/K4, O2/O3) เพื่อให้ผู้ที่มีวันราชการทวีคูณ (พื้นที่พิเศษ 3 จชต. ช่วงกฎอัยการศึก 2547) ครบเกณฑ์เลื่อนระดับเร็วขึ้นตามสิทธิ

## 2. Scope

- **In scope:** `QualificationEngine::buildBaseQuery()` — linear levels K2/K3/K4, O2/O3
- **Out of scope (รอบถัดไป):** `buildExecutiveQuery()` — M1/M2, S1/S2
  - เหตุผล: executive path คำนวณ `qual_date` ผ่าน paths union (gate ระดับก่อนหน้า + tenure) ซึ่ง**แม้แต่ `supportive_days` เดิมก็ยังไม่ถูกนำไปลด** (SELECT ไว้โชว์เฉยๆ) — การรื้อ logic นั้นเสี่ยงสูงและควรทำเป็น slice แยกพร้อม test

## 3. การเปลี่ยนแปลง (แก้ `buildBaseQuery` จุดเดียว)

### 3.1 เพิ่ม aggregation subquery (เลียนแบบ pattern `sup` ทุกประการ)

```sql
LEFT JOIN (
    SELECT personnel_id, SUM(bonus_days) AS total_multiplier_days
    FROM multiplier_experience
    GROUP BY personnel_id
) mult ON mult.personnel_id = p.personnel_id
```

### 3.2 เพิ่มคอลัมน์ผลลัพธ์ (โปร่งใส/ตรวจสอบได้ เทียบมือได้)

`COALESCE(mult.total_multiplier_days, 0) AS multiplier_days`

### 3.3 เติมเข้าสูตรลดวันทั้ง 3 จุด (`qualification_date` / `remaining_days` / `status`)

```
FLOOR(COALESCE(sup..,0) + COALESCE(eq..,0))
  → FLOOR(COALESCE(sup..,0) + COALESCE(eq..,0) + COALESCE(mult.total_multiplier_days, 0))
```

## 4. จุดตัดสินใจโดเมน — ใช้ `bonus_days` ไม่ใช่ `effective_days` (CRITICAL)

- `supportive_experience` ใช้ `effective_days` เต็มก้อน เพราะเป็นเวลาใน "ตำแหน่ง/บทบาทอื่น" ที่ไม่เคยถูกนับในระดับปัจจุบัน → ให้เครดิตเต็ม
- `multiplier_experience` ใช้เพียง `bonus_days` (= `eligible_days × (ratio−100)/100`) เพราะช่วงเวลาทวีคูณ **ทับกับ** service ในระดับปัจจุบัน ที่ elapsed time (start → now) นับฐาน 100% ให้แล้ว → เติมได้แค่ "ส่วนเกิน"
- **ถ้าใช้ `effective_days` = นับซ้ำฐาน** ผู้มีสิทธิจะครบเกณฑ์เร็วเกินจริงเป็นเท่าตัว — ความเสี่ยง double-counting อันดับ 1 จาก PRD review และเป็นเหตุผลที่ schema แยกสองคอลัมน์ (`bonus_days` / `effective_days`) ไว้ตั้งแต่ต้น

## 5. Edge cases (LEFT JOIN + COALESCE ปลอดภัยโดยดีไซน์)

- ไม่มี record ทวีคูณ → `COALESCE` เป็น 0 → ผลลัพธ์เดิมไม่เปลี่ยน (backward-compatible)
- `bonus_days` เป็น `DECIMAL(10,2)` → `FLOOR` ตัดเศษ สอดคล้องกับ treatment เดิมของ supportive/equivalence
- บุคลากรสาย M/S ที่มีทวีคูณ → **ไม่ได้รับผลรอบนี้** (out of scope); response ของ executive จะไม่มี field `multiplier_days` → frontend ต้อง treat missing = 0 (known asymmetry — บันทึกไว้เพื่อทำ path executive รอบหน้า)

## 6. Worked example (ใช้ตรวจ static + UAT)

- บุคลากร: `current_level_start_date` = 2020-01-01, `min_years` = 6 → ฐาน `qualification_date` = 2026-01-01
- มี `multiplier_experience`: `bonus_days` = 100 (ไม่มี supportive/equivalence)
- → `qualification_date` ที่คาด = 2026-01-01 − 100 วัน = **2025-09-23**
- เกณฑ์ผ่าน: ผลลัพธ์ต้องเลื่อนเข้ามา **100 วันเป๊ะ** เทียบกับก่อนเพิ่ม multiplier

## 7. Verification (Docker ขึ้นแล้ว — runtime ทำได้)

1. Static SQL review — ยืนยัน scope: แก้เฉพาะ `buildBaseQuery`, ไม่แตะ `buildExecutiveQuery`
2. Runtime smoke: `docker compose up db backend` → seed 1 record ทวีคูณให้ personnel ทดสอบ → เทียบ `qualification_date` ก่อน/หลัง ผ่าน endpoint candidate list
3. UAT เทียบ Excel เต็ม → **issue #23**

## 8. Testing note

Backend ไม่มี test runner ในเครื่อง dev (ไม่มี PHP CLI; Docker เพิ่งขึ้น) — ยึด worked example §6 + runtime smoke ผ่าน Docker เป็นหลักฐานหลักของรอบนี้
