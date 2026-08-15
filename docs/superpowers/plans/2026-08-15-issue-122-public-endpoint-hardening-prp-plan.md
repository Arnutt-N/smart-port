# PRP Plan — Issue #122: Public endpoint hardening (rate limiting + log sanitization)

**Date:** 2026-08-15 · **Issue:** #122 · **Branch:** `issue-122-public-endpoint-hardening`
**Parent:** post-merge audit ของลูป #110–#115 (range `720dda6..a1fafa1`)

## Problem

1. **Public endpoints อยู่นอก rate limiting** — `rateLimitGlobal()` ใน `backend/api.php`
   รันเฉพาะ branch ที่ authenticated และ `backend/middleware/rate_limit.php` key ด้วย user_id:
   - `GET /api/readyz` — public + ยิง DB 2 queries/ครั้ง; ตอน TiDB ล่ม `config.php`
     เพิ่ม 3 connection attempts + ~0.6s sleep/คำขอ → amplification/worker-exhaustion
     แบบ unauthenticated ตรงช่วง outage พอดี
   - `POST /api/csp-report` — เขียน `error_log` ไม่จำกัด (log flooding) ที่ body cap 10KB
   - `GET /uploads/*` — กลายเป็น DB read ต่อรูป (เดิม static)
2. **CSP-report log injection** — `$directive` จาก body ที่ attacker คุมได้ถูก interpolate
   ตรงเข้า `error_log()` → CRLF ปลอม log line ได้

## Plan

### 1. Public rate limiter แบบ DB-free (`backend/middleware/rate_limit.php`)
- `publicClientIp()` — อ่าน IP: first hop ของ `X-Forwarded-For` (Render/nginx ตั้งให้)
  fallback `REMOTE_ADDR`; sanitize ให้เหลืออักขระ IP ที่ถูกต้อง
- `publicRateLimitWithin(string $bucket, int $limit, int $windowSeconds): bool` —
  file-based sliding window (reuse logic เดียวกับ `checkRateLimitFile`)
  key = `public_{ip}_{bucket}`; **คืน bool ไม่ exit** เพื่อ test ได้
- `checkRateLimitPublic(string $bucket, int $limit, int $windowSeconds): void` —
  wrapper ที่ exit 429 เมื่อเกิน (เหมือน `rateLimitExceededResponse()`)
- **ใช้ file storage เสมอสำหรับ public** — ไม่ probe DB เลย (DB probe ตอน outage
  คือปัญหาที่ต้องการเลี่ยง; rate limit แบบ eventual ก็พอสำหรับ anti-abuse)

### 2. บังคับใช้กับ public trio (`backend/api.php`)
- หลังคำนวณ public flags / ก่อน JWT gate:
  - `uploads` → bucket `uploads`, 300 req/60s/IP (หน้า profile โหลดรูปหลายใบ — เผื่อไว้กว้าง)
  - `readyz` → bucket `readyz`, 30 req/60s/IP (monitoring poll ความถี่ต่ำก็พอ)
  - `csp-report` → bucket `csp-report`, 60 req/60s/IP (กัน log flooding)
- authenticated routes ไม่เปลี่ยนพฤติกรรม

### 3. Log sanitization (`backend/api.php` csp-report case)
- `$directive`/`$blocked`: strip อักขระ control (`/[\x00-\x1F\x7F]/` → '') + truncate 100 chars
  ก่อนเข้า `error_log()`

### 4. Tests (`backend/tests/Unit/PublicRateLimitTest.php`)
- `public_rate_limit_trips_after_limit_and_recovers_after_window`:
  เรียก `publicRateLimitWithin()` ด้วย bucket unique เกิน limit → false; window สั้น
  (1–2s) รอแล้วคืน true; cleanup ไฟล์ rate-limit ที่สร้าง (bucket prefix)
- `public_client_ip_sanitizes_forwarded_for`: X-Forwarded-For มี CRLF/comma chain →
  ได้ first hop ที่ clean
- CSP sanitization: unit-test pattern เดียวกับที่ใช้ใน api.php (strip control chars)

## Acceptance criteria
- [x] `readyz` / `csp-report` / `uploads` ถูก rate limit แบบไม่ต้องพึ่ง DB connection
- [x] log line ของ CSP-report ไม่มี CR/LF/control char ที่ attacker คุมได้
- [x] authenticated rate limiting เดิมไม่เปลี่ยน; tests เดิมเขียวยกชุด
- [x] `scripts/ci-local.ps1` ผ่าน

## Verification
- `bash backend/tests/run.sh` (Docker PHPUnit)
- smoke: `curl` ถล่ม `readyz` เกิน 30 ครั้ง/นาทีใน dev container → 429
  (ผลจริง: 30×200 แล้ว 5×429 พอดี)
- smoke: POST `/api/csp-report` ด้วย directive ที่มี `\r\n` → log บรรทัดเดียว
  (`directive=script-srcFAKE-LOG-LINE`) ไม่มีบรรทัดปลอม
- `scripts/ci-local.ps1 -SkipInstall`
