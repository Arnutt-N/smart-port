# Design: CSP violation counter ที่ query ได้ (issue #113 / R1)

- **วันที่**: 2026-08-18
- **สถานะ**: Approved (ผู้ใช้อนุมัติทิศทาง 2026-08-18 — มอบการตัดสินใจเชิงเทคนิคให้ agent)
- **ที่มา**: ข้อเสนอ R1 จาก code review ของ PR #142 (บันทึกใน
  `project-log-md/claude-code/handoff-2026-08-18-csp-baseline-shipped.md`)
- **ต่อยอดจาก**: `scripts/csp-report-selftest.mjs` (R3, PR #143) และ
  `docs/frontend-security-headers.md` §CSP monitoring ก่อน enforce

## ปัญหา

เกณฑ์ promote CSP จาก report-only เป็น enforce คือ **"ไม่มี violation จากระบบจริง ≥ 7 วัน"**
ปัจจุบันหลักฐานเดียวที่มีคือ `error_log()` ใน `backend/api.php` case `csp-report` ซึ่งไปโผล่ที่
Render log — อ่านได้ด้วยตาคนที่มีสิทธิ์ dashboard เท่านั้น ผลคือ:

1. **automation ตรวจสอบไม่ได้เลย** — เขียนเทสไม่ได้ ทำ gate ไม่ได้ ต้องพึ่งคนเพ่ง log UI
2. **retention ~7 วัน** เท่ากับความยาวของหน้าต่างที่ต้องพิสูจน์พอดี หลักฐานหมดอายุระหว่างทาง
3. **"log ว่าง" ตีความไม่ได้** — R3 แก้ปัญหานี้ได้ครึ่งเดียว (พิสูจน์ได้ว่า request ถึงปลายทางและ
   ได้ 204 แต่ยังไม่พิสูจน์ว่า `error_log()` เขียนลงสำเร็จ)

## เป้าหมาย

ทำให้เกณฑ์ "0 violation ใน N วัน" เป็นสิ่งที่ **query ได้ผ่าน HTTP และตัดสินด้วย exit code ได้**

## Non-goals

- **ไม่แทนการอ่าน Render log สำหรับรอบวันที่ 24 ส.ค. 2026** — counter เริ่มนับ ณ วันที่ DDL ลง
  ย้อนหลังไม่ได้ ถ้าขึ้น prod วันที่ 20–21 ส.ค. จะมีข้อมูลแค่ 3–4 วัน ใช้เป็น**หลักฐานเสริม**
  คู่กับ log + self-test เท่านั้น (ผู้ใช้รับทราบและเลือกทางนี้เอง 2026-08-18)
- ไม่ทำ UI / หน้าจอในแอป — ผู้อ่านหลักคือสคริปต์
- ไม่เก็บ payload ของ report (ไม่มี PII เข้าฐานข้อมูล — คงนโยบายเดิมของ handler)
- ไม่แตะ CSP policy เอง (การกด enforce เป็นคนละงาน)

## การตัดสินใจหลัก

| # | ตัดสินใจ | เหตุผล |
|---|---|---|
| D1 | เก็บใน **TiDB ไม่ใช่ไฟล์** | filesystem ของ Render ไม่ persist ข้าม spin down (หัวไฟล์ `database/15-api-rate-limit-hits.sql` บันทึกเหตุผลนี้ไว้แล้ว) — และ spin down คือช่วงเดียวกับที่ violation จะโผล่พอดี |
| D2 | **aggregate รายวัน** ไม่ใช่ append ทุก event | `/api/csp-report` เป็น public endpoint การ append ทำให้ใครก็ได้เขียนแถวเข้า DB production ไม่จำกัด |
| D3 | **cap จำนวน key ต่อวัน** ในตัว schema | rate limit 60/นาที กันไม่ได้จริง — `publicClientIp()` (`rate_limit.php:171-180`) อ่าน XFF ตัวแรกซึ่ง client ปลอมได้ การจำกัดจึงต้องไม่ฝากไว้กับ rate limiter |
| D4 | **shared secret ผ่าน header** สำหรับ endpoint อ่าน | สคริปต์อ่านได้โดยไม่ต้อง login และไม่เปิดข้อมูล directive ที่ถูกละเมิดให้สาธารณะ (ข้อมูลนั้นบอกใบ้คนที่กำลังทดสอบช่องโหว่ว่าโดนบันทึกหรือไม่) |
| D5 | **DB error ทุกชนิดถูกกลืน** handler ตอบ 204 เสมอ | สัญญาเดิมของ handler ห้ามเปลี่ยน และทำให้ deploy โค้ดก่อนรัน DDL ได้อย่างปลอดภัย |
| D6 | **เก็บ `error_log()` เดิมไว้คู่กัน** | หลักฐานสองทาง — DB ล่มก็ยังมี log, log หายก็ยังมี DB |
| D7 | **marker ของ self-test เก็บลงตารางเหมือน violation ปกติ** แล้วแยกตอนอ่าน | ทำให้ขั้นตอน "เปิด Render log หา marker ด้วยตา" หายไปทั้งหมด และปิดช่องว่าง "204 ≠ `error_log()` สำเร็จ" ได้ตรงกว่าการเติม response header เพราะพิสูจน์ถึงชั้นที่ข้อมูลถูกเก็บจริง |

## Schema

ไฟล์ `database/31-csp-violation-daily.sql`

```sql
CREATE TABLE IF NOT EXISTS csp_violation_daily (
    day           DATE NOT NULL,
    directive     VARCHAR(64)  NOT NULL,
    blocked_host  VARCHAR(128) NOT NULL,
    hits          INT UNSIGNED NOT NULL DEFAULT 1,
    first_seen    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (day, directive, blocked_host)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

PK สามคอลัมน์ทำหน้าที่ทั้ง unique key ของ UPSERT และ index ของ query ตามช่วงวัน — ไม่ต้องมี
index เพิ่ม ขนาด key ~771 bytes อยู่ในเพดาน 3072 bytes ของ InnoDB/TiDB

ค่าที่ใช้เป็น key มาจาก `sanitizeLogValue()` เดิม (ตัด control char + cap 100 ตัวอักษร) แล้วตัด
ความยาวตาม column อีกชั้น

## Write path (`backend/api.php` case `csp-report`)

ต่อท้าย `error_log()` เดิม — ไม่แทนที่

```
1. UPSERT: INSERT ... ON DUPLICATE KEY UPDATE hits = hits + 1
2. อ่าน affected rows:
     2 = key เดิม → จบ (กรณีปกติ ใช้ query เดียว)
     1 = เพิ่ง insert key ใหม่ → ไปข้อ 3
3. นับ key ของวันนี้ ถ้าเกิน MAX_KEYS_PER_DAY (200):
     ลบแถวที่เพิ่ง insert แล้ว UPSERT เข้าแถวรวม blocked_host = '__overflow__' แทน
4. prune: ลบแถวที่ day < CURDATE() - INTERVAL 120 DAY (LIMIT 100 ต่อครั้ง)
     ทำเฉพาะตอนสร้าง key ใหม่ ไม่ทำทุก request
     (120 ไม่ใช่ 90 เพื่อให้เผื่อขอบ — `days` ที่ endpoint รับได้สูงสุดคือ 90)
```

PDO ของโปรเจกต์ไม่ได้ตั้ง `MYSQL_ATTR_FOUND_ROWS` (ดู `backend/config.php:59-61`) ค่า
`rowCount()` จึงเป็น affected-rows semantics ตามที่ข้อ 2 พึ่งพา — **ถ้าวันหนึ่งมีคนเปิด flag นั้น
ตรรกะ cap จะเพี้ยนเงียบ ๆ** ต้องมีเทสจับ (ดูหัวข้อ Testing)

ผลลัพธ์: **จำนวนแถวต่อวันมีเพดานตายตัว** ไม่ว่าจะถูกยิงกี่ล้านครั้ง และกรณีปกติเสียแค่ query เดียว

### ทำไมถึงไม่กรองด้วย `document-uri`

เคยพิจารณาให้เขียนลง DB เฉพาะ report ที่ `document-uri` ตรงกับ origin ของเรา เพื่อตัด noise
แต่**ตัดทิ้งโดยตั้งใจ**: allowlist ที่ตั้งผิดแม้แต่ค่าเดียวจะทำให้ violation จริงถูกทิ้งเงียบ ๆ แล้ว
endpoint รายงาน "0 violation" ทั้งที่มี — เป็น false-clean ซึ่งคือ failure mode ที่งานนี้ตั้งใจกำจัด
ประโยชน์ที่ได้ (ลด noise) ไม่คุ้มกับความเสี่ยงที่หลักฐานจะโกหก เก็บทุก report ที่ผ่าน sanitize แล้ว
ให้ cap เป็นตัวคุมการเติบโตแทน

## Read path

`GET /api/csp-report/summary?days=7` — ใช้รูปแบบ path[1] แบบเดียวกับ `auth/login` ที่มีอยู่

**Auth**: header `X-CSP-Summary-Token` เทียบกับ env `CSP_SUMMARY_TOKEN` ด้วย `hash_equals()`

- env ไม่ได้ตั้ง → **503** `{"error":"summary endpoint not configured"}` (fail-closed
  ไม่มีทางเปิดสาธารณะโดยอุบัติเหตุ)
- token ไม่ตรง/ไม่ส่งมา → **401**
- `days` รับ 1–90 นอกช่วงนี้ → 400

**Response 200**

```json
{
  "window_days": 7,
  "since": "2026-08-12",
  "storage": "ready",
  "violations": { "total": 0, "top": [] },
  "selftest": { "total": 2, "markers": [
      { "blocked_host": "csp-selftest-20260824-a3f9.invalid", "last_seen": "2026-08-24T05:10:38Z", "hits": 1 } ] },
  "overflow_hits": 0
}
```

- `violations` = แถวที่ `blocked_host NOT LIKE 'csp-selftest-%.invalid'` (ตัด marker ของทีมออก)
- `selftest` = marker ของทีม — มีไว้พิสูจน์ว่า pipeline ครบวงจร
- `top` = สูงสุด 50 แถวเรียงตาม hits (กัน response บวม)
- `overflow_hits` = จำนวนที่ตกลงแถวรวมเพราะชน cap — **ถ้ามากกว่า 0 แปลว่าข้อมูลไม่ครบ ต้องดู
  Render log ประกอบ ห้ามสรุปจากตัวเลขอย่างเดียว**
- `storage: "unavailable"` เมื่อตารางยังไม่มี (prod ยังไม่รัน DDL) — **ผู้บริโภคต้องถือว่า
  "สรุปไม่ได้" ไม่ใช่ "0 violation"** เป็นบทเรียนเดียวกับ "log ว่าง ≠ ไม่มี violation"

## Script gate

`scripts/check-csp-violations.mjs`

```
node scripts/check-csp-violations.mjs [--base-url <url>] [--days 7] [--require-marker <host>]
```

- อ่าน token จาก **env `CSP_SUMMARY_TOKEN` เท่านั้น ไม่รับผ่าน argument** (argument โผล่ใน
  process list และ shell history)
- exit 0 เมื่อ: `storage === "ready"` **และ** `violations.total === 0` **และ** (ถ้าระบุ
  `--require-marker`) marker นั้นอยู่ใน `selftest.markers`
- exit 1 ทุกกรณีอื่น รวมถึง `storage: "unavailable"` และ `overflow_hits > 0`
- parseArgs แบบ fail-closed ตามแบบ `csp-report-selftest.mjs` (default ยิง production)
- **ไม่อยู่ใน CI gate** เพราะยิง production จริง — regression ของมันอยู่ใน `scripts/tests/`
  ซึ่ง pre-push รันให้อยู่แล้วผ่าน glob `scripts/tests/*.test.mjs`

## Rollout

ลำดับนี้ทำให้ deploy โค้ดไม่ผูกกับจังหวะที่คนว่างรัน SQL

| ขั้น | ใครทำ | ผลถ้ายังไม่ทำ |
|---|---|---|
| 1. merge + deploy โค้ด | agent + auto-deploy | ระบบทำงานเหมือนเดิมทุกประการ (D5) |
| 2. รัน DDL บน prod TiDB | **ผู้ใช้** (ต้องมีสิทธิ์ prod) | endpoint คืน `storage: "unavailable"` gate exit 1 — ไม่มีอะไรพัง แค่ยังไม่ได้ประโยชน์ |
| 3. ตั้ง env `CSP_SUMMARY_TOKEN` บน Render | **ผู้ใช้** (dashboard) | endpoint คืน 503 อ่านสรุปไม่ได้ (การนับยังทำงานปกติ) |

ขั้น 2 และ 3 อิสระต่อกัน ทำสลับลำดับได้

`render.yaml` เพิ่ม `CSP_SUMMARY_TOKEN` ใน envVars ของ `smartport-backend` แบบ `sync: false`
(ค่าจริงอยู่บน dashboard เท่านั้น — แบบเดียวกับ `JWT_SECRET`)

การเพิ่มตารางต้องแตะ 4 จุดตาม schema parity gate: `database/31-*.sql` ·
`database/tidb-init.sql` · mount ใน `docker-compose.yaml` · mount ใน `.github/workflows/ci.yml`
(`node scripts/validate-schema-parity.mjs` ต้อง exit 0)

## Security

| ประเด็น | การจัดการ |
|---|---|
| public endpoint เขียน DB ได้ (write amplification) | cap จำนวนแถวต่อวันในตัว schema (D3) — จำนวน **แถว** มีเพดานแน่นอน |
| จำนวน **write** ยังไม่มีเพดาน | รับความเสี่ยงไว้ก่อน: แต่ละครั้งเป็น UPSERT แถวเดียว + มี rate limit (แม้ bypass ได้) + ตัวกรอง document-uri ถ้าพบการถูกยิงจริงค่อยเพิ่มเพดาน hits ต่อวัน — บันทึกเป็น residual risk |
| ข้อมูลที่ attacker คุมได้เข้า DB | เก็บเฉพาะ directive + host ที่ผ่าน `sanitizeLogValue()` + ตัดความยาว ไม่เก็บ payload |
| ปลอม marker ให้ pipeline ดูใช้งานได้ | nonce ของ R3 สุ่มต่อรอบ สคริปต์หาเฉพาะ marker ที่ตัวเองเพิ่งสุ่ม ปลอมล่วงหน้าไม่ได้ |
| เปิดเผยข้อมูล recon | endpoint ต้องมี token เสมอ (fail-closed เป็น 503 เมื่อไม่ได้ตั้งค่า) |
| SQL injection | prepared statement ทั้งหมด (`ATTR_EMULATE_PREPARES => false` อยู่แล้ว) |

## Testing

**Backend (PHPUnit integration — `backend/tests/`)**

1. report ใหม่ → สร้างแถว hits=1
2. report ซ้ำ key เดิม → hits=2 ไม่ใช่แถวใหม่ (**เทสนี้จับได้ถ้ามีคนเปิด `MYSQL_ATTR_FOUND_ROWS`**)
3. เกิน `MAX_KEYS_PER_DAY` → ตกลงแถว `__overflow__` จำนวนแถวไม่โต
4. ตารางไม่มี → handler ยังตอบ 204 (จำลองด้วยการ drop/rename ในเทส)
5. summary: ไม่มี token → 401 · env ไม่ได้ตั้ง → 503 · `days` นอกช่วง → 400
6. summary แยก marker ออกจาก violation จริงถูกต้อง

**Script (node:test + mock origin — `scripts/tests/`)**

7. `storage: "unavailable"` → exit 1 (ห้ามอ่านเป็น 0 violation)
8. `violations.total > 0` → exit 1 พร้อมบอกว่า directive/host ไหน
9. `overflow_hits > 0` → exit 1
10. `--require-marker` ที่ไม่เจอ → exit 1
11. ทุกอย่างสะอาด → exit 0
12. argument ผิด → exit 1 ก่อนแตะเครือข่าย

## Risks

1. **ข้อมูลย้อนหลังไม่ได้** — สำหรับรอบ 24 ส.ค. เป็นหลักฐานเสริมเท่านั้น (ระบุใน Non-goals)
2. **ขึ้นกับสิทธิ์ prod ที่ agent ไม่มี** — ถ้าไม่มีใครรัน DDL ระบบจะ degrade กลับไปเท่าเดิม
   ตลอดกาล ไม่พังแต่ก็ไม่ได้ประโยชน์ ต้องติดตามให้จบ
3. **เพิ่ม DB write ลงเส้นทาง public ที่เดิมไม่แตะ DB เลย** — คอมเมนต์ `api.php:115-117` เตือน
   เรื่อง unauthenticated amplification ไว้เอง ดูตาราง Security
4. **TiDB เป็น serverless ที่คิดค่าตามการใช้งาน** — write ที่ถูกยิงถล่มมีต้นทุนเป็นเงิน ไม่ใช่แค่
   ความช้า ถ้าเห็นสัญญาณต้องเพิ่มเพดานทันที

## ผลพลอยได้

ถ้า R1 ทำงานครบ ขั้นตอนวันตัดสินใจจะเหลือ **สองคำสั่ง** และไม่ต้องเปิด dashboard เลย:

```bash
node scripts/csp-report-selftest.mjs        # ยิง marker สด แล้วพิมพ์ marker ออกมา
node scripts/check-csp-violations.mjs --days 7 --require-marker <marker>
# exit 0 = marker ถึงจริง และไม่มี violation จากระบบจริงในหน้าต่าง 7 วัน
```

(ยังต้องมี traffic จริงในหน้าต่างนั้นด้วย — เกณฑ์ข้อนี้ไม่มีอะไรมาแทนได้ ดู
`docs/frontend-security-headers.md`)
