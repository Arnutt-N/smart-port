# Auth Cookie Client Migration (D3)

สัญญาณหลัง cutover D3: API ที่มีการป้องกันไม่รับ `Authorization: Bearer` อีกต่อไป —
ทุก request ยืนยันตัวตนผ่าน session cookie (`sp_access`) และ request ที่เปลี่ยนข้อมูล
ต้องแนบ `X-CSRF-Token`

## สัญญาณที่ client ต้องทำ

1. **protected calls ใช้ cookies** — ส่ง `Cookie: sp_access=...` อัตโนมัติ (httpOnly;
   client ที่เป็น browser ไม่ต้องอ่านค่าเอง)
2. **state-changing calls (POST/PUT/PATCH/DELETE) แนบ `X-CSRF-Token`** — ค่าจาก
   field `csrf_token` ใน response body ของ login/refresh (คู่กับ claim `csrf` ใน JWT;
   backend เทียบด้วย timing-safe compare ที่ `backend/middleware/csrf.php`)
3. **response body ของ login/refresh มี `csrf_token`** — เก็บไว้ใช้แนบ header แล้ว
   **ห้าม log หรือแสดง** ค่า `token`, `refresh_token`, `csrf_token` เด็ดขาด
   (field เหล่านี้เป็น credential — cookie ทำหน้าที่เป็น transport แล้ว)
4. **refresh/logout ต้องเรียกเส้นทาง `/api/auth/*`** — cookie `sp_refresh` ตั้ง
   `Path=/api/auth` จึงถูกส่งเฉพาะเส้นทางขึ้นต้นด้วย `/api/auth` เท่านั้น
   (`POST /api/auth/refresh`, `POST /api/auth/logout`)
5. **CORS** — browser client ข้าม origin ต้องอยู่ใน `ALLOWED_ORIGINS` allowlist
   และใช้ `credentials: 'include'` / `withCredentials=true` — backend ส่ง
   `Access-Control-Allow-Credentials: true` เฉพาะ origin ที่อนุญาต
   (ดู `backend/api.php` F30) และ `Access-Control-Allow-Headers` รองรับ
   `X-CSRF-Token` อยู่แล้ว
6. **same-site** — cookie เป็น `SameSite=Lax` + `Secure` (เมื่อผ่าน HTTPS) —
   browser client ที่อยู่คนละ site ต้องใช้ same-site proxy หรือรอ
   security review แยกต่างหาก ห้ามขยายเป็น `SameSite=None` เอง
7. **ห้าม fallback กลับ Bearer** — request ที่มีแต่ `Authorization` ไม่มี cookie
   จะได้ 401 (D3 ตัดสินใจไม่มี compatibility fallback)

## Canonical sequence (ห้าม print ค่า credential ลง transcript/evidence)

```bash
# 1) login — cookie ถูกเก็บใน jar, csrf_token อยู่ใน body
curl -c jar.txt -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<test-account>","password":"<test-password>"}'

# 2) authenticated GET — sp_access ถูกส่งอัตโนมัติจาก jar
curl -b jar.txt http://127.0.0.1:8000/api/auth/me

# 3) CSRF-protected write — แนบ X-CSRF-Token จาก csrf_token ของขั้นที่ 1/refresh
curl -b jar.txt -X POST http://127.0.0.1:8000/api/multiplier \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <csrf-token-from-login-body>" \
  -d '{ ... }'

# 4) refresh — ต้องอยู่ใต้ /api/auth (sp_refresh Path=/api/auth)
curl -b jar.txt -c jar.txt -X POST http://127.0.0.1:8000/api/auth/refresh

# 5) logout — ล้าง session ที่ server และ clear ทั้งคู่ cookie
curl -b jar.txt -c jar.txt -X POST http://127.0.0.1:8000/api/auth/logout
```

Node scripts ใน repo ใช้ `scripts/lib/authCookieClient.mjs` แทนการเขียน jar เอง:
`createAuthCookieClient(baseUrl)` คืน `api(method, path, { body })` ที่แนบ cookie +
`X-CSRF-Token` ให้อัตโนมัติ และตัด `token`/`refresh_token`/`csrf_token` ออกจาก JSON
ที่ return เพื่อกันหลุด log

## In-repo client inventory (D3 follow-up นี้)

| Client | ประเภท | ที่อยู่ | สถานะ migration |
|---|---|---|---|
| Live UAT runner | Node script (server-to-server) | `scripts/uat-multiplier-live-api.mjs` | done — cookie+CSRF ผ่าน `createAuthCookieClient` |
| Smoke cleanup | Node script (server-to-server) | `scripts/cleanup-multiplier-smoke-leftover.mjs` | done — ตามข้างต้น |
| Verification examples | เอกสาร curl | `frontend/docs/multiplier_verification_report.md` (ช่วง Authentication / Screenshot Commands) | done — แปลงเป็น cookie+CSRF แล้ว; ของเดิมติดป้าย pre-D3 |

## External client register (release owner เท่านั้น)

รายการ client ภายนอก (origin/type, cookie-flow readiness, migration result) มี
canonical system/location **อยู่นอก repository นี้** และต้อง supply โดย release owner

| Client (external) | Owner/team | Origin/type | Cookie-ready | Migration result |
|---|---|---|---|---|
| _ยังไม่ได้รับ register จาก release owner_ | — | — | — | **unverified** |

> กฎ: ถ้า register ยังมาไม่ถึง → บันทึกสถานะ `unverified` และ **block D3 cutover
> / completion** — ห้ามอนุมานว่า "ไม่พบ client ภายนอก"

## Rollout communication checklist

- [ ] แจ้งผู้ใช้/ทีมว่า session เดิมใช้ต่อไม่ได้หลัง D6 (forced re-login) — ดู T6
- [ ] ยืนยัน release versions ของ frontend/backend ตรงกันก่อน smoke
- [ ] login → `/auth/me` → protected write ที่ควบคุมได้ → refresh → logout ด้วย
      authorized test account — ผ่านหมด
- [ ] Bearer-only protected request ได้ 401
- [ ] ทุก external client มี owner + migration result ในตาราง register
- [ ] บันทึกผล smoke โดย **ไม่ใส่ค่า cookie/token/CSRF** ใน output หรือ evidence

## Troubleshooting

| อาการ | มูลเหตุ | วิธีตรวจ |
|---|---|---|
| login 200 แต่ call ถัดไป 401 | client ไม่ได้เก็บส่ง `sp_access` (jar/path/scheme) | ตรวจว่า cookie ถูกส่งทุก request และ Path=`/` |
| refresh ได้ 401 ทั้งที่เพิ่ง login | เรียกเส้นทางไม่ใช่ `/api/auth/*` → `sp_refresh` ไม่ถูกส่ง | ตรวจ path เริ่มต้นด้วย `/api/auth` |
| write ได้ 403 `CSRF token validation failed` | ไม่ได้แนบ `X-CSRF-Token` หรือค่าไม่ตรง csrf ของ JWT ตัวล่าสุด | ใช้ `csrf_token` จาก login/refresh ล่าสุด |
| browser ข้าม origin ไม่ส่ง cookie | ไม่ได้ `credentials: 'include'` หรือ origin ไม่ได้อยู่ใน allowlist | ตรวจ `ALLOWED_ORIGINS` + credentials mode |
| ได้ 401 ทั้งที่ cookie ครบ | access JWT หมดอายุ (1 ชม.) — ต้อง refresh ก่อน | `POST /api/auth/refresh` แล้ว retry |
