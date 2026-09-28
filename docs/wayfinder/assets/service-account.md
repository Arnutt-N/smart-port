# Service Account — บัญชีกลาง viewer + credential + refresh

Asset ของ ticket `service-account` (แผนที่: `docs/wayfinder/smart-port-mcp.md`)
งาน Task ใบนี้ทำจริงบน local dev แล้ว — ข้างล่างคือข้อเท็จจริงที่ tickets
ถัดไปต้องใช้ (ไม่มี secret ในไฟล์นี้ — รหัสผ่านส่งให้ในแช็ตครั้งเดียว)

## 1. บัญชี local (provision แล้ว 2026-09-26)

- username: `sp_mcp_service` · user_id: `2466` · role: `viewer`
- `is_active = 1`, `must_change_password = 0` (ต้องเป็น 0 เสมอ —
  เป็น 1 จะโดน 403 ทุก endpoint ตาม `api.php:162-171`)
- ใช้ได้เฉพาะ DB local dev (`docker compose` service `db`) — ไม่ใช่บัญชี production
- รหัสผ่าน: ส่งในแช็ต session นี้ครั้งเดียว → เอาไปใส่ Desktop config env
  ตามข้อ 2 ห้ามเข้า repo/log (มติ `pii-policy`)

## 2. สัญญา env ฉบับจริง (ให้ `prototype-stdio` ใช้)

```text
SMARTPORT_API_URL=https://smart-port.onrender.com/api   # local: http://localhost:8000/api
SP_SERVICE_USERNAME=sp_mcp_service
SP_SERVICE_PASSWORD=<จากแช็ต — local เท่านั้น>
```

ที่เก็บ: `env` ใน `claude_desktop_config.json` ของแต่ละเครื่อง HR
(รูปเต็มดู [mcp-stack](mcp-stack.md)) — ต้นแบบ `.env.example` มีได้แค่ชื่อ
ตัวแปร ห้ามมีค่า

## 3. Refresh flow ที่ prototype ต้องทำตาม (ยืนยันจากโค้ด + ทดสอบจริง)

- Login: `POST /auth/login {username, password}` → ได้ cookies
  `sp_access` (path `/`, อายุ 1 ชม.) + `sp_refresh` (path `/api/auth`,
  อายุ 30 วัน) — cookie jar ต้องเคารพ path (`auth.php:164-165,217-221`)
- เรียก API ปกติ: แนบ `sp_access` อัตโนมัติผ่าน jar; **ไม่ต้องใช้ CSRF header**
  (บังคับเฉพาะ POST/PUT/DELETE ที่ไม่ใช่ login/refresh/logout — `api.php:154-159`)
- proactive refresh: ถอด `exp` จาก JWT แล้ว refresh ก่อนหมดอายุ (~นาทีที่ 50)
  ด้วย `POST /auth/refresh` (jar ส่ง `sp_refresh` ให้เองเพราะ path ตรง)
- reactive: เจอ 401 → refresh ครั้งเดียวแล้ว retry คำขอเดิมครั้งเดียว
- refresh มี rotation + reuse detection (`auth.php` routes `refreshSession`):
  ใช้ใบเก่าซ้ำหลัง grace 10 วินาที = kill-all ทุก session → ต้องทำ
  single-flight (ห้าม refresh ซ้อนกัน) และห้าม retry login แบบ loop
  (ผิด 5 ครั้ง/15 นาทีต่อ username = 429 — `auth.php:421-425`)
- เปลี่ยนรหัสบัญชีกลาง = revoke ทุก refresh token ทันที → ทุกเครื่อง HR
  ต้อง login ใหม่พร้อมกัน (วางแผน rotation ใน `rollout`)

## 4. ผลทดสอบ local (2026-09-26, backend `localhost:8000`)

`login` role=viewer must_change=False · cookies `sp_access,sp_refresh` ·
`GET /auth/me` id=2466 role=viewer · `GET /dashboard` success
(total personnel=22 — viewer read ผ่าน) · `POST /auth/refresh` rotation สำเร็จ ·
`POST /auth/logout` success — ทั้งหมดผ่าน ไม่มีข้อผิดพลาด

## 5. Checklist บัญชี production (release owner ทำ — ไม่ใช่ session นี้)

1. สร้าง user role `viewer` (`is_active=1`, `must_change_password=0`)
   บน production DB ด้วยรหัสผ่านใหม่ (สุ่ม ≥ 24 ตัวอักษร ครบ 4 กลุ่ม)
2. ยิง `login` → `auth/me` → `dashboard` → `refresh` → `logout`
   ครบเหมือนข้อ 4 ผ่าน production URL
3. ส่ง username/password ให้ผู้ดูแลเครื่อง HR ผ่านช่องทางปลอดภัย
   (ห้ามแช็ตกลุ่ม/อีเมลธรรมดา)
4. กรอกลง Desktop config env ทุกเครื่อง แล้วลบสำเนารหัสผ่านทิ้ง
5. บันทึกวัน provision + เจ้าของบัญชีไว้ในเอกสาร release (ไม่มีรหัส)
