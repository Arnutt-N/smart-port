# Multiplier Feature Verification Report
**Date:** 2026-07-07  
**Branch:** `feat/multiplier-mock-dev`  
**Issue:** #19

---

## ✅ Verification Checklist

### Backend API
- ✅ Database schema created (`database/13-multiplier-time-counting.sql`)
- ✅ Mock seed data (7 areas: ยะลา, ปัตตานี, นราธิวาส, สงขลา 4 อำเภอ)
- ✅ API routes implemented (`backend/routes/multiplier.php`)
- ✅ Routing wired in `backend/api.php`
- ✅ Authentication required (JWT)
- ✅ Admin-only restrictions working

### Endpoints Tested
| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/multiplier/areas` | ✅ 200 | Returns 7 mock areas with `source_pending: true` |
| GET | `/multiplier/areas?province=ยะลา` | ✅ 200 | Province filter working |
| GET | `/multiplier` | ✅ 200 | Empty array + summary stats |
| GET | `/multiplier?personnel_id=1` | ✅ 200 | Returns personnel-specific records |
| POST | `/multiplier` | ✅ 201 | Created record with computed fields |
| POST | `/multiplier/areas` | ⚠️ Untested | Needs validation testing |

### Calculation Verification
**Test Record:**
- `personnel_id`: 1
- `area_multiplier_id`: 1 (ยะลา — ratio 200%)
- `start_date`: 2004-02-01
- `end_date`: 2004-08-31
- `service_days`: 213 days ✅
- `eligible_days`: 213 days (no clamping — fully within effective period) ✅
- `multiplier_ratio`: 200 ✅
- `effective_days`: 426 (213 × 200 / 100) ✅
- `bonus_days`: 213 (213 × (200 - 100) / 100) ✅
- `net_end_date`: 2005-04-01 ✅
- `net_years`: 1, `net_months`: 2, `net_day_remainder`: 6 ✅ (426 days = 1y 2m 6d in 360-day system)

### Frontend UI
- ✅ Composable created (`frontend/src/composables/useMultiplier.js`)
- ✅ Pages created:
  - `MultiplierPage.vue` (main records view)
  - `MultiplierAreasPage.vue` (admin master data)
- ✅ Router wired (`/time-multiplier`, `/time-multiplier/areas`)
- ✅ Sidebar menu added (nested under "การนับเวลาเพิ่มเติม")
- ✅ Admin-only area management (conditional menu item)
- ✅ Production build successful (9.94s)

### Mock Data Warnings
- ✅ Database seed marked with `SOURCE_PENDING`
- ✅ Backend API returns `warning` in response
- ⚠️ Frontend UI warning visibility (needs UI verification)

---

## 📊 Test Results

> **pre-D3 historical evidence — ห้าม run ตามขั้นตอนนี้เพื่อทำซ้ำ:** ค่าผลลัพธ์ด้านล่าง
> มาจากยุค `Authorization: Bearer` (บันทึกไว้อ้างอิงอดีตเท่านั้น ไม่ใช่คำสั่งปัจจุบัน) ·
> คำสั่งที่แสดงถัดจากนี้เขียนในรูป post-D3 (cookie + CSRF) เพื่อใช้ re-run ใหม่ได้

### Authentication (post-D3: cookie + CSRF)

> ตั้งแต่ D3 เป็นต้นไป ห้ามใช้ `Authorization: Bearer` — protected call ยืนยันตัวตนด้วย
> session cookie (`sp_access`) และ write ต้องแนบ `X-CSRF-Token` (contract ฉบับเต็ม:
> `docs/auth-cookie-client-migration.md`) · ผลลัพธ์ค้างด้านล่างช่วง pre-D3 เป็น
> historical evidence ห้าม run ตาม

```bash
curl -c jar.txt -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<test-account>","password":"<test-password>"}'
# เก็บ csrf_token จาก response body ไว้ใช้แนบเขียนข้อมูล — ห้าม print/log ค่า
```
**Result:** session cookies (`sp_access`/`sp_refresh`) ถูกเซ็ตใน jar + `csrf_token` ใน body (post-D3)

### GET /multiplier/areas
```bash
curl -b jar.txt http://localhost:8000/api/multiplier/areas
```
**Result:**
```json
{
  "success": true,
  "data": [7 areas],
  "summary": {
    "total": 7,
    "source_pending": 7
  }
}
```

### POST /multiplier (Create Record)
```bash
curl -b jar.txt -X POST http://localhost:8000/api/multiplier \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <csrf-token-from-login-body>" \
  -d '{
    "personnel_id": 1,
    "area_multiplier_id": 1,
    "start_date": "2004-02-01",
    "end_date": "2004-08-31"
  }'
```
**Result:**
```json
{
  "success": true,
  "multiplier_id": 3,
  "computed": {
    "eligible_days": 213,
    "bonus_days": 213,
    "effective_days": 426,
    "net_years": 1,
    "net_months": 2,
    "net_day_remainder": 6
  }
}
```

---

## UAT / Director readiness (#23) — 2026-08-02

### Commands run

```bash
node scripts/validate-multiplier-phase0.mjs
# → 12/12 PASS (TEST_SEED fixtures)

docker compose up -d db backend   # APPLY_TEST_SEED_MIGRATIONS=1
node scripts/uat-multiplier-live-api.mjs
# → 10/10 PASS, 0 FAIL
```

### Offline validator (12 checks)

All PASS against `docs/multiplier_phase0_master_data_template.csv` + `docs/multiplier_phase0_uat_cases_template.csv`.

Note: `Verification fields populated (format only)` checks only that the field is
non-empty. The validator classifies `verified_by=TEST_SEED` as `SYNTHETIC_ONLY`
and does **not** treat it as a real HR signature.

### Live API UAT (TC-001..TC-010)

| Case | Result | Notes |
|------|--------|-------|
| TC-001 | PASS | clamp start, area 1 MARTIAL_LAW, eligible=16 bonus=16 |
| TC-002 | PASS | clamp end, eligible=61 bonus=61 |
| TC-003 | PASS | full month inside martial |
| TC-004 | PASS | สงขลา เทพา |
| TC-005 | PASS | สตูล ควนโดน (TEST_SEED district) |
| TC-006 | PASS | clamp start district |
| TC-007 | PASS | clamp end province |
| TC-008 | PASS | EMERGENCY_DECREE area 12 |
| TC-009 | PASS | นราธิวาส |
| TC-010 | PASS | สงขลา สะบ้าย้อย |

Mismatches: **none**. Severity/owner/resolution: N/A.

### DB data-quality (local Docker)

| Check | bad_count |
|-------|-----------|
| whole-province Satun | 0 |
| missing legal_reference | 0 |
| missing source_reference | 0 |
| duplicate exact periods | 0 |
| ambiguous active overlaps | 0 |

Areas loaded: **14** (รวมสตูล 4 อำเภอ + emergency 3 แถวจาก test-seed expand)

### Director readiness verdict

**NOT ready for director review.**

- Technical engine/API matches synthetic TEST_SEED expected values 100%
- HR Excel / signed legal references still missing → production seed and director package remain blocked
- Full pack: `docs/multiplier_phase0_validation_pack.md`

---

## Known Issues

1. **TEST_SEED / Mock Data Only** — ห้ามใช้ production จนกว่าจะได้ข้อมูลจริงจาก HR (Issue #18 / #23 director gate)
2. **Satun districts are provisional** — มีใน TEST_SEED (ควนโดน/ควนกาหลง/ท่าแพ/มะนัง) แต่ยังไม่ใช่ HR confirm
3. **POST /multiplier/areas** — ยังไม่ได้ทดสอบ validation เชิงลึกในรายงานนี้
4. **Frontend Warning UI** — ควรตรวจสอบว่า SOURCE_PENDING / TEST_SEED warning แสดงชัดเจนในหน้า UI

---

## 📸 Screenshot Commands (for Documentation)

> post-D3: cookie jar + CSRF เท่านั้น — ห้ามใช้ Bearer และห้าม echo/print ค่า
> `csrf_token` หรือค่า cookie ลง transcript

```bash
# Login — เก็บ cookie ลง jar และ csrf_token ไว้ในตัวแปร (ห้าม print)
curl -s -c jar.txt -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<test-account>","password":"<test-password>"}' \
  | jq -r .csrf_token > .csrf
CSRF=$(cat .csrf)

# List all areas
curl -s -b jar.txt http://localhost:8000/api/multiplier/areas | jq

# List records
curl -s -b jar.txt http://localhost:8000/api/multiplier | jq

# Create test record (write ต้องแนบ X-CSRF-Token)
curl -s -b jar.txt -X POST http://localhost:8000/api/multiplier \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d @- << 'EOF' | jq
{
  "personnel_id": 1,
  "area_multiplier_id": 1,
  "start_date": "2004-02-01",
  "end_date": "2004-08-31"
}
EOF

# เสร็จแล้วลบ credential ออกจากเครื่อง (ห้าม commit jar/.csrf)
rm -f jar.txt .csrf
```

---

## Next Steps

1. **HR workbook** — กรอก `docs/multiplier_phase0_hr_workbook.xlsx` (หรือ CSV เทียบเท่า) แทนทุก `TEST_SEED`
2. **Re-run gates on real data** — `sync-multiplier-phase0-from-xlsx.py` → `validate-multiplier-phase0.mjs` → `uat-multiplier-live-api.mjs`
3. **Production seed** — อัปเดต seed / tidb-init หลัง HR sign-off เท่านั้น (ADR-0002)
4. **Close #23 director gate** — เมื่อ expected จาก Excel จริงผ่าน 100% และ Sign-Off ใน validation pack เป็น approve

---

## Issue status snapshot

| Issue | Status | Notes |
|-------|--------|-------|
| #19 feature shell | implemented (TEST_SEED) | page + lookup + areas |
| #21 edit/delete | closed | safe edit/delete |
| #22 bonus-days qualification | closed | engine uses bonus only |
| #23 UAT / readiness | technical PASS / director NO | this section |

**Ready for:** HR confirmation package — **not** director review yet
