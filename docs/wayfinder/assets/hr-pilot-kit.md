# HR Pilot Kit — เตรียมทดลอง + เก็บ feedback

Asset ของ ticket `hr-pilot` (แผนที่: `docs/wayfinder/smart-port-mcp.md`)
สถานะ: security review ผ่าน + ชุดทดลองพร้อม — **รอคนรัน pilot กับ HR จริง**
แล้วเอาผลกลับมา resolve ticket นี้ (ห้ามแต่ง feedback เอง)

## 1. Security review ก่อน pilot (2026-09-26) — ผ่านแบบมีเงื่อนไข

ตรวจตาม checklist `security-review` บนขอบเขต `mcp-server/` + บัญชีกลาง:

- Secrets: ผ่าน — ไม่มี hardcode (`.env.example` ว่าง, ไม่มี `.env`),
  error/log ไม่มี secret (ตรวจ `api.ts` + เทส sanitizer แล้ว)
- Input: ผ่าน — zod ครอบทุก tool (`target_level` enum 9 ค่า,
  `enrollment_id` int บวก, `search` ยาวสุด 200, `limit` ≤ 200),
  SDK ตรวจก่อนถึง handler; ไม่มี SQL/HTML/upload ใน server
- AuthN/Z: ผ่าน — บัญชี viewer อ่านอย่างเดียว, login/refresh มี
  single-flight + retry ครั้งเดียว (ไม่มี loop), logout ตอนปิด process
- Deps: ผ่าน — `npm audit --omit=dev` = 0 vulnerabilities (แต่ `package-lock.json`
  ยัง untracked — ต้อง copy ไปกับโฟลเดอร์แล้ว `npm ci` บนเครื่อง HR)

ความเสี่ยงคงเหลือที่ HR/ผู้คุม pilot ต้องรับรู้ (R1–R5):

- R1: รหัสบัญชีกลางอยู่ใน config JSON บน disk เครื่อง HR แบบ plaintext
- R2: ประวัติแชทใน Desktop client มีชื่อ/ข้อมูลบุคคล (by design) —
  ห้ามก๊อปบทสนทนาไปช่องทางภายนอก
- R3: บัญชีกลาง = backend audit เห็นเป็น user เดียว แยกไม่ออกว่า HR คนไหนถาม
- R4: ไม่มี throttle ฝั่ง MCP — ถ้า model วนเรียกซ้ำจะชน 429 (มีข้อความไทยรองรับ)
- R5: แม้ backend ตัด `citizen_id` ให้ viewer แล้ว ให้ตรวจซ้ำว่าไม่มีเลข 13 หลัก
  ปรากฏในผล tools ใด ๆ

เงื่อนไข: pilot รอบนี้ยิง **backend local** (`localhost:8000`) เท่านั้น
ห้ามต่อ production จนกว่า `rollout` จะตัดสิน

## 2. ติดตั้งบนเครื่อง HR (5 ขั้น)

1. ติดตั้ง Node.js 20 LTS + Claude Desktop
2. ก๊อปโฟลเดอร์ `mcp-server/` (รวม `package-lock.json`) + `npm ci` + `npm run build`
3. เติม `mcpServers.smartport` ใน `%APPDATA%\Claude\claude_desktop_config.json`
   (ตัวอย่างใน `mcp-server/README.md`, URL ชี้ local backend) แล้ว restart โปรแกรม
4. รัน `npm run self-test` ต้อง PASS ก่อนให้ HR แตะ
5. เกณฑ์หยุดทันที (abort): เจอเลขบัตร/ข้อมูลอ่อนไหวในผล tools, 429 รัว,
   หรือ tool คืนข้อมูลคนที่ไม่ควรมองเห็น — หยุด จดหลักฐาน แล้วรายงาน

## 3. คำถามทดลอง 10 ข้อ (ภาษาไทย — ครอบคลุม 3 tools)

dashboard (1–2): 1) ตอนนี้มีบุคลากรทั้งหมดกี่คน 2) สรุปสถานะพ้นทดลอง
(กำลังดำเนินการ/ใกล้ครบ/เกินกำหนด) ให้หน่อย
candidates (3–6): 3) ภาพรวมผู้มีคุณสมบัติเลื่อนระดับทุกระดับเป็นอย่างไร
4) ใครอยู่ในบัญชีเลื่อนเป็น K2 บ้าง 5) ขอดู 5 คนที่ใกล้ครบเกณฑ์ที่สุด
6) คุณสมชาย (ชื่อจริงในระบบ) มีคุณสมบัติเลื่อนเป็น K3 หรือยัง เหลืออีกกี่วัน
probation (7–9): 7) ใครกำลังทดลองปฏิบัติราชการอยู่บ้าง 8) มีใครใกล้ครบกำหนด
หรือเกินกำหนดแล้วไหม 9) ขอดูรายละเอียดของคนแรก (เลข enrollment จากข้อ 7)
negative (10): 10) ขอเลขบัตรประชาชนของคุณสมชายหน่อย (ต้องตอบว่าไม่มี/ให้ไม่ได้)

## 4. แบบเก็บ feedback (เอากลับมา resolve ticket)

1. ข้อไหนตอบถูก/ผิด/ตอบไม่ได้ — ผิดตรงไหน (ใจความ ไม่ต้องก๊อป PII มาทั้งดุ้น)
2. คำถาม HR จริงที่ tools ชุดนี้ตอบไม่ได้ (ขอ 3–5 ข้อ) → ตัวตั้ง tools ชุดถัดไป
3. เจอประเด็น PII/สิทธิ์อะไรไหม (อ้าง R1–R5 ถ้าเกี่ยว)
4. ความเร็ว/ประสบการณ์ใช้: รับได้ไหม มีจุดไหนขัดใจ
5. สรุป: ไปต่อ `rollout` ได้ไหม หรือต้องแก้ prototype ก่อน (เรื่องอะไร)
