# Wayfinder Map — MCP สำหรับ Smart Port

เป้าหมาย: HR assistant อ่านอย่างเดียว ให้ HR คุยภาษาไทยกับข้อมูล Smart Port
ผ่าน Desktop MCP client (เช่น Claude Desktop) โดย MCP server เรียก REST API
ปัจจุบันด้วยบัญชีกลาง role viewer

## goal-scope: MCP เอาไปทำอะไร

Status: resolved
Type: Grilling

### Question

เป้าหมายหลักของ MCP คืออะไร — ใครเรียกใช้ และเอาไปทำอะไร?

### Answer

HR assistant อ่านอย่างเดียว (Q&A ภาษาไทยบนข้อมูล candidates/probation/
personnel/dashboard) ฝั่งเขียน (operator copilot) ยังไม่ทำเพราะต้องออกแบบ
RBAC/audit เพิ่ม งาน dev-automation อยู่นอกสโคป

## client-channel: คุยผ่าน client ไหน

Status: resolved
Type: Grilling

### Question

ใครเป็นคนคุยกับ MCP ผ่าน client ไหน?

### Answer

HR ใช้ผ่าน Desktop MCP client โดยตรง ไม่สร้างหน้าแชทในเว็บ Smart Port
ในเฟสนี้ (พิสูจน์คุณค่าของ tools ก่อน)

## auth-identity: ใช้สิทธิ์ของใครเรียก API

Status: resolved
Type: Grilling

### Question

MCP ควรใช้สิทธิ์ของใครเรียก API?

### Answer

บัญชีกลาง role viewer ตัวเดียว ได้ citizen_id masking ฟรีตามโค้ดปัจจุบัน
(ดู `CONTEXT.md`) audit รายคนเลื่อนไปเฟสถัดไป

## tool-inventory: API ฝั่งอ่านมีอะไรให้ห่อเป็น tools บ้าง

Status: resolved
Type: Research

### Question

endpoints ฝั่งอ่าน (dashboard, candidates, probation, personnel, photos,
awards, profile) ตัวไหนบ้างที่ role viewer เรียกได้ แต่ละตัวรับ params/
คืนรูปอะไร และตัวไหนเหมาะเป็น MCP tools ชุดแรก?

### Answer

Resolved — ดู [tool-inventory.md](assets/tool-inventory.md) สรุป: viewer
อ่านได้ 16 GET (dashboard, candidates×3, probation×2, personnel×4,
multiplier×3, profile×2, photos/sign) ส่วน awards/decorations/work-results/
supportive/diverse/equivalence/analytics/retirement ได้ 403 ต้องตัดออก
หรือขอ override ใน `pii-policy`; tools ชุดแรกที่แนะนำคือ
`dashboard_summary` + `candidate_search` + `probation_watch`

## mcp-stack: ใช้ stack/transport อะไร แจกจ่ายให้ HR ยังไง

Status: resolved
Type: Research

### Question

MCP server เขียนด้วย SDK ภาษาไหน (Node vs Python) transport อะไร (stdio
สำหรับ Desktop client) และแพ็ก/แจกจ่ายบนเครื่อง Windows ของ HR อย่างไร
(config ตัวอย่าง, วิธีอัปเดตเวอร์ชัน)?

### Answer

Resolved — ดู [mcp-stack.md](assets/mcp-stack.md) สรุป: transport = stdio;
SDK = Node TS v2 (`@modelcontextprotocol/server@^2.1.0` + `zod@^4`,
Node ≥ 20) เพราะ toolchain เดียวกับ frontend; แจกจ่ายแบบโฟลเดอร์ +
`npm ci` + config ใน `%APPDATA%\Claude\claude_desktop_config.json`
อัปเดต manual ในเฟส pilot (วิธี scale เป็นงาน `rollout`)

## pii-policy: นโยบาย PII/log ของ MCP

Status: resolved
Type: Grilling

### Question

viewer masking ที่มีอยู่พอไหม หรือต้อง aggregate-only เพิ่ม ห้าม tools ใด
แตะ citizen_id เต็ม และ log ฝั่ง MCP เก็บอะไรได้บ้าง (ห้าม PII หลุดเข้า log)?

### Answer

Resolved — ดู [pii-policy.md](assets/pii-policy.md) มติ 3 ข้อ: (1) viewer
masking พอ ไม่ต้อง aggregate-only — tools ตอบรายคนได้โดยไม่มี citizen_id;
(2) ตัด resources ที่ viewer ได้ 403 ออกหมด ไม่ขอ override ในเฟสนี้;
(3) log เก็บได้แค่ metadata + internal ID (personnel/enrollment_id)
ห้ามชื่อ/search text/citizen_id/credential ลง stderr/ไฟล์เท่านั้น

## service-account: เตรียมบัญชีกลาง + credential + refresh

Blocked by: mcp-stack
Status: resolved
Type: Task

### Question

provision บัญชี viewer กลางอย่างไร เก็บ credential ที่ไหน (Desktop config
env ห้ามเข้า repo) และจัดการ access token หมดอายุ 1 ชม./refresh flow
ใน MCP server อย่างไร?

### Answer

Resolved — ดู [service-account.md](assets/service-account.md) สรุป: สร้าง
บัญชี local `sp_mcp_service` (id 2466, viewer) แล้ว ทดสอบ login/me/
dashboard/refresh/logout ผ่านหมด; credential อยู่ใน Desktop config env
(`SMARTPORT_API_URL`/`SP_SERVICE_USERNAME`/`SP_SERVICE_PASSWORD`) รหัส local
ส่งในแช็ตครั้งเดียว; refresh มี rotation + reuse kill-all — prototype ต้อง
single-flight และ refresh ก่อนครบ 1 ชม.; บัญชี production เป็น checklist
ให้ release owner ใน asset

## prototype-stdio: MCP stub 2–3 tools ลองคุยจริง

Blocked by: tool-inventory, mcp-stack, service-account, pii-policy
Status: resolved
Type: Prototype

### Question

MCP server (stdio) ที่ห่อ tools อ่าน 2–3 ตัวแรก หน้าตา/พฤติกรรมเป็นอย่างไร
เมื่อลองถามจริง?

### Answer

Resolved — prototype อยู่ที่ [mcp-server/](../../mcp-server/README.md):
Node TS SDK v2 + zod/v4, 3 tools (`dashboard_summary`,
`candidate_search`, `probation_watch`), cookie jar + login/refresh
single-flight + log sanitize ตามมติ pii-policy; ยืนยันแล้วด้วย build,
`--self-test` กับ backend local (PASS), คุย JSON-RPC ผ่าน stdio จริง
(initialize/list/call 3 tools PASS), vitest 12/12, eslint exit 0;
ไม่มี secret ในไฟล์ — เหลือคำถามจริงจาก HR ให้ `hr-pilot`

## hr-pilot: ทดลองกับ HR เก็บ feedback

Blocked by: prototype-stdio
Status: open
Type: Grilling

### Question

HR ลองใช้แล้วถามอะไรได้/ไม่ได้ อะไรคือ tools ชุดถัดไปที่คุ้มสุด และมีประเด็น
PII/สิทธิ์อะไรโผล่มาบ้าง?

### Answer

(ค้างที่มนุษย์ — session นี้ทำส่วนของ agent เสร็จแล้ว: security review ผ่าน
แบบมีเงื่อนไข R1–R5 + ชุดทดลองพร้อมใน [hr-pilot-kit.md](assets/hr-pilot-kit.md);
คืนสถานะเป็น open เพื่อรอผล pilot จริง — เอา feedback ตามแบบฟอร์มข้อ 4
กลับมาแล้วค่อย resolve ใบนี้ ห้ามแต่งคำตอบเอง)

## rollout: hardening + แจกจ่าย + docs

Blocked by: hr-pilot
Status: open
Type: Task

### Question

งานก่อนใช้จริง: audit, rate limit, วิธีแจกจ่าย/อัปเดตทุกเครื่อง HR, คู่มือ
ภาษาไทย — checklist มีอะไรบ้างและเสร็จครบไหม?

### Answer

(ยังไม่ resolved)

## Notes

- Domain: HRIS ภาษาไทย — อ่าน `CONTEXT.md` เรื่อง citizen_id/RBAC ก่อนแตะข้อมูลบุคคล
- Standing: เฟสนี้ tools อ่านอย่างเดียวเท่านั้น ห้าม mutation tool จนกว่า pilot จะเรียกร้องและมี ADR
- Consult: `api-design` (ตอนออกแบบ tools), `security-review` (ก่อน pilot)
