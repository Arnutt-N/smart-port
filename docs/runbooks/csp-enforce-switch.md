# Runbook: เปลี่ยน CSP จาก report-only เป็น enforce บน production

**สำหรับ:** เจ้าของระบบที่มีสิทธิ์ Render dashboard · **เวลาที่ต้องใช้:** ~20 นาที รวมรอ deploy
**ย้อนกลับได้:** ใช่ — คืนชื่อ header เดิมแล้ว deploy ใหม่ (ดูข้อ 6)

เอกสารนี้เป็นขั้นตอนของ **วันกดสวิตช์** · เกณฑ์การตัดสินใจและหลักฐานอยู่ที่
[`docs/frontend-security-headers.md`](../frontend-security-headers.md) หัวข้อ "CSP monitoring
ก่อน enforce" และ "Evidence check" ทั้งสามรอบ

---

## ข้อ 0 — ตรวจก่อนว่าควรกดหรือยัง (5 นาที)

| เกณฑ์ | สถานะ ณ 22 ส.ค. 2026 |
|---|---|
| Render log ไม่มี violation จากระบบจริง ≥ 7 วัน | ✅ ไม่พบเลยตั้งแต่ 17 ส.ค. — **ต้องดูซ้ำในวันกด** เพราะ log ขยับได้ |
| pipeline ของ report ทำงานครบสาย | ✅ เห็น marker ใน Render log ด้วยตาแล้ว (21 ส.ค.) |
| console ของ DevTools เงียบระหว่างใช้งานจริง | ✅ 19 หน้าบน Chrome 151 ไม่มี CSP warning สักครั้ง (22 ส.ค.) |
| bundle ที่ production เสิร์ฟไม่มีอะไรชน policy | ✅ `audit-bundle-csp.mjs --dist <ไฟล์จาก production>` PASS |
| write path (POST/PUT/DELETE) ผ่านโดยไม่มี violation | ✅ 5 นัด (22 ส.ค.) |
| `img-src` ถูกใช้งานจริง | ❌ **ยังไม่เคย** — ทั้งระบบไม่มีรูปข้าราชการเลยสักใบ และ UI ไม่มีช่องอัปโหลด |
| `/import` · `/ocr` ทดสอบด้วยไฟล์จริง | ❌ ทดสอบแค่เปิดหน้า (ทั้งคู่รอผู้ใช้เลือกไฟล์ก่อนจึงยิง request) |

**สองข้อที่เป็น ❌ ไม่ใช่ตัวบล็อกโดยอัตโนมัติ** — แปลว่าเส้นทางนั้นยังไม่มีหลักฐาน ไม่ใช่ว่ามีปัญหา ·
ถ้ากดสวิตช์ทั้งที่ยังไม่มีหลักฐาน ให้ถือว่า **วันแรกที่มีคนอัปโหลดรูปหรือ import ไฟล์คือวันทดสอบจริง**
และเตรียมย้อนกลับไว้ (ข้อ 6) · ทางที่ปลอดภัยกว่าคือทดสอบสองเส้นทางนั้นก่อนกด

**ยิง marker สดก่อนอ่าน log เสมอ** — Render retention ~7 วัน marker เก่าหลุดไปแล้ว:

```bash
node scripts/csp-report-selftest.mjs   # exit 1 = ยังไม่มี marker สด ห้ามข้ามไปอ่าน log
```

`exit 0` แปลว่า request ถึงปลายทางและได้ 204 เท่านั้น **ยังไม่ใช่หลักฐานว่า marker ถูก log** —
ต้องเห็นบรรทัดนั้นใน Render log ด้วยตา แล้วจึงตีความ "log ว่าง" ได้

---

## ข้อ 1 — แก้ `render.yaml` (2 บรรทัด)

```diff
       - path: /*
-        name: Content-Security-Policy-Report-Only
+        name: Content-Security-Policy
         value: "default-src 'self'; script-src 'self'; …; report-uri /api/csp-report"
```

`report-uri` **เก็บไว้ต่อได้และควรเก็บ** — หลัง enforce มันจะรายงานสิ่งที่ถูกบล็อกจริง ซึ่งเป็น
สัญญาณเตือนที่เร็วกว่าการรอผู้ใช้โทรมา

## ข้อ 2 — แก้เทสที่ผูกกับชื่อ header

สามไฟล์ผูกกับชื่อ header — ต้องแก้ทั้งหมด ไม่งั้น pre-push แดง:

1. `frontend/src/__tests__/securityHeaders.test.js:34` assert ว่า `render.yaml` มีคำว่า
   `Content-Security-Policy-Report-Only` — เปลี่ยนเป็นชื่อใหม่ (assert ของ `nginx.conf`
   **ไม่ต้องแตะ** เพราะ nginx ใช้ enforce อยู่แล้ว)
2. `scripts/tests/audit-bundle-csp.test.mjs` เทส anti-drift "POLICY ที่เทสใช้ต้องตรงกับ
   render.yaml จริง" ค้น header ด้วยชื่อ — ต้องค้นทั้งสองชื่อ (enforce ก่อน แล้ว fallback
   report-only) เพื่อให้ gate ยังครอบทั้งสองเฟส
3. `scripts/tests/verify-live-headers.test.mjs` สามจุด: เทส parser (expected list),
   เทส CSP ถูกผ่อน (lookup ด้วยชื่อเดิม), เทส Render defaults (substring ใน output)

```bash
cd frontend && npx vitest run src/__tests__/securityHeaders.test.js
node --test scripts/tests/audit-bundle-csp.test.mjs        # รันผ่าน Git Bash
node --test scripts/tests/verify-live-headers.test.mjs
```

## ข้อ 3 — Deploy **แล้วยืนยันว่า header เปลี่ยนจริง** (ข้อสำคัญที่สุด)

> **ความเสี่ยงที่วัดได้จริงเมื่อ 22 ส.ค.: blueprint บน Render ตามหลัง repo อยู่**
>
> `Cache-Control` ของ `/assets/*` บน live ยังเป็นกฎที่ถูก **ลบ** ออกจาก `render.yaml` ไปตั้งแต่
> 17 ส.ค. (`c168000`) — วัดซ้ำ 20 request ได้ค่าเดิม deterministic ทั้งหมด · ขณะที่การ **แก้ค่า**
> CSP (16 ส.ค.) propagate ปกติ
>
> การ enforce คือการ **ลบ** rule ชื่อเก่า **+ เพิ่ม** rule ชื่อใหม่ ซึ่งมีครึ่งหนึ่งเป็นการลบพอดี
> **ห้ามถือว่า merge แล้วจบ** — ถ้าครึ่งนั้นไม่ propagate จะได้ทั้งสอง header พร้อมกัน (ยังทำงานได้
> แต่สับสน) หรือแย่กว่านั้นคือ enforce ไม่ติดเลยทั้งที่ทุกคนเชื่อว่าติดแล้ว

```bash
node scripts/verify-live-headers.mjs        # ต้อง exit 0 (asset ถูกยิง 5 นัด — นัดเดียวผิดคือ fail)
curl -sI https://smart-port.onrender.com/ | grep -i content-security-policy
```

ต้องเห็น `content-security-policy:` **และไม่เห็น** `content-security-policy-report-only:`
ถ้ายังเห็นชื่อเก่าอยู่ → blueprint ไม่ได้ sync: Render Dashboard → Blueprint → **Sync** แล้ววัดใหม่

**หมายเหตุเรื่อง gate**: `verify-live-headers.mjs` เทียบแบบ *directives* เฉพาะกับชื่อ
`...-Report-Only` (บรรทัด 181) พอเปลี่ยนชื่อจะตกไปโหมด *exact* · วัดเมื่อ 22 ส.ค. แล้วว่า Render
ส่งค่าตรงเป๊ะกับ `render.yaml` (286 ตัวอักษร ตรงทุกตัว) โหมด exact จึงควรผ่าน — **ถ้าวันนั้น
gate fail ด้วยข้อความที่ไม่บอกว่าขาด directive ไหน นั่นคือสาเหตุ** ให้เทียบด้วย `curl` ข้างบน
ก่อนสรุปว่า header ผิด

## ข้อ 4 — เดินเมนูจริงพร้อมเปิด DevTools console (10 นาที)

เส้นทางที่ต้องเดินอย่างน้อย: `/login` → `/dashboard` → `/personnel` (เปิด modal เพิ่ม/แก้) →
`/settings/special-areas` → `/import` → `/ocr` → หน้าที่มีรูปถ้ามีข้อมูลรูปแล้ว

**console ต้องเงียบ** · ถ้ามีบรรทัดขึ้นต้นว่า `Refused to …` ให้จดไว้ทั้งบรรทัด — บอกทั้ง directive
ที่บล็อกและ URL ที่ถูกบล็อก ซึ่งพอสำหรับตัดสินว่าจะแก้ policy หรือแก้โค้ด

## ข้อ 5 — บันทึกหลักฐาน

เพิ่มหัวข้อ `### Enforce switch YYYY-MM-DD` ใน `docs/frontend-security-headers.md` ต่อจาก
Evidence check ล่าสุด: header ที่วัดได้ · เมนูที่เดิน · console เงียบ/ไม่เงียบ · marker ที่ใช้
**เขียนสิ่งที่ยังไม่ยืนยันให้เด่นเท่ากับสิ่งที่ยืนยันแล้ว** ตามแบบของ Evidence check รอบก่อน ๆ

## ข้อ 6 — ย้อนกลับเมื่อพัง

อาการที่ต้องย้อนทันที: หน้าใดหน้าหนึ่งใช้งานไม่ได้ · รูปหายทั้งระบบ · เรียก API ไม่ได้

```diff
-        name: Content-Security-Policy
+        name: Content-Security-Policy-Report-Only
```

deploy แล้ววัดด้วย `verify-live-headers.mjs` อีกครั้ง · ถ้า blueprint ไม่ sync ให้กด Sync
เหมือนข้อ 3 · **การย้อนกลับไม่ทำให้ข้อมูลเสียหาย** เพราะ CSP คุมแค่ browser ไม่แตะฐานข้อมูล

> ความเสี่ยงที่ต้องรู้ก่อนกด (จากเอกสารหลัก): ถ้ามีใครตั้ง `VITE_API_URL` เป็น absolute URL บน
> dashboard หลัง enforce จะพังสองชั้นพร้อมกัน — `connect-src 'self'` บล็อก API call ทั้งหมด
> **และ** `img-src 'self' data:` บล็อกรูปข้าราชการทุกใบ เพราะ `apiAssetUrl()` ประกอบ URL รูปจาก
> API base เดียวกัน · คนที่แก้โดยเติม backend origin เข้า `connect-src` อย่างเดียวจะได้ API กลับมา
> แต่รูปยังพังทั้งระบบ
