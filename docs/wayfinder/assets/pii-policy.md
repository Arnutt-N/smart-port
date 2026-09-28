# PII Policy — MCP Smart Port (pilot)

Asset ของ ticket `pii-policy` (แผนที่: `docs/wayfinder/smart-port-mcp.md`)
มติ 3 ข้อจากการ grill 2026-09-26 — ผูกพัน `service-account`,
`prototype-stdio`, `rollout`

## มติที่ 1 — viewer masking พอ ไม่ต้อง aggregate-only

Backend ตัด `citizen_id` ให้ role viewer ทุกเส้นแล้ว
(`redactPersonnelCitizenIdForRole`, ดู [tool-inventory](tool-inventory.md))
tools จึงตอบรายคนได้ด้วยฟิลด์ที่เหลือ (ชื่อ/ตำแหน่ง/หน่วย/วันที่) —
ซึ่งเป็นคุณค่าหลักของ HR assistant ("ใครใกล้ครบเกณฑ์บ้าง")

## มติที่ 2 — exclusion list: ตัดออกหมด ไม่ขอ override

เฟสนี้ MCP ห่อได้เฉพาะ 16 GET ที่ viewer อ่านได้เท่านั้น ที่เหลือห้ามแตะ
(ได้ 403 อยู่แล้ว — ห้ามขอ override เพื่อ pilot):

`awards` · `royal_decorations` · `work_results` · `supportive` · `diverse` ·
`equivalence` · `analytics` · `retirement` · `audit` · `users` · `import` ·
`ocr` · `sync` · `settings` (+ `civil-servants` legacy — ใช้ `/personnel` แทน)

ถ้า `hr-pilot` เรียกร้องตัวไหน ให้ขอ override เป็นรายตัวพร้อมเหตุผล —
ไม่ใช่ดีฟอลต์

## มติที่ 3 — log ฝั่ง MCP: metadata + internal ID เท่านั้น

| เก็บได้ | ห้ามเด็ดขาด |
|---|---|
| ชื่อ tool, `target_level`, `limit`/`offset`, `personnel_id`/`enrollment_id`/`area_*`, `province`/`district`, status/latency/error code | ชื่อบุคคล, ข้อความ `search`, `citizen_id`, response รายคน, credential/cookie/token (`sp_access`/`sp_refresh`/password) |

- `personnel_id`/`enrollment_id` เป็น internal ID ใช้ไล่บั๊กได้โดยไม่เห็นชื่อคน
- log ลง stderr/ไฟล์เท่านั้น (ห้าม stdout — ดู gotcha ใน [mcp-stack](mcp-stack.md))
- `prototype-stdio` ต้องมี log sanitizer + เทสยืนยันว่าไม่มีชื่อ/`citizen_id`
  หลุดเข้า log; `rollout` ต้องมีหัวข้อ retention/วิธีลบ log บนเครื่อง HR
- รัน `security-review` ก่อน `hr-pilot` (ตาม Notes ของแผนที่)

## ทบทวนเมื่อ

- pilot ขอข้อมูลรายคนจาก resource ใน exclusion list → override รายตัว
- เฟส web-chat / multi-user → ทบทวนทั้ง 3 มติ (audit รายคนอาจบังคับ log เพิ่ม)
