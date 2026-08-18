# Runbook: เปิดใช้ CSP violation counter บน production

ต้องทำโดยคนที่มีสิทธิ์ production (agent ทำแทนไม่ได้) — **ทำได้ทีละข้อ ไม่ต้องทำพร้อมกัน
และไม่มีขั้นไหนทำให้ระบบที่ใช้งานอยู่หยุดทำงาน**

โค้ดที่ deploy ไปแล้วทำงานได้เองโดยไม่ต้องรอ runbook นี้ — ถ้ายังไม่ทำข้อ 1 ระบบจะทำงาน
เหมือนก่อนหน้านี้ทุกประการ (เขียน log อย่างเดียว ไม่นับ)

**สิ่งนี้มีไว้ทำอะไร:** เกณฑ์ก่อนเปิดโหมดบังคับ CSP คือ "ไม่มี violation จากระบบจริง ≥ 7 วัน"
ซึ่งเดิมต้องเปิด Render log ไล่อ่านด้วยตา ตัวนับนี้ทำให้ถามได้ด้วยคำสั่งเดียวว่าผ่านเกณฑ์หรือยัง

---

## ข้อ 1 — สร้างตารางบน prod TiDB

เปิด SQL console ของ TiDB (ผ่าน TiDB Cloud console หรือ mysql client ที่ต่อ production) แล้วรัน:

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

คำสั่งนี้ **รันซ้ำได้ไม่พัง** (`IF NOT EXISTS`) และไม่แตะตารางอื่นเลย

ยืนยัน:

```sql
SHOW TABLES LIKE 'csp_violation_daily';
```

ต้องได้ 1 แถว

> **ตัวนับเริ่มจากศูนย์ ณ วินาทีที่รันคำสั่งนี้ ย้อนหลังไม่ได้** — ข้อมูลก่อนหน้านี้ไม่มีทางกู้มา
> เพราะระบบเดิมเขียนแค่ log ที่หมดอายุตามรอบ retention ของ Render

---

## ข้อ 2 — ตั้ง env `CSP_SUMMARY_TOKEN` บน Render

1. Render dashboard → service **`smartport-backend`** (ไม่ใช่ static site `smart-port`)
2. เมนู **Environment** → **Add Environment Variable**
3. Key: `CSP_SUMMARY_TOKEN` · Value: ค่าที่ทีมสุ่มไว้ (เก็บใน `secrets/secret-keys.txt` ซึ่งไม่ขึ้น git)
4. **Save Changes** — service จะ restart เองราว 1-2 นาที

**ข้อบังคับของค่า: ต้องยาวอย่างน้อย 32 ตัวอักษร** ถ้าสั้นกว่านี้ระบบจะปฏิเสธและตอบ 503
เหมือนกรณี "ยังไม่ได้ตั้งค่า" ทุกประการ (ตั้งใจให้เหมือนกัน เพื่อไม่ให้คนภายนอกเดาได้ว่าตั้งค่าไว้หรือยัง)
เหตุผลที่ต้องยาว: ตัวป้องกันจริงของ endpoint นี้คือความยากในการเดาค่า ส่วน rate limit
เป็นแค่ชั้นเสริม (ผู้เรียกปลอม IP เพื่อเลี่ยง rate limit ได้)

ถ้ายังไม่มีค่า ให้สุ่มใหม่ด้วยคำสั่งนี้แล้วเก็บไว้ที่ `secrets/secret-keys.txt`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

ระหว่าง restart การนับ violation ยังทำงานปกติ (env นี้ใช้เฉพาะฝั่งอ่านสรุป)

---

## ข้อ 3 — ยืนยันว่าใช้งานได้

```bash
node scripts/csp-report-selftest.mjs
# คัดลอก marker ที่พิมพ์ออกมา (csp-selftest-YYYYMMDD-xxxx.invalid) ไปใส่บรรทัดล่าง

CSP_SUMMARY_TOKEN='<ค่าที่ตั้งไว้>' node scripts/check-csp-violations.mjs --days 7 --require-marker '<marker>'
```

คำสั่งบนยิง marker สดเข้าระบบ คำสั่งล่างถามว่า "7 วันที่ผ่านมาสะอาดไหม และ marker ที่เพิ่งยิงถึงจริงไหม"

| ผลที่เห็น | แปลว่า | ทำอะไรต่อ |
|---|---|---|
| `✓ PASS` | ครบวงจร: marker ถึงจริง เก็บลง DB จริง และไม่มี violation จากระบบจริงในหน้าต่างนั้น | เสร็จ |
| `storage=unavailable` | ยังไม่ได้ทำข้อ 1 (ไม่มีตาราง) | รัน SQL ในข้อ 1 |
| `503` | ยังไม่ได้ทำข้อ 2 **หรือ** ค่าที่ตั้งสั้นกว่า 32 ตัวอักษร **หรือ** service ยัง restart ไม่เสร็จ | ตรวจความยาวค่าที่ตั้ง แล้วรอ restart สักครู่ ถ้ายังไม่หายให้ดู log ของ `smartport-backend` หา `CSP_SUMMARY_TOKEN สั้นกว่า` |
| `401` | ค่าที่ส่งไปไม่ตรงกับที่ตั้งบน Render | ตรวจว่าคัดลอกครบ ไม่มีช่องว่างหัวท้าย |
| `ไม่เจอ marker` | report ยิงถึงและได้ 204 แต่ไม่ถูกเก็บลงตาราง | ดู log ของ `smartport-backend` หา `[csp-report] persist failed` |
| `overflow` มากกว่า 0 | ข้อมูลชนเพดานจำนวนแถวต่อวัน = ข้อมูลไม่ครบ | **ห้ามสรุปจากตัวเลขอย่างเดียว** ดู Render log ประกอบ |
| `พบ violation จากระบบจริง` | มีของจริงค้างอยู่ | **ห้าม enforce** — ไล่แก้ตาม directive/host ที่รายงาน |

---

## หมายเหตุสำหรับการตัดสินใจ enforce

1. **ตัวนับนี้เป็นหลักฐานเสริม ไม่ใช่ตัวแทนของ Render log สำหรับรอบแรก** เพราะข้อมูลเริ่มนับ
   ตั้งแต่วันที่ทำข้อ 1 เท่านั้น — จะใช้ตัดสินเต็มตัวได้ก็ต่อเมื่อตัวนับทำงานมาครบ 7 วันแล้ว
2. **"ไม่มีข้อมูล" ไม่เท่ากับ "ปลอดภัย"** — `storage=unavailable` และ `overflow > 0` ถูกนับเป็น
   ไม่ผ่านทั้งคู่โดยตั้งใจ
3. **เกณฑ์ข้อที่เครื่องมือนี้แทนไม่ได้: ต้องมีคนใช้งานจริงในหน้าต่างนั้นด้วย** ถ้าไม่มีใครเปิดใช้เลย
   "0 violation" แปลว่า "ยังไม่มีใครลอง" ไม่ใช่ "ปลอดภัย"

เกณฑ์เต็มอยู่ที่ `docs/frontend-security-headers.md` §CSP monitoring ก่อน enforce

## หมายเหตุด้านความปลอดภัยของสคริปต์

`scripts/check-csp-violations.mjs` และ `scripts/csp-report-selftest.mjs` **ไม่อยู่ใน CI gate ใด ๆ**
เพราะยิง production จริง — ต้องเรียกด้วยมือเท่านั้น ส่วนเทสของมันอยู่ใน `scripts/tests/`
ซึ่ง `.githooks/pre-push` รันให้ทุกครั้งที่ push (ใช้ mock server ในเครื่อง ไม่ออกเน็ต)

token อ่านจาก environment variable เท่านั้น ไม่รับผ่าน argument — เพราะ argument โผล่ใน
process list และ shell history ของเครื่อง
