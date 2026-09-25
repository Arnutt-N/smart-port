# Smart Port — ระบบสมุดพก

เอกสารภาพรวมผลิตภัณฑ์สำหรับคนที่ยังไม่ได้อ่านโค้ด.
อัปเดตให้ตรงโค้ด ณ 2026-09-25.

อ่านตามลำดับนี้ อย่าข้ามไปเอกสารที่ลึกกว่าถ้ายังไม่ได้คำตอบจากชั้นบน:

1. ไฟล์นี้ — ภาพรวมผลิตภัณฑ์ โมดูลที่มีจริง สิ่งที่ตั้งใจไม่มี
2. `CONTEXT.md` — คำศัพท์โดเมนและกติกาที่ห้ามตีความเอง
3. `AGENTS.md` — โครงสร้าง repo, คำสั่งรัน, สถาปัตยกรรม, กติกาสำหรับ agent
4. `docs/adr/` — เหตุผลของการตัดสินใจที่ย้อนกลับยาก รายการด้านล่าง
5. `DESIGN.md` — โทเค็นสี ตัวอักษร ระยะห่าง เฉพาะงาน UI

`CLAUDE.md` เป็นตัวชี้ไป `AGENTS.md` เท่านั้น อย่าอ่านซ้ำ.

เอกสารนี้ไม่ใช่ spec ของงานที่ยังไม่ทำ.
ถ้าโค้ดกับเอกสารนี้ขัดกัน ให้เชื่อโค้ด แล้วแก้เอกสารนี้.

## โครงการ

**Smart Port (ระบบสมุดพก)** เป็นระบบบริหารงานบุคคล (HRIS) ของสำนักงานปลัดกระทรวงยุติธรรม.
ใช้โดย HR และผู้บริหาร เพื่อติดตามความก้าวหน้าในสายอาชีพของข้าราชการ.

สิ่งที่ระบบทำให้ได้จริงวันนี้:

- ดูบัญชีผู้มีคุณสมบัติเลื่อนระดับแบบคำนวณสด
- ติดตามการพ้นทดลองปฏิบัติราชการ
- นับเวลาเกื้อกูล ทวีคูณ แตกต่าง และเทียบตำแหน่ง
- ค้นหา ดู สร้าง และปิดใช้งานข้อมูลบุคลากร

ภาษาหลักของ UI, ความเห็นในโค้ด, และข้อมูลในฐานข้อมูลคือภาษาไทย.
ปีที่ผู้ใช้เห็นเป็น พ.ศ. เสมอ. คอลัมน์วันที่ในฐานข้อมูลเก็บเป็น ค.ศ. แล้วแปลงตอนแสดงผล.

## สิ่งที่ระบบไม่มี

ตั้งใจไม่ทำ และไม่มี counterpart ในโค้ด.
รายการโดเมนที่ยืนยันแล้วอยู่ใน `CONTEXT.md` หัวข้อ "ขอบเขตที่ยังไม่ทำ":

- ระบบลา
- วินัย / สอบสวน
- เงินเดือนและค่าตอบแทน
- KPI / ประเมินผล

ไม่มีในโค้ด และไม่ได้อยู่ในขอบเขตนั้นด้วย: 2FA, SSO, PWA, Elasticsearch, WebSocket, AI/ML.

อย่านำรายการเหล่านี้ไปเขียนในสไลด์หรือเอกสารภายนอกว่าเป็นฟีเจอร์ที่มีอยู่.

## โมดูลที่ใช้งานอยู่

เมนูจริงอยู่ใน `frontend/src/components/AppSidebar.vue`.
เส้นทางจริงอยู่ใน `frontend/src/router/index.js`.
คำจำกัดความของแต่ละโมดูลอยู่ใน `CONTEXT.md` ตาราง "คำศัพท์หลัก".

### ภาพรวม

| เมนู | เส้นทาง | ทำอะไร |
|---|---|---|
| Dashboard | `/dashboard` | ภาพรวมองค์กร |
| ข้อมูลบุคลากร | `/personnel` | มาสเตอร์คน: ค้นหา ดู สร้าง แก้ไข ปิดใช้งาน |
| โปรไฟล์ career | `/profile/:id` | มุมมอง career ของคนหนึ่ง พร้อมทางลัดไปรายการนับเวลา |
| โปรไฟล์บัญชี | `/profile` | บัญชีผู้ใช้ที่ล็อกอินอยู่ ไม่ใช่มาสเตอร์บุคลากร |

### บัญชีเลื่อนระดับและทดลองราชการ

| เมนู | เส้นทาง | ทำอะไร |
|---|---|---|
| Candidate Lists | `/candidates/:section` | บัญชีผู้ครบเกณฑ์เลื่อนระดับ คำนวณสดทุกครั้ง |
| พ้นทดลองปฏิบัติราชการ | `/probation-end` | ติดตามข้าราชการบรรจุใหม่จนพ้นทดลอง |

ส่วนของ Candidate Lists: `overview`, `general`, `academic`, `support`, `management`.
แท่งระดับตำแหน่ง: `K1–K5` วิชาการ, `M1–M2` อำนวยการ, `S1–S2` บริหาร, `O1–O3` ทั่วไป.

ใกล้เกณฑ์ของบัญชีรายชื่อ = เหลือ 1–90 วัน.
ใกล้ครบกำหนดของทดลองราชการ = เหลือ 0–30 วัน (วันครบกำหนดแสดงเป็น READY).
สองค่านี้ตั้งใจคนละค่า ห้ามใช้ตัวเลขเดียวกันทั้งสองหน้า.

### การนับเวลา

| เมนู | เส้นทาง | ความหมาย |
|---|---|---|
| การนับเกื้อกูล | `/time-counting` | เวลาในสายงานอื่นที่นับให้บางส่วนตามอัตราส่วน |
| การนับทวีคูณ | `/time-multiplier` | เวลาราชการในพื้นที่พิเศษที่นับเป็น 2 เท่า |
| การนับแตกต่าง | `/time-difference` | ประสบการณ์ที่ต่างจากเดิมอย่างน้อย 3 มิติ |
| การเทียบตำแหน่ง | `/position-compare` | คำขอเทียบตำแหน่ง อนุมัติได้เฉพาะ admin |

โฟลหลักของสี่หน้านี้คือเพิ่มรายการในโมดอลครั้งเดียว: เลือกคนจาก typeahead แล้วกรอกรายการ.
ไม่สร้างคนใหม่ในโมดอล. คนที่ยังไม่มีในระบบให้ admin สร้างที่ข้อมูลบุคลากรก่อน.
เหตุผลของการแยกมาสเตอร์ออกจากโฟลรายการเวลาอยู่ใน `docs/adr/0004-personnel-master-and-time-entry-flow.md`.

การนับวันของรายการเวลาใช้ฐาน 365 วัน/ปี และ 30 วัน/เดือน ไม่คิด leap year.
เกณฑ์เลื่อนระดับใช้ปีปฏิทิน (`DATE_ADD ... YEAR`) ซึ่งคิด leap year.
สองสูตรนี้ต่างกันโดยตั้งใจ. สัญญาเต็มอยู่ใน `CONTEXT.md` หัวข้อ "กติกาของโดเมนที่ต้องระวัง".

### รายงานและผลงาน

| เมนู | เส้นทาง |
|---|---|
| เครื่องราชอิสริยาภรณ์ | `/royal-decorations` |
| รายงานผู้เกษียณ | `/retirement-report` |
| รางวัล / ความดีความชอบ | `/awards` |
| ผลงานและข้อเสนอ | `/work-results` |
| การวิเคราะห์ข้อมูล | `/analytics` |

ปีที่ได้รับเครื่องราชฯ (`received_year`) เก็บเป็น พ.ศ. ในฐานข้อมูล (ช่วง 2400–2700).

### ผู้ดูแลระบบ

เมนูเหล่านี้ซ่อนจากผู้ใช้ทั่วไป (`requiresAdmin`). การซ่อนเมนูไม่ใช่การควบคุมสิทธิ์ API.

| เมนู | เส้นทาง | หมายเหตุ |
|---|---|---|
| การจัดการงาน | `/admin` | |
| นำเข้าข้อมูล | `/import` | Excel ทั้งไฟล์ ถ้าเลขบัตรซ้ำจะปฏิเสธทั้งไฟล์ |
| แปลงเอกสาร PDF | `/ocr` | ต้องตั้งค่าบริการ OCR บน Render ก่อนใช้จริง |
| จัดการผู้ใช้ | `/users` | |
| ประวัติการเปลี่ยนแปลง | `/audit` | |
| จัดการพื้นที่พิเศษ | `/settings/special-areas` | อ้างอิงโดยการนับทวีคูณ |
| สิทธิ์ระบบ | `/settings/permissions` | เฉพาะ superadmin |
| ตั้งค่าบัญชี | `/settings/account` | บัญชีตัวเองแก้ username / รหัสผ่านได้ |

## สิทธิ์

บทบาท: `superadmin`, `admin`, `operator`, `viewer`.
ค่าเริ่มต้นอยู่ใน `backend/authz.php`. ตาราง `role_permission_overrides` ทับค่า default ของ admin, operator, viewer ได้. superadmin ทับไม่ได้.
กติกาสิทธิ์แบบย่ออยู่ใน `CONTEXT.md` หัวข้อ "สิทธิ์ตาม role".
เหตุผลที่แยก superadmin และให้ทับค่าด้วยฐานข้อมูลอยู่ใน `docs/adr/0003-superadmin-permission-overrides.md`.

| บทบาท | สิทธิ์โดยย่อ |
|---|---|
| superadmin | ทำได้ทุกอย่าง รวมตั้งค่าเมทริกซ์สิทธิ์ |
| admin | ทำได้ทุกอย่างตาม default ยกเว้นหน้าตั้งค่าสิทธิ์ระบบ |
| operator | อ่านได้กว้าง สร้าง/แก้รายการนับเวลาได้ ลบไม่ได้ อนุมัติเทียบตำแหน่งไม่ได้ |
| viewer | อ่านอย่างเดียว: candidates, probation, personnel, dashboard, multiplier, profile |

มาสเตอร์บุคลากร สร้าง แก้ไข และปิดใช้งานได้เฉพาะ admin / superadmin.
เลิกใช้คนด้วย `is_active = 0` ไม่ลบแถว เพื่อให้ประวัติรายการเวลายังอ้างคนเดิมได้.

`citizen_id` เป็น natural key และเป็นข้อมูลส่วนบุคคล.
มาสเตอร์ list/detail ไม่ส่งเลขบัตรให้ operator / viewer. admin / superadmin เห็นเลขเต็ม.
ห้ามใส่เลขบัตรลง log.
หลังสร้างแล้วห้ามแก้ใน UI ปกติ. ผิดแล้วปิดใช้งานแล้วสร้างใหม่.
รายละเอียด checksum, การค้นหา, และช่องทางที่เลขบัตรซ้ำอยู่ใน `CONTEXT.md` ข้อ `citizen_id` และข้อ duplicate.

เลขบัตรซ้ำคนละความหมายตามช่องทาง ห้ามใช้พฤติกรรมเดียวกัน:

- นำเข้า Excel: ปฏิเสธทั้งไฟล์
- สร้างทีละคน: 409 ต่อรายการ
- HR sync: upsert ตามเลขบัตร เขียนทับเฉพาะคอลัมน์ที่ sync นำเข้าได้

OCR create และ awards write เป็นสิทธิ์ admin ตาม default.
ทางลัด `?create=1&personnel_id=` ไม่พรีฟิลคนที่ปิดใช้งานหรือไม่พบ.

## สถาปัตยกรรม

```
Vue 3 SPA (Vite)  --HTTPS-->  PHP API (api.php)  --PDO-->  MySQL / TiDB
```

แผนที่โฟลเดอร์และพอร์ตบริการอยู่ใน `AGENTS.md` หัวข้อ "Project Structure" และ "Service Ports".

### Frontend

- Vue 3.5, Vue Router 4, Pinia, Vite 6, Tailwind CSS 4
- กราฟ: Chart.js + vue-chartjs
- ไอคอน: lucide-vue-next (ไม่ใช้ emoji เป็นไอคอน)
- ฟอนต์: Noto Sans Thai
- หน้าจออยู่ใน `frontend/src/pages/*Page.vue`
- เรียก API ผ่าน `frontend/src/composables/useApi.js`
- dev server: `http://localhost:5174` พร็อกซี `/api` ไปพอร์ต 8000

### Backend

- PHP 8.3 ไม่มี framework. จุดเข้าเดียวคือ `backend/api.php`
- แยกตามโดเมนที่ `backend/routes/`
- JWT เป็น HMAC-SHA256 ที่เขียนเองใน `backend/auth.php` ไม่ใช้ไลบรารี JWT
- อายุ access token 1 ชั่วโมง
- เซสชันอยู่บน httpOnly cookie (`sp_access`, `sp_refresh`) ไม่ส่งใน `Authorization` และไม่เก็บโทเค็นใน `localStorage`
- `localStorage` เก็บได้แค่ `csrf_token` กับข้อมูล user ที่ไม่ใช่โทเค็น
- CSRF ฝังใน payload ของ JWT และตรวจด้วย double-submit
- dependency รันไทม์เดียวที่ยอมรับคือ `phpoffice/phpspreadsheet`
- ฐานข้อมูลผ่าน PDO + prepared statements

การตัดสินใจ "ไม่ใช้ framework" และ "JWT เขียนเอง" บันทึกใน `docs/adr/0001-no-framework-php-api.md`.

### ฐานข้อมูล

- ชื่อฐานข้อมูล: `civil_service_mgmt`
- charset: `utf8mb4`
- local: MySQL 8.0 ใน Docker พอร์ต 3306
- production: TiDB ผ่าน `database/tidb-init.sql` (bootstrap จริง เพราะ production ตั้ง `RUN_MIGRATIONS=0`)

แกนของงาน career คือตาราง `personnel`.
ตาราง `civil_servants` เป็นชุดเก่า ใช้กับรูปถ่าย / รางวัล / เครื่องราชฯ.
นิยามความต่างของสองตารางอยู่ใน `CONTEXT.md` แถว "ข้าราชการ (ระบบรูปถ่าย)".
การตัดสินใจรวมตารางอยู่ในเอกสาร local-only ใต้ `secrets/sync-foundation/` — ห้ามคัดลอกเนื้อหาออกมาที่นี่.

รูปเจ้าหน้าที่เก็บบนฐานข้อมูล ไม่เก็บบน filesystem ของ container.
เหตุผลอยู่ใน `docs/adr/0003-photo-storage-tidb-blob.md`.

อย่าถือว่า `candidate_lists`, `training_course`, `screening_list` เป็นฟีเจอร์ที่ใช้งาน.
บัญชีรายชื่อคำนวณสด. รายการตารางร่างที่ยังไม่มีโค้ดอยู่ใน `CONTEXT.md` หัวข้อ "ขอบเขตที่ยังไม่ทำ".

เพิ่ม migration ต้องแตะสามที่: `database/NN-*.sql`, DDL เดียวกันใน `database/tidb-init.sql`, และ mount ใน `docker-compose.yaml` กับ CI.
ตรวจด้วย `node scripts/validate-schema-parity.mjs`.
เหตุผลและขั้นตอนอยู่ใน `docs/adr/0002-schema-parity-gate.md` และ `AGENTS.md` หัวข้อ "Database".

## ความปลอดภัยที่มีอยู่

- ล็อกอินแล้วทุกเส้นทางในแอปต้องมีเซสชัน ยกเว้น `/login`
- รหัสผ่านใช้การแฮชของ PHP ไม่เก็บรหัสตรง
- สิทธิ์ตัดสินที่ backend เสมอ การซ่อนเมนูเป็นแค่ UI
- SQL ใช้ prepared statements
- header ความปลอดภัยของ frontend ประกาศใน `render.yaml` (CSP, HSTS, `X-Frame-Options: DENY`, nosniff)
- rate limit และ CSRF เป็น middleware ที่เรียกจาก `api.php`
- ข้อมูลที่โยงกลับฐานข้อมูลได้ถือเป็นข้อมูลลับ ห้าม commit และห้ามสรุปเนื้อหาใต้ `secrets/`
- กติกาสำหรับ agent อยู่ที่ `AGENTS.md` หัวข้อ "Security & Configuration Tips"

## การรันและดีพลอย

```bash
docker compose up -d db backend
cd frontend && npm install && npm run dev
```

| บริการ | พอร์ต |
|---|---|
| Frontend (Vite) | 5174 |
| Frontend (Docker / Nginx) | 8081 |
| Backend (Docker / Apache) | 8000 |
| MySQL | 3306 |

Production อยู่บน Render (`smart-port.onrender.com`).
Frontend เป็น static site. Backend เป็นบริการแยก.
ค่าลับตั้งบน dashboard ของ Render ไม่ใส่ใน git.

ตรวจก่อนส่งงาน: `cd frontend && npm test` และ `npm run build`.
CI ในเครื่อง: `.\scripts\ci-local.ps1`.
คำสั่ง lint, hook, และดีพลอยที่ครบกว่านี้อยู่ที่ `AGENTS.md` หัวข้อ "Build, Test, and Development Commands".

## ดัชนี ADR

ทุกไฟล์สถานะ Accepted. เลข 0002 และ 0003 ซ้ำคนละเรื่อง เปิดตามชื่อไฟล์ อย่าเปิดตามเลขอย่างเดียว.

| ไฟล์ | เรื่อง | เปิดเมื่อ |
|---|---|---|
| `docs/adr/0001-no-framework-php-api.md` | PHP ไม่มี framework, JWT เขียนเอง | จะเพิ่ม framework หรือไลบรารี JWT |
| `docs/adr/0002-schema-parity-gate.md` | `tidb-init.sql` คือ bootstrap ของ production | จะเพิ่มหรือแก้ migration |
| `docs/adr/0003-photo-storage-tidb-blob.md` | รูปเก็บบน TiDB ไม่ใช่ filesystem | จะย้ายที่เก็บรูป |
| `docs/adr/0003-superadmin-permission-overrides.md` | บทบาท superadmin และการทับสิทธิ์ด้วยฐานข้อมูล | จะเปลี่ยนเมทริกซ์สิทธิ์ |
| `docs/adr/0004-personnel-master-and-time-entry-flow.md` | แยกมาสเตอร์คนออกจากโฟลรายการนับเวลา | จะเปลี่ยนทางสร้างคนหรือเพิ่มรายการเวลา |

การรวม `civil_servants` เข้า `personnel` ไม่มี ADR ใน `docs/adr/`.
นิยามปัจจุบันอยู่ใน `CONTEXT.md`. เอกสารตัดสินใจเป็น local-only ใต้ `secrets/sync-foundation/`.

## เอกสารที่อย่าใช้แทนอันนี้

`smartport-wiki.md` รุ่นก่อน 12 ก.ค. 2025 บรรยายสแตกเป็น Vanilla JS, Material Icons, refresh token, 2FA, SSO, PWA, Elasticsearch และ AI.
ส่วนนั้นเป็นร่าง ไม่ตรงโค้ด และถูกลบออกจากไฟล์นี้แล้ว.
อย่าใช้ git history ของไฟล์นี้เป็นภาพระบบปัจจุบัน.
