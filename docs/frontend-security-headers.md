# Frontend Security Headers & Cache Policy (issue #113 — ระยะที่ 1)

อัปเดต: 2026-08-15

## Deploy paths และที่ที่ headers ถูกประกาศ

| Path | ใช้ตอน | Headers ประกาศที่ |
|---|---|---|
| Render static site (`smart-port.onrender.com`) | **production** | `render.yaml` → `headers:` (ไม่ใช่ nginx.conf!) |
| Docker/Nginx (`localhost:8081`) | local/compose | `frontend/nginx.conf` |
| Vite dev (`localhost:5174`) | dev | ไม่มี security headers (ไม่เป็นไร — dev only) |

บทเรียน: repo เคยมี headers เฉพาะใน `nginx.conf` ซึ่ง production ไม่ได้ใช้เลย
เพราะ Render static site ไม่รัน nginx → ต้องประกาศใน blueprint ด้วยเสมอ

## Header set ที่ตกลง

| Header | ค่า | หมายเหตุ |
|---|---|---|
| `Content-Security-Policy-Report-Only` (render.yaml) / `Content-Security-Policy` (nginx) | ดูข้างล่าง | Render เริ่ม report-only เพื่อ inventory; nginx enforce เลย |
| `X-Frame-Options` | `DENY` | + `frame-ancestors 'none'` ใน CSP |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | |
| `Permissions-Policy` | `camera=(), geolocation=(), microphone=(), payment=()` | |
| `X-Content-Type-Options` | `nosniff` | |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | render.yaml เท่านั้น (nginx local เป็น http) |

### CSP

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com;
img-src 'self' data:;
connect-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
report-uri /api/csp-report     ← เฉพาะ render.yaml (report-only phase)
```

เหตุผลแต่ละ allowance:
- `style-src 'unsafe-inline'` — Vue runtime set inline style attribute ผ่าน `:style`
- `https://fonts.googleapis.com` / `fonts.gstatic.com` — Noto Sans Thai (Google Fonts ใน index.html)
- `img-src data:` — รองรับ data-URI thumbnail เล็ก ๆ
- `connect-src 'self'` พอเพราะ `/api/*` ถูก rewrite ฝั่ง server ไป backend (same-origin ในสายตา browser)

**ไม่อนุญาต** `unsafe-eval`, wildcard scheme (`http: https:`), หรือ `blob:` ใน default-src อีกต่อไป

## Cache behavior (app shell) — decision

- **Shell (`index.html`, path อื่น ๆ):** `Cache-Control: no-cache` (render.yaml) /
  `no-store` (nginx) — revalidate ทุกครั้ง กัน stale shell ที่อ้างอิง hashed chunk ที่หายไปแล้ว
- **Hashed assets (`/assets/*`):** `public, max-age=31536000, immutable` — เนื้อหาผูกกับ
  hash ในชื่อไฟล์ เปลี่ยนเมื่อไหร่ URL เปลี่ยนเมื่อนั้น
- ข้อมูล auth ไม่เคยถูก cache (มาทาง `/api/*` ของ backend)

## CSP monitoring ก่อน enforce

1. report-only phase: browser ส่ง violation ไป `POST /api/csp-report` (public, ไม่เก็บ body —
   log เฉพาะ directive + host ของ blocked URI ผ่าน `error_log`) ดูได้จาก Render log
2. เกณฑ์ promote เป็น enforce: Render log ไม่มี violation จากระบบจริง ≥ 7 วัน
   (violation จาก extension ของ user เช่น `chrome-extension:` ตัดทิ้งได้)
3. วิธี enforce: ใน `render.yaml` เปลี่ยน key `Content-Security-Policy-Report-Only`
   เป็น `Content-Security-Policy` (ค่าเดิม ตัด `report-uri` หรือไว้ต่อก็ได้)
   แล้วอัปเดตเทส `securityHeaders.test.js`

## การทดสอบ

- `frontend/src/__tests__/securityHeaders.test.js` — assert header set ข้างต้นในทั้ง
  render.yaml และ nginx.conf กัน drift/regression
- ตรวจจากภายนอกหลัง deploy:
  ```bash
  curl -sI https://smart-port.onrender.com/ | grep -i "content-security\|x-frame\|referrer\|permissions\|strict-transport"
  ```

## Follow-up ที่เหลือของ issue #113 (แยก PR)

**ลดการอ่าน token ผ่าน JavaScript** — ปัจจุบัน access/refresh/CSRF token อยู่ใน
`localStorage` (`frontend/src/stores/auth.js`) ซึ่ง XSS เดียวอ่านได้ทั้งหมด แผนคือย้าย
refresh token ไป Secure/HttpOnly/SameSite cookie + เก็บ access token ใน memory
ต้องทำแยกเพราะแตะ:
- backend `routes/auth.php` (Set-Cookie ใน login/refresh/logout, อ่าน refresh จาก cookie)
- CSRF design ใหม่หลัง cookie transition (double-submit → SameSite-based หรือ token ผูก session)
- multi-tab behavior + browser regression suite ด้วยบัญชีทดสอบที่ไม่ใช่ production
