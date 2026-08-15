# PRP Plan — Issue #111: XLSX import hardening (PhpSpreadsheet upgrade + formula evaluation)

**Date:** 2026-08-15 · **Issue:** #111 · **Branch:** `issue-111-xlsx-import-hardening`

## Problem

1. `ImportService::parseWorkbook()` เรียก `$ws->toArray(null, true, false, false)` โดย arg ที่ 2
   (`calculateFormulas`) เป็น `true` → สูตรในไฟล์ที่ user อัปโหลดถูก **evaluate** จริง
   สูตรกลุ่ม CVE-2026-59931 เช่น `=WEBSERVICE("http://169.254.169.254/...")` ทำให้เกิด
   SSRF/outbound request จากเซิร์ฟเวอร์ (cloud metadata leak)
2. phpspreadsheet ติดตั้งอยู่ที่ 2.4.6 ซึ่งยังมี advisory:
   - CVE-2026-59931 (WEBSERVICE SSRF redirect bypass)
   - CVE-2026-59932 (Gnumeric gzip memory exhaustion)
   - CVE-2026-59933 (OLE sector-chain loop)
   ทั้งหมดแก้ใน 2.4.7 (2.x line)
3. ไฟล์ binary แปลกปลอม (OLE/XLS) เปลี่ยนนามสกุลเป็น `.xlsx` ต้อง fail closed
   ด้วยข้อความที่เข้าใจง่าย (ไม่ 500)

## Plan

### 1. Upgrade dependency
- `composer update phpoffice/phpspreadsheet` → 2.4.7 (+ nikic/php-parser v5.8.0)
- ตรวจ `composer audit` = clean

### 2. ปิด formula evaluation ที่ต้นทาง (`backend/ImportService.php`)
- `toArray(null, FALSE, false, false)` — calculateFormulas เป็น false เสมอ
  → import ใช้ cached value เท่านั้น; สูตรมาเป็น raw string `"=..."` ไม่ถูกคำนวณ
- `setReadDataOnly(true)` — ไม่โหลด formula/style/external ref (ลด attack surface)
- `setLoadSheetsOnly(['Personnel','Diverse','Equivalence','History'])` —
  ไม่ parse ชีตอื่นที่แนบมาใน workbook

### 3. Fail-closed validation สำหรับสูตร (`validate()`)
- สแกนทุกชีต: ค่า string ที่ขึ้นต้นด้วย `=` → error
  `"{Sheet} แถว N (field): พบสูตร (formula) — กรุณาวางข้อมูลเป็นค่าคงที่ (paste as values) ก่อนนำเข้า"`
- ตรวจที่ `validate()` (ไม่ใช่ throw ใน parse) เพื่อให้ข้อความ error ถึง user ตรง ๆ
  ไม่ถูกบังโดย generic catch ของ `importFromFile()`

### 4. Regression tests (`backend/tests/Integration/ImportFormulaHardeningTest.php`)
- สร้าง malicious OOXML ด้วย ZipArchive (fixture ไม่ต้องพึ่ง library writer):
  `<c t="str"><f>=WEBSERVICE(...)</f><v>CACHED-OK</v></c>`
- `workbook_with_formula_cells_is_rejected_fail_closed`: success=false,
  errors มีคำว่า 'สูตร', 0 rows persisted
- `ole_binary_renamed_to_xlsx_fails_closed`: OLE magic bytes → error 'อ่านไฟล์ Excel ไม่ได้'
- cleanup ช่วง citizen_id `11001002990%` เหมือน ImportServiceTest

## Acceptance criteria
- [x] composer.lock อยู่ที่ phpspreadsheet ≥ 2.4.7, `composer audit` clean
- [x] `toArray()` calculateFormulas=false + comment อธิบายเหตุผล
- [x] ไฟล์มีสูตรถูก reject ทั้งไฟล์ (all-or-nothing) ด้วยข้อความเห็นชัด
- [x] OLE/binary ปลอม .xlsx fail closed
- [x] ImportServiceTest เดิมยังเขียว (พฤติกรรม import ปกติไม่เปลี่ยน)

## Verification
- `bash backend/tests/run.sh --filter "ImportFormulaHardeningTest|ImportServiceTest"`
- `bash backend/tests/run.sh` (full suite)
- `scripts/ci-local.ps1 -SkipInstall`
