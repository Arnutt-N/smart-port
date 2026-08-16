# Frontend Security Headers & Cache Policy (issue #113 — ระยะที่ 1)

อัปเดต: 2026-08-16

## Deploy paths และที่ที่ headers ถูกประกาศ

| Path | ใช้ตอน | Headers ประกาศที่ |
|---|---|---|
| Render static site (`smart-port.onrender.com`) | **production** | `render.yaml` → `headers:` (ไม่ใช่ nginx.conf!) |
| Docker/Nginx (`localhost:8081`) | local/compose | `frontend/nginx-security-headers.conf` (snippet ที่ `nginx.conf` include — Issue #126) |
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
object-src 'none';              ← Issue #125: ไม่ใช้ plugin/embed
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

## Live verification — Render Cache-Control precedence (issue #125)

**ผลตรวจ 2026-08-16 รอบที่ 2 (~10:47 UTC) หลัง merge #125 เข้า main:** auto-deploy
จาก push main ทำงานจริง (site rebuild 10:28 UTC, asset hash ใหม่) แต่ `/` และ
`/assets/*` ยังคงคืน default `Cache-Control: public, max-age=0, s-maxage=300` และ
ไม่มี header จาก render.yaml เลย → **code-push auto-deploy ไม่ re-sync blueprint
config** (ใช้ config ของ last-synced blueprint) ต้อง manual Sync จาก dashboard เท่านั้น

**ผลตรวจ 2026-08-16 รอบที่ 3 (~18:04–18:11 UTC) ด้วย `scripts/verify-live-headers.mjs`:**
ยังเป็น default เหมือนเดิมทุกจุด — `/` และ `/assets/index-B1YyXcfC.js` (ชื่อ asset
เดิมตั้งแต่รอบ 1 = ไม่มี build ใหม่หลัง 10:28 UTC) คืน `Cache-Control: public,
max-age=0, s-maxage=300` และไม่มี CSP-Report-Only / X-Frame-Options / Referrer-Policy /
Permissions-Policy หลักฐานเสริมว่า header ที่เห็นมาจาก edge layer ไม่ใช่ render.yaml:
HSTS จริงเป็น `max-age=315360000; includeSubdomains; preload` ซึ่งไม่ใช่ค่าที่ render.yaml
ประกาศ (`max-age=31536000; includeSubDomains`) และ `x-content-type-options: nosniff`
ก็มีอยู่แล้วก่อน sync — สองตัวนี้จึง**ไม่ใช่**สัญญาณว่า blueprint ถูก apply (สคริปต์
จึงถือ HSTS ค่า-ไม่-ตรงเป็น warning ไม่ใช่ fail)

**ผลตรวจรอบแรก (เช้าวันเดียวกัน):** ทั้ง `/` และ `/assets/index-B1YyXcfC.js` คืนค่า
default ของ Render และไม่มี header อื่นจาก render.yaml เลย (ไม่มี CSP-Report-Only/
X-Frame-Options ฯลฯ) ทั้งที่ site ถูก deploy ใหม่ → header จาก blueprint ยังไม่มีผลจริง
สาเหตุที่เป็นไปได้: (1) blueprint นี้ปิด auto-sync ไว้ หรือ (2) static site นี้ไม่ได้ถูก
manage โดย blueprint นี้ตั้งแต่แรก (เช่น สร้างก่อนรับ render.yaml เข้ามา) — Render ค่า
default คือ [auto-sync ทุกครั้งที่ push blueprint changes](https://render.com/docs/infrastructure-as-code)
และ [docs ของ static-site headers](https://render.com/docs/static-site-headers)
ไม่ระบุ precedence สำหรับ path pattern ที่ทับกัน จึงต้องวัดจริงเท่านั้น

**Checklist หลังทำให้ blueprint sync จริง + deploy ใหม่:**

0. ที่ Render dashboard → Blueprint: ตรวจ sync status / auto-sync setting ว่าเปิดอยู่
1. ตรวจว่า header set ออกครบ (คำสั่งเดียวกับ section "การทดสอบ" ข้างล่าง):
   ```bash
   curl -sI https://smart-port.onrender.com/ | grep -i "content-security\|x-frame\|referrer\|permissions\|strict-transport"
   ```
2. ตรวจ Cache-Control precedence:
   ```bash
   curl -sI https://smart-port.onrender.com/ | grep -i cache-control
   # ต้องได้: no-cache
   curl -sI https://smart-port.onrender.com/assets/index-B1YyXcfC.js | grep -i cache-control
   # (แทนชื่อ asset ปัจจุบันจาก <script src> ในหน้าเว็บ) ต้องได้: public, max-age=31536000, immutable
   ```

- ถ้า step 1 ยังไม่มี header เลยแม้ sync แล้ว → ตรวจว่า static site ถูก manage โดย
  blueprint นี้จริงหรือไม่ (dashboard ของ service ต้องชี้มาที่ render.yaml นี้)
- ถ้า `/assets/*` ได้ค่าถูกต้อง → บันทึกผลจริงแทน section นี้, ปิดประเด็น precedence
- ถ้า `no-cache` ชนะบน assets (worst case ของ issue) → restructure: ยกเลิกกฎ `/*`
  แล้วตั้ง `no-cache` เฉพาะ path เอกสาร (หรือแนวทางอื่นตาม behavior ที่วัดได้)

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
- `scripts/verify-live-headers.mjs` — external smoke gate (issue #131): curl
  production จริงแล้ว assert กับ header set ที่ parse จาก render.yaml ตรง ๆ (single
  source of truth — แก้ render.yaml แล้ว gate ตามอัตโนมัติ) exit 1 เมื่อพบ drift;
  regression อยู่ที่ `scripts/tests/verify-live-headers.test.mjs` (mock origin บน
  127.0.0.1 ไม่พึ่งเครือข่าย) เสียบใน `scripts/ci-local.sh` / `.ps1` แล้ว
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
