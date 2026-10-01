# @smartport/mcp-server (prototype 0.1.0)

MCP server (stdio) ห่อ Smart Port REST API ฝั่งอ่าน — ให้ HR คุยภาษาไทยกับข้อมูล
ผ่าน Desktop MCP client (เช่น Claude Desktop) ด้วยบัญชีกลาง role `viewer`

ต้นน้ำการตัดสินใจ: `docs/wayfinder/smart-port-mcp.md` +
`docs/wayfinder/assets/{tool-inventory,mcp-stack,pii-policy,service-account}.md`

## Tools (3 ตัว, อ่านอย่างเดียว)

| Tool | ห่อ endpoint | Params |
|---|---|---|
| `dashboard_summary` | `GET /dashboard` | ไม่มี |
| `candidate_search` | `GET /candidates/overview` + `GET /candidates/{target}` | `target_level?` (K2 K3 K4 O2 O3 M1 M2 S1 S2), `search?`, `limit?`, `offset?` |
| `probation_watch` | `GET /probation` + `GET /probation/{id}` | `enrollment_id?`, `search?`, `limit?`, `offset?` |

## ติดตั้งและรัน

```powershell
cd mcp-server
npm ci
npm run build
```

ตั้ง env (ค่าจริงห้ามเข้า repo — ดู `.env.example` เฉพาะชื่อตัวแปร):

```text
SMARTPORT_API_URL=http://localhost:8000/api
SP_SERVICE_USERNAME=sp_mcp_service
SP_SERVICE_PASSWORD=<รหัสบัญชี local จาก session service-account>
```

กฎของ `SMARTPORT_API_URL` (server ปฏิเสธตั้งแต่เริ่มถ้าผิด — กัน credential ไปผิดที่):

- ต้องเป็น `https` — `http` อนุญาตเฉพาะ `localhost` / `127.0.0.1` / `[::1]`
- host ต้องอยู่ใน allowlist: ค่าเริ่มต้นคือ `smart-port.onrender.com` (เทียบตรงตัว ไม่ใช่ suffix) เพิ่ม host อื่นได้ด้วย
  `SMARTPORT_API_ALLOWED_HOSTS=host1.example.go.th,host2.example.go.th` — แต่ละ entry ต้องเป็นชื่อ host ล้วน
  (ไม่มี scheme/พอร์ต/path/@) ไม่เช่นนั้น server ปฏิเสธตั้งแต่เริ่ม
- ห้ามฝัง `user:pass@` ใน URL
- ทุก request ไม่ตาม redirect (ถ้าเจอ 3xx = error) และมี timeout 30 วินาที (logout 5 วินาที)

ทุก tool response ผ่านด่านตรวจเลขบัตรประชาชน (13 หลักติดกัน หรือแบบมีตัวคั่น `-` / ช่องว่าง รวมเลขไทย/fullwidth) —
เจอ = ส่ง error แทนข้อมูลทั้งก้อน (fail-closed); ไม่ครอบเลขที่คั่นด้วย zero-width character

ตรวจสายอ่าน + refresh + logout จริง:

```powershell
npm run self-test
```

คุย JSON-RPC ผ่าน stdio จริง (ต้องการ env ชุดเดียวกับ self-test):

```powershell
node scripts/stdio-smoke.mjs
```

## ต่อเข้า Claude Desktop (Windows)

Settings → Developer → Edit Config → เติมใน `mcpServers`
(`%APPDATA%\Claude\claude_desktop_config.json`) แล้ว restart โปรแกรม:

```json
{
  "mcpServers": {
    "smartport": {
      "command": "node",
      "args": ["C:\\path\\to\\smart-port\\mcp-server\\dist\\index.js"],
      "env": {
        "SMARTPORT_API_URL": "https://smart-port.onrender.com/api",
        "SP_SERVICE_USERNAME": "sp_mcp_service",
        "SP_SERVICE_PASSWORD": "<รหัส>"
      }
    }
  }
}
```

ข้อควรระวัง: ใช้ absolute path, backslash escape (`\\`), แก้ config แล้ว restart
ทุกครั้ง, log ลง stderr เท่านั้น (stdout สงวนให้ protocol)

Client เจ้าอื่น (claude-code, codex, cursor, cline, opencode, kiro, kilo,
qwen, kimi, muse, mimo, qoder, antigravity, zcode, hermes, openclaw, grok) —
ดูตัวอย่าง config ครบทั้ง 17 เจ้าที่ [docs/clients.md](docs/clients.md)

## เกทคุณภาพ

```powershell
npm test   # vitest — cookie jar, log sanitizer, config, zod schemas
npm run lint  # eslint (exit 0 required)
```

## หมายเหตุ prototype

- session: login แบบ lazy, refresh ก่อนหมดอายุ 5 นาที, 401 → refresh+retry
  ครั้งเดียว, single-flight กัน reuse kill-all; ปิด process = logout ให้
- log เก็บแค่ metadata + internal ID ตามมติ pii-policy (มีเทสกัน PII หลุด)
- ยังไม่ทำ: retry/backoff ขั้นสูง, metrics, auto-update, บัญชี production
  (ดู checklist ใน asset `service-account.md`)
