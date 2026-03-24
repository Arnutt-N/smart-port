# Smart Port Session Summary

- Agent model: Codex (GPT-5)
- Timestamp: 2026-03-24 11:51:55 Asia/Bangkok
- Repository: `d:\hrProject\smart-port`
- Branch: `main`

## Executive Summary

Session นี้เริ่มจากการตรวจเช็กต่อว่าปัญหา production ที่วิเคราะห์ไว้ก่อนหน้า ได้แก่ `ล็อกอินช้ามาก` และ `ข้อมูลแสดงไม่เหมือน local` ได้ถูกแก้แล้วครบหรือยัง จากการตรวจโค้ดบน `main` และ git history พบว่าแกนของปัญหาหลักถูกแก้ไปแล้วในหลาย commit ก่อนหน้า โดยเฉพาะ lazy DB connection, dashboard aggregation, fallback สำหรับ `vw_probation_dashboard`, และการแก้ `servant_id` vs `personnel_id`

หลังจากนั้นมีการยืนยันจากการตรวจสอบล่าสุดบน production ว่า `ล็อกอินเร็วแล้ว` และ `จำนวนข้อมูลตรงกับ local แล้ว` แต่ยังพบปัญหาใหม่คือ `ข้อความภาษาไทยแสดงเป็นภาษาต่างดาว` จึงตรวจต่อด้าน encoding/charset และแก้ที่ชั้นการตอบ response และ web server config ทั้ง frontend และ backend

สุดท้ายมีการ commit และ push การแก้ UTF-8/charset ขึ้น `origin/main` เรียบร้อยแล้วใน commit `994aab3` และสรุปว่าต้อง redeploy ทั้ง `frontend` และ `backend` บน Render เพื่อให้การแก้นี้มีผลจริงบน production

## What Was Verified

### 1. Verification of previously analyzed production issues

ตรวจสอบแล้วว่า fix สำคัญจากรอบก่อนหน้าอยู่ในโค้ดปัจจุบัน:

- `32ea2b5` `fix: lazy DB connection + dashboard/probation view fallback for TiDB`
- `4d516fd` `fix: personnel ID mismatch + summary from full dataset`
- `7d2f75f` `perf: aggregate candidate totals in dashboard endpoint`

สิ่งที่ยืนยันได้จากโค้ด:

- login route ไม่บังคับ connect DB ก่อนแล้ว
- dashboard จากเดิมหลาย request ลดเหลือ request เดียว
- probation/dashboard มี fallback เมื่อ `vw_probation_dashboard` ใช้งานบน TiDB ไม่ได้
- supportive/diverse/equivalence เปลี่ยนไปใช้ `/personnel` และ `personnel_id` แล้ว

ข้อสรุป ณ จุดนั้น:

- ปัญหา `login ช้า` ถูกแก้ที่ชั้นโค้ดแล้ว
- ปัญหา `ข้อมูลไม่ตรง local` ถูกแก้ไปมากแล้ว
- ยังมีจุดค้างบางส่วน เช่น summary ในหน้า equivalence และความเสี่ยงเรื่อง deploy/schema จริงบน production

### 2. Production status update from latest user verification

ผู้ใช้ยืนยันล่าสุดว่า:

- production login เร็วแล้ว
- จำนวนข้อมูลที่แสดงเท่ากับ local แล้ว
- ปัญหาที่เหลือคือภาษาไทยแสดงผิด encoding

## UTF-8 / Encoding Investigation

### Findings

ตรวจพบว่า source file หลักหลายไฟล์ใน frontend ยังเก็บข้อความภาษาไทยเป็น UTF-8 ปกติ เช่น:

- `frontend/index.html`
- `frontend/src/pages/LoginPage.vue`
- `frontend/src/pages/DashboardPage.vue`
- `frontend/src/components/AppSidebar.vue`

จึงตีความได้ว่าปัญหาที่ production ไม่ได้มาจาก source code ภาษาไทยเสียทั้งระบบ แต่มีแนวโน้มสูงว่าเกิดจากการเสิร์ฟ response โดยไม่ประกาศ charset ให้ชัดเจนในบางชั้นของ stack

### Fixes applied in this session

แก้ไขเพื่อบังคับ UTF-8 ชัดเจนใน production ดังนี้:

- `frontend/nginx.conf`
  - เพิ่ม `charset utf-8;`
  - เพิ่ม `charset_types` สำหรับ HTML/CSS/JS/JSON/XML/SVG
- `backend/api.php`
  - เปลี่ยน header เป็น `Content-Type: application/json; charset=UTF-8`
- `backend/config.php`
  - เปลี่ยน header เป็น `Content-Type: application/json; charset=UTF-8`
- `backend/index.php`
  - เปลี่ยน header เป็น `Content-Type: application/json; charset=UTF-8`
- `backend/Dockerfile`
  - เพิ่ม Apache `AddDefaultCharset UTF-8`
  - เพิ่ม PHP `default_charset = "UTF-8"`

## Validation Performed

### Successful validation

- รัน `npm run build` ใน `frontend/` ผ่านเรียบร้อยหลังแก้ config

### Validation limitation

- ไม่สามารถรัน `php -l` ได้จากเครื่องนี้ เพราะไม่มี `php` CLI ใน environment ปัจจุบัน
- ยังไม่ได้ตรวจ live response headers จาก Render production โดยตรงใน session นี้

## Git Actions Completed

- Commit created:
  - `994aab3` `fix: enforce utf-8 charset for production responses`
- Push completed:
  - `origin/main`

ไฟล์ที่รวมอยู่ใน commit นี้:

- `frontend/nginx.conf`
- `backend/api.php`
- `backend/config.php`
- `backend/index.php`
- `backend/Dockerfile`

หมายเหตุ:

- มีไฟล์ untracked จำนวนมากใน workspace แต่ไม่ได้ถูกนำเข้า commit นี้
- commit นี้จำกัดเฉพาะการแก้เรื่อง UTF-8/charset เท่านั้น

## Deployment Impact

การแก้นี้จะยังไม่ส่งผลบน production จนกว่าจะ redeploy ใหม่ทั้งสอง service:

- `frontend`
  - เพราะแก้ `frontend/nginx.conf`
- `backend`
  - เพราะแก้ทั้ง PHP headers และ `backend/Dockerfile`

ข้อสรุป deployment:

- ต้อง redeploy ทั้ง `frontend` และ `backend` บน Render

## Current Status

สถานะล่าสุดของปัญหา production หลัง session นี้:

- `Login slow on production`: แก้แล้ว
- `Production counts differ from local`: แก้แล้วตามผลตรวจล่าสุดของผู้ใช้
- `Thai text rendered as mojibake`: แก้ในโค้ดแล้ว แต่ยังต้อง redeploy เพื่อยืนยันผล

## Remaining Risks / Next Checks

ถ้าหลัง redeploy แล้วภาษาไทยยังเพี้ยนอยู่ ให้ตรวจต่อในลำดับนี้:

1. ตรวจ response headers จริงจาก Render ว่า frontend/backend ส่ง `charset=UTF-8` แล้วหรือไม่
2. ตรวจข้อความภาษาไทยที่มาจากฐานข้อมูล TiDB ว่าถูก import แบบ encoding ผิดหรือไม่
3. ตรวจเฉพาะ field ที่มาจาก DB ว่าเพี้ยนตั้งแต่ data layer หรือเพี้ยนเฉพาะ static UI

อีกจุดค้างจากการตรวจรอบก่อนหน้า:

- หน้า `Equivalence` ยังมีโอกาสคำนวณ stat cards จาก current page rows แทน full dataset ซึ่งเป็นคนละประเด็นกับ encoding และยังไม่ได้แก้ใน session นี้

## Recommended Immediate Next Step

1. Redeploy `smartport-frontend`
2. Redeploy `smartport-backend`
3. เปิด production แล้วตรวจภาษาไทยในหน้า login, dashboard, sidebar, และข้อความที่มาจาก API
4. ถ้ายังเพี้ยน ให้ trace ต่อว่ามาจาก static bundle หรือจากข้อมูลใน TiDB

## Post-Session Addendum

หลังจากสรุป session นี้ มีการอ่านรายงานเพิ่มจาก Claude ที่ไฟล์ `project-log-md/claude-code/2026-03-24_12-30_claude-opus-4.6_tidb-encoding-fix.md` และพบว่าต้นตอของภาษาไทยเพี้ยนบน production ถูกระบุชัดเจนแล้วว่าอยู่ที่ `data ใน TiDB ถูก double-encode ตอน import` ไม่ใช่ที่ response headers เพียงอย่างเดียว

สาระสำคัญของ addendum นี้:

- static UI text และ response headers ของ frontend/backend ถูกต้องแล้ว
- ข้อความภาษาไทยที่เพี้ยนมาจากข้อมูลใน TiDB โดยตรง
- root cause คือขั้นตอน import ก่อนหน้าไม่ได้ระบุ `--default-character-set=utf8mb4`
- การแก้จริงบน production ทำโดย re-export และ re-import ข้อมูลด้วย `utf8mb4`
- ไม่มี code change เพิ่มจากรายงานนั้น

ผลต่อข้อสรุปเดิม:

- commit `994aab3` ยังคงมีประโยชน์ในฐานะ hardening เรื่อง charset ของ response
- แต่ root cause ของ `Thai text rendered as mojibake` ตัวจริงคือ data import workflow ของ TiDB
- สถานะล่าสุดควรถือว่า:
  - `Login slow on production`: แก้แล้ว
  - `Production counts differ from local`: แก้แล้ว
  - `Thai text rendered as mojibake`: แก้แล้วเชิงปฏิบัติการผ่านการ re-import data ด้วย `utf8mb4`

Decision on `database/reimport-data.sql`:

- ไม่ควร commit ไฟล์นี้เป็น source-of-truth
- ควรถือเป็น generated repair artifact สำหรับงาน operational ราย environment
- ได้เพิ่ม rule ใน `.gitignore` และเพิ่มหมายเหตุใน `docs/render-tidb-production.md` แล้ว
