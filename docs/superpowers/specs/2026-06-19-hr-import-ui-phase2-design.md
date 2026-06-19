# Design Spec — Phase 2: HR Import UI + ระบุ org/position จริง

- **วันที่:** 2026-06-19
- **โปรเจกต์:** smart-port (ระบบบริหารงานบุคคล สำนักงานปลัดกระทรวงยุติธรรม)
- **สถานะ:** ผ่าน fan-out review 3 รอบ (design×2 + spec×1) — fact-check ข้ออ้างกับ source ผ่านทุกข้อ; พร้อมไป implementation plan
- **ต่อยอดจาก:** Phase 1 (`ImportService` + `POST /import/executive`) MERGED → main `fc30fa1`, deploy ขึ้น prod แล้ว แต่ data ยังไม่ถูกนำเข้า
- **Production DB:** TiDB Cloud (ไม่ใช่ MySQL ตรง — migration ต้อง verify syntax บน TiDB)

---

## 1. เป้าหมาย & คุณค่า

Phase 1 ทำ backend เสร็จและขึ้น prod แล้ว แต่ยังไม่มี UI (ต้อง curl) และยัง **hardcode `org_id=1, position_id=1`** → ข้อมูลชี้หน่วยงาน/ตำแหน่งผิด

Phase 2 ปลดล็อก: (1) HR อัปโหลด `.xlsx` ผ่านหน้าเว็บ เห็นผลทันที (2) org/position ถูกต้อง (find-or-create จากชื่อ)

## 2. ขอบเขต & การตัดสินใจที่ยืนยันแล้ว

| ประเด็น | การตัดสินใจ | เหตุผล |
|---------|-------------|--------|
| วิธีระบุ org/position | HR กรอก**ชื่อ**ใน Excel → find-or-create | consistent กับ citizen_id-as-key (HR ไม่รู้ id auto) |
| `History.position_id` | **NULL** (ไม่ resolve) | view `vw_*_tenure` ใช้ `COALESCE(job_series_name, position_name)` — ไม่อ่าน `position_id`; resolve free-text จะปนเปื้อน `position` master (verify: `04-career-path.sql:285,300`, ไม่มี code path อื่นอ่าน `pph.position_id`) |
| `Personnel.current_position_id`/`current_org_id` | resolve จากชื่อ | 1 ค่า/คน = controlled |
| `History.org_id` | resolve จาก `org_name` (optional — ว่าง→NULL) | หน่วยงาน controlled ระดับองค์กร |
| `History.org_name` ในชีต | **optional** | History เป็น event/snapshot ยอมว่างได้ |
| UNIQUE บนชื่อ | **functional index** บน `SHA2(normalize(name))` | resolver ไม่ต้องเปลี่ยน (lookup `WHERE name=?`), normalize ใน SQL ตรงกับ PHP, กัน prefix-collision; **verify TiDB รองรับ** |
| Phase ordering | **SSL CA micro-PR ก่อน 2a**; UNIQUE migration **gate ก่อน import prod** | endpoint รับ PII ไม่ควรอยู่ prod ขณะ TiDB ไม่ verify cert; UNIQUE เป็น dependency ของ import ไม่ใช่ hardening อิสระ |
| rate limit + audit log | **อยู่ใน 2a** | ระบบ PII ต้องมี audit trail (OWASP A09); rate limit ผูกกับ endpoint |
| re-import error mapping | driver code `1062` (ไม่ใช่ SQLSTATE `23000`) | 23000 กว้างเกิน (FK อื่นก็ 23000) |
| sanitize ชื่อ | **reject ถ้ามี `<>`** (ไม่ strip_tags) | strip_tags ตัดชื่อไทย "งาน`<กลุ่ม>`การเงิน" เงียบ |
| Pre-existing (JWT alg, LIMIT) | PR `2c` อิสระ | blast radius กว้าง (auth/route) |

### ตัดออก (YAGNI — ยืนยัน 3 รอบ)
❌ composable `useImport` ❌ `API_BASE` refactor เข้า useApi.js (แตะ core เกินจำเป็น — ImportPage define inline) ❌ upsert/sync ❌ queue/async ❌ refactor envelope

## 3. สถาปัตยกรรม — ลำดับ PR

```
PR-0 (SSL CA)  →  2a (backend correctness + audit + rate limit)  →  2b (template + frontend)
   security        core value                                          UI ใช้งานได้
       └─ [gate ก่อน import prod: UNIQUE/index migration + verify-prod] ─┘
                              2c (JWT alg, LIMIT bind) = อิสระ ทำเมื่อใดก็ได้
```

- **PR-0** แยก SSL CA ออกมาก่อน (config.php 2 บรรทัด, ไม่ขึ้นกับ feature) — ปิด PII risk window
- **UNIQUE migration ไม่ใช่ "2c อิสระ"** — เป็น gate ที่ต้อง deploy + verify ก่อน import prod ครั้งแรก
- **2c** เหลือเฉพาะ JWT alg + LIMIT (hardening จริง อิสระจาก import)

---

## 4. Phase 2a — Backend correctness + upload-boundary security + audit

ไฟล์: `backend/ImportService.php`, `backend/routes/import.php`, `backend/tests/Integration/ImportServiceTest.php`, migration `database/10-import-log.sql`

### 4.1 SHEETS constant + header guard
- `Personnel`: append `org_name`, `position_name` ต่อท้าย `education_level`
- `History`: append `org_name` (optional)
- **ห้ามแทรกกลาง** (positional reader)
- **Header keyword check ใน `parseWorkbook()`:** ก่อน `array_shift` ตรวจว่า header row มี keyword คาดหวัง (เช่น คอลัมน์ใหม่) — ถ้าไม่ตรง โยน error "ใช้ template ผิดเวอร์ชัน" (กัน positional drift จากไฟล์เก่า)

### 4.2 Resolver (path เดียว — SELECT-then-insert + cache)
```
resolveOrg(?string $name): ?int      resolvePosition(?string $name): ?int
```
- **normalize ก่อน → reject `<>` → ตัด:** `$n = preg_replace('/\s+/u',' ',trim($name))`; ถ้า `preg_match('/[<>]/',$n)` → throw (validation reject, ไม่ strip เงียบ); ถ้า `$n===''` → คืน `null`
- **cache key = ชื่อ normalized (ค่าที่จะ INSERT จริง)** — `array<string,int>` map; reset ที่ต้น `persist()`
- lookup: cache → `SELECT id WHERE name=?` → ไม่เจอ `INSERT`
- **lastInsertId guard:** MySQL คืน `"0"` ไม่ใช่ `false` → `if ((int)$id < 1) throw new RuntimeException(...)`
- **`if (!$this->pdo->inTransaction()) throw new LogicException(...)`** (ไม่ใช้ `assert()` — ปิดได้ใน prod)
- resolver ทำงานใน transaction เดียวกับ persist → ถ้า rollback org/position ที่สร้างใหม่ rollback ด้วย (ไม่มี orphan)

### 4.3 เลิก hardcode id=1
| INSERT | เดิม | ใหม่ |
|--------|------|------|
| `personnel.current_org_id` | `1` | `resolveOrg($p['org_name'])` |
| `personnel.current_position_id` | `1` | `resolvePosition($p['position_name'])` |
| `personnel_position_history.org_id` | `1` | `resolveOrg($h['org_name'])` (optional) |
| `personnel_position_history.position_id` | `1` | **`NULL`** |

### 4.4 Validation (คง `validate()` pure — ไม่แตะ DB)
- Personnel `org_name`+`position_name` = required; History `org_name` = optional
- **ไม่เพิ่ม** pre-flight DB check (รักษา test isolation จาก PR #11)
- re-import (citizen ซ้ำ DB): พึ่ง `citizen_id UNIQUE`; catch ใน `persist()` ตรวจ **`$e instanceof PDOException && ($e->errorInfo[1] ?? 0) === 1062`** → "พบเลขบัตรประชาชนซ้ำกับข้อมูลในระบบ — กรุณาตรวจไฟล์"; error code อื่น → generic + rollback

### 4.5 Security — upload boundary + audit + rate limit
**`routes/import.php` (ลำดับ):** `requireAdmin()` → **rate limit** (นับ import ของ user_id ใน 15 นาทีจาก `import_log`, เกิน N → 429) → `is_uploaded_file($file['tmp_name'])` → **size cap** `filesize($file['tmp_name']) ≤ 5MB` (ไม่ใช่ `$_FILES['size']` — fail-fast ก่อนเปิดไฟล์) → **magic bytes** อ่าน 4 ไบต์ = `"PK\x03\x04"` (guard `strlen<4`→415) → service

**`ImportService`:**
- `IOFactory::createReader('Xlsx')->setReadDataOnly(true)->setReadEmptyCells(false)->load()`
- **row cap** 5000/ชีต ใน `parseWorkbook()`
- **PII:** ลบ `citizen_id` ออกจาก error ทุกจุด (เหลือเลขแถว) — จุดรั่ว `validateChild` ("citizen_id {cid} ...")
- **exception:** catch → `error_log(ref + message จริง)` + คืน generic message (+ ref id) — ไม่ส่ง `$e->getMessage()`

**Audit log** (`database/10-import-log.sql`): table `import_log(id, user_id, filename, personnel_count, success, error_summary, imported_at)` — **ไม่ log citizen_id**; INSERT ก่อน return ทุกครั้ง (สำเร็จ/ล้มเหลว); ใช้ table นี้นับ rate limit ด้วย

### 4.6 Tests
- resolve เป็น id ที่สร้าง **≠ 1**; ชื่อซ้ำในไฟล์ → reuse id (cache); re-import → error ไทย (ผ่าน 1062); `org_name`/`position_name` ว่าง → reject; ชื่อมี `<>` → reject; **cleanup org/position + import_log ที่ test สร้าง**

---

## 5. Phase 2b — Template + Frontend (พึ่ง 2a)

ไฟล์: `scripts/gen-import-xlsx.py`, `frontend/src/pages/ImportPage.vue` (ใหม่), `router/index.js`, `AppSidebar.vue`, `frontend/public/import-template.xlsx`

### 5.1 Template generator
- append คอลัมน์ใหม่ + header keyword ไทย
- **single-source:** เขียน template → `frontend/public/import-template.xlsx` ที่เดียว (ลบสำเนา `docs/`)
- **fixture คงที่** `backend/tests/fixtures/import-sample.xlsx` (คนละไฟล์ — ห้ามย้าย)

### 5.2 `ImportPage.vue` (admin-only)
- โครงตาม `UserManagementPage.vue`; **fetch ตรง** (ไม่ใช่ `useApi().upload()` ที่ throw ทิ้ง body) — replicate useApi ให้ครบ:
  - **`if (auth.token) headers.Authorization = ...`** (guard ก่อนใส่ — ตรงกับ useApi)
  - **outer try-catch รอบ `fetch()`** กัน network error/TypeError → fallback ไทย "เชื่อมต่อไม่ได้ ลองใหม่"
  - `const body = await res.json().catch(() => ({ errors:[res.statusText] }))` กัน non-JSON (413 nginx HTML/500/502)
  - **`if (res.status===401){ auth.logout(); router.push('/login'); return }`** → caller ต้อง null-guard ก่อนอ่าน `body.errors`
  - **อย่า set `Content-Type`** (ให้ browser ใส่ boundary — FormData)
  - `API_BASE` define inline ในไฟล์ (ไม่แตะ useApi.js)
- **Dropzone:** `role="button" tabindex="0"` + `@keydown.enter/.space` + `aria-label` + **`@dragover.prevent @drop.prevent`** (ไม่งั้น browser navigate ออก); `<input accept=".xlsx">` ซ่อน; disabled state มี visual (opacity/cursor)
- **Client validate:** `file.name.toLowerCase().endsWith('.xlsx')` + ≤5MB
- **double-submit:** disable input+ปุ่ม+dropzone ขณะ uploading
- **3 สถานะ:** uploading (spinner) / success (การ์ดสรุป + **`<RouterLink to="/candidates">`** ไม่ auto-push) / error (list `errors[]`)
- **`aria-live`** region + ย้าย focus ไป result หลังเสร็จ (a11y)
- ปุ่ม "นำเข้าใหม่" reset state; ดาวน์โหลด `<a href="/import-template.xlsx?v=2026-06-19" download>` (cache-bust)

### 5.3 Routing / Sidebar
- route `/import` `meta:{requiresAdmin:true}` (guard เดิม `auth.user?.role!=='admin'` ใช้ได้); sidebar เมนู admin-only "นำเข้าข้อมูล" (icon `FileUp`) — ใช้ `auth.isAdmin` ให้ตรงกับ computed (note: เมนู `/users` เดิม inline `role==='admin'` — คง pattern เดิมไว้ ไม่ refactor)

---

## 6. PR-0 + UNIQUE gate + 2c

### PR-0 (ก่อน 2a) — SSL CA TiDB
`config.php`: เลิก `MYSQL_ATTR_SSL_VERIFY_SERVER_CERT=false`; ใช้ CA path จาก env; **fail-closed** ถ้า env ว่าง/อ่านไม่ได้
- **Rollout:** (1) set `MYSQL_SSL_CA` env บน Render **ก่อน** (2) deploy code (3) health check DB connect — ไม่งั้น prod 503

### UNIQUE/index migration (gate ก่อน import prod) — `database/11-import-constraints.sql`
- **verify-prod ก่อน** (ชื่อ column จริง):
  ```sql
  SELECT org_name, COUNT(*) FROM organization GROUP BY org_name HAVING COUNT(*)>1;
  SELECT position_name, COUNT(*) FROM `position` GROUP BY position_name HAVING COUNT(*)>1;
  SELECT COUNT(*) FROM personnel WHERE current_org_id=1 OR current_position_id=1;
  ```
  ถ้า org/position ซ้ำ → dedup ก่อน
- **functional index** (resolver lookup `WHERE org_name=?` ใช้ index นี้ได้, normalize ตรงกับ PHP):
  ```sql
  CREATE UNIQUE INDEX uq_org_name ON organization ((SHA2(TRIM(REGEXP_REPLACE(org_name,'\\s+',' ')),256)));
  CREATE UNIQUE INDEX uq_position_name ON `position` ((SHA2(TRIM(REGEXP_REPLACE(position_name,'\\s+',' ')),256)));
  ```
  (ทางเลือก: generated `STORED` column `CHAR(64) CHARACTER SET ascii COLLATE ascii_bin` ถ้า functional index ไม่ work บน TiDB)
- FK indexes: `personnel(current_org_id)`, `personnel(current_position_id)`, `personnel_position_history(personnel_id, effective_date)`, `(org_id)`, `(position_id)`
- **idempotent:** `CREATE INDEX IF NOT EXISTS` หรือ `information_schema` check (`ALTER ... ADD INDEX IF NOT EXISTS` ไม่รองรับ MySQL 8)
- **verify บน TiDB:** functional index / `SHA2` generated / `IF NOT EXISTS` — TiDB อาจ behave ต่าง ต้องทดสอบบน TiDB ก่อน apply prod

### 2c (อิสระ) — JWT alg + LIMIT
1. `validateJWT()` decode header เช็ค `alg==='HS256'` (หรือ migrate `firebase/php-jwt` ที่ติดตั้งแล้ว — มี allowlist) — **defense-in-depth (ยัง exploit ไม่ได้ เพราะ HMAC รันเสมอ)**
2. LIMIT/OFFSET เปลี่ยนเป็น bound parameter — **cosmetic** (มี `intval()` cast แล้วทุกจุด, ทำเมื่อว่าง)

---

## 7. Data flow

```
HR → ดาวน์โหลด template → กรอก → ImportPage (client validate .xlsx/5MB)
  → fetch POST /import/executive (if token: Bearer, multipart; outer try-catch)
  → routes: requireAdmin → rate limit → is_uploaded_file → size cap → magic bytes
  → ImportService: parse (readDataOnly, row cap, header check)
       → validate (pure) → persist (tx): reset cache → resolveOrg/Position (normalize, reject <>, cache)
       → INSERT personnel (resolved) → diverse/equiv/history (position_id=NULL)
       → commit | rollback (1062 → error ไทย) → INSERT import_log
  → {success, summary, errors}
  → ImportPage: 401→logout | network err→fallback | success→card+RouterLink | error→list (aria-live)
```

## 8. Error handling

| ชั้น | กรณี | พฤติกรรม |
|------|------|----------|
| Frontend | network error/timeout | outer catch → fallback ไทย |
| Frontend | 401 | logout + redirect (return, null-guard) |
| Frontend | non-JSON (413/500/502) | `.catch()` fallback |
| Frontend | 422 | list `errors[]` |
| Route | rate limit | 429 |
| Route | ไฟล์ผิด/ใหญ่ | 415/413 |
| Service | validation/`<>` | 422 (ไม่มี PII) |
| Service | dup citizen (1062) | error ไทยเป็นมิตร |
| Service | error อื่น | rollback + generic + `error_log` + import_log(success=0) |

## 9. ความเสี่ยง & การบรรเทา

| ความเสี่ยง | บรรเทา |
|-----------|--------|
| Positional drift (template เก่า) | append ท้าย + header keyword check (§4.1) |
| prod org/position ซ้ำ → UNIQUE fail | verify query + dedup (§6) |
| ชื่อ >191 ตัว collision | functional index บน `SHA2()` เต็มความยาว |
| normalize-before-hash mismatch | normalize เดียวกันใน SQL (`REGEXP_REPLACE`) กับ PHP |
| TiDB syntax ต่าง MySQL | verify migration บน TiDB ก่อน prod |
| PII risk window | PR-0 (SSL CA) ก่อน 2a |
| token หมดอายุระหว่าง upload | 401 handling + token guard |
| import ไฟล์ใหญ่/ถี่ DoS | size/row cap + rate limit |

## 10. Day-2 Operations (เพิ่มตาม review รอบ 3)

### 10.1 Prod data id=1 remediation
- รัน verify query (§6). ถ้า `personnel WHERE current_org_id=1` > 0 → แยก 2 กรณี:
  - **seed data** (`personnel_id` 1-7 จาก `06-seed-data.sql`) → ปกติ, exclude
  - **contaminated import** (Phase 1 import จริงด้วย id=1) → backfill script แยกใน `database/`
- ตาม memory: Phase 1 ยังไม่ import → คาดว่าไม่มี contaminated (ยืนยันด้วย query)

### 10.2 Rollback
- import = insert-only, all-or-nothing/ไฟล์ → **undo batch = manual SQL โดย DBA** (อ้าง `import_log.id` หา rows) — ตัดสินใจ: ไม่ทำ auto-undo (YAGNI); migration rollback = drop index/table

### 10.3 Deploy runbook (Render + TiDB)
1. PR-0: set `MYSQL_SSL_CA` env → deploy → health check
2. 2a → 2b (feature ใช้ได้)
3. **ก่อน import prod:** verify-prod query → (dedup ถ้าจำเป็น) → apply `11-import-constraints.sql` บน TiDB (ทดสอบ syntax ก่อน) → verify index สร้างสำเร็จ
4. import จริง → ตรวจ `import_log` + candidate list views
5. 2c เมื่อใดก็ได้

### 10.4 Definition of Done (ต่อ PR)
- **PR-0:** prod DB connect ผ่าน SSL verify, health check เขียว
- **2a:** tests §4.6 เขียว (Docker), audit log ทำงาน, ไม่มี PII/exception leak ใน response
- **2b:** upload→summary/error flow ทำงาน, a11y (keyboard+aria-live), template ดาวน์โหลดได้
- **migration:** verify บน TiDB, idempotent (re-run ได้), index ใช้งานจริง

## 11. Decision log

- **รอบ 1** (design×5): 422 loss, PII, race, idempotency, History half-migration → v2
- **รอบ 2** (design verify): History resolve = net-negative → **NULL**; validate() คง pure; dual-path → path เดียว; pre-existing → 2c; `LIMIT` มี cast = cosmetic; `education_level` false-alarm (07) → v3
- **รอบ 3** (spec review, fact-check ผ่านทุกข้อ): SHA2-resolver coherence → **functional index**; phase order → **SSL CA ก่อน 2a + UNIQUE gate**; error `23000`→`1062`; strip_tags→reject `<>`; +rate limit +audit log; frontend (token guard, network catch, drag preventDefault); +Day-2 ops (remediation/rollback/runbook/DoD)
- **บทเรียน orchestration:** reviewer ที่เห็นทั้ง spec+code default ไป audit code (รอบ 2 misfire ~15 finding) → prompt ต้องระบุ "ประเมินแผน ไม่ใช่ implementation gap" (รอบ 3 fact-check ผ่านทุกข้อหลังแก้ prompt)
