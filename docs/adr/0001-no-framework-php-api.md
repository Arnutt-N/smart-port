# ADR-0001: ใช้ PHP REST API แบบไม่มี framework

- **Status**: Accepted (บันทึกย้อนหลัง 2026-07-26 — การตัดสินใจเกิดตั้งแต่เริ่มโปรเจกต์)
- **Date**: 2026-07-26

## Context

Smart Port ต้อง deploy บนสภาพแวดล้อมของหน่วยงานราชการที่ควบคุมได้จำกัด (Apache + PHP บน shared host หรือ container) และทีมพัฒนามีคนน้อย ตัวเลือกตอนเริ่มโปรเจกต์คือใช้ framework (Laravel/Slim) หรือเขียน REST API ด้วย PHP ล้วน

ข้อจำกัดที่มีผลต่อการตัดสินใจ:

- ต้องรันบน PHP 8.3 + Apache ที่มี `mod_rewrite` เท่านั้น ไม่มีสิทธิ์ติดตั้ง service เพิ่ม
- Production อยู่บน Render free tier — ไม่มี Redis, filesystem ไม่ persist ระหว่าง deploy
- ขอบเขตงานคือ REST API ที่คืน JSON ให้ Vue SPA ไม่มีการ render HTML ฝั่งเซิร์ฟเวอร์
- ทีมต้องดูแลระยะยาวโดยไม่ต้องตามอัปเกรด major version ของ framework

## Decision

1. **API เป็น PHP ล้วน ไม่มี framework** — `backend/api.php` เป็น entry point เดียว รับทุก request ผ่าน rewrite rule ใน `.htaccess`
2. **Routing ด้วย switch statement** บน path segment แรก แล้ว `include` ไฟล์ handler ใน `backend/routes/` ต่อ domain
3. **JWT เป็น custom HS256 implementation (`backend/auth.php`) — ตัดสินใจแล้ว ไม่ใช้ library** (ข้อความเดิมที่ระบุ `firebase/php-jwt` เป็นความคลาดเคลื่อนของเอกสาร — `composer.json` ไม่มี dependency นี้; dependency เดียวที่ยอมรับคือ `phpoffice/phpspreadsheet`)
4. **เข้าถึงฐานข้อมูลผ่าน PDO + prepared statements เท่านั้น** ไม่มี ORM — query อยู่ในไฟล์ route หรือ service class (`ImportService`, `QualificationEngine`)
5. **Cross-cutting concern เขียนเป็น middleware แบบ include** (`backend/middleware/csrf.php`, `rate_limit.php`) เรียกจาก `api.php` ก่อน dispatch

## Consequences

**เชิงบวก**

- Deploy ได้ทุกที่ที่มี PHP + Apache ไม่ต้องมี build step ฝั่ง backend
- ไม่มีภาระตามอัปเกรด framework และ dependency tree เล็กมาก (audit ง่าย)
- อ่านโค้ดแล้วเห็นเส้นทางของ request ตรง ๆ ไม่มี magic

**เชิงลบ / ข้อจำกัดที่ต้องรับ**

- ไม่มี validation layer, DI container หรือ migration tool มาให้ ต้องทำเองและรักษาความสม่ำเสมอด้วยวินัย
- `api.php` โตขึ้นเรื่อย ๆ — ต้องคอยแยก handler ออกไป `routes/` ไม่งั้นไฟล์เดียวจะใหญ่เกินอ่าน
- Cross-cutting concern ที่ framework ให้ฟรี (405 handling, content negotiation) ต้องเขียนเองทุกจุด **และเคยตกหล่นมาแล้ว** — ดู ADR-0002
- ไม่มี type safety ระดับ request/response ต้องพึ่งเทสแทน

## References

- Entry point: `backend/api.php` · Handler: `backend/routes/` · Middleware: `backend/middleware/`
- Migration runner ที่เขียนเอง: `backend/scripts/run-migrations.php`
