# MCP Stack — Node vs Python, transport, วิธีแจกจ่ายบน Windows

Asset ของ ticket `mcp-stack` (แผนที่: `docs/wayfinder/smart-port-mcp.md`)
ข้อมูล SDK ตรวจจาก README ทางการ + เวอร์ชันจริงบน registry ณ 2026-09-26

## 1. Transport: stdio (ตัดสินแล้ว)

Desktop client (เช่น Claude Desktop) spawn MCP server เป็น local process
แล้วคุยผ่าน stdin/stdout — ไม่เปิดพอร์ต ไม่มีปัญหา firewall/proxy บนเครือข่าย
หน่วยงาน และ cookies/session ไม่ข้ามเครื่อง เหมาะกับเฟส pilot ที่สุด

Streamable HTTP เก็บไว้เป็นทางเลือกเมื่อถึงเฟสฝังแชทในเว็บ (ต้องมี hosting +
auth + ops เพิ่ม — อยู่นอกสโคปแผนที่นี้)

Gotcha สำคัญของ stdio: **ห้ามเขียนสิ่งอื่นลง stdout** (protocol ใช้ช่องนี้) —
log ทุกอย่างต้องไป stderr หรือไฟล์เท่านั้น ไม่งั้น client ตัดการเชื่อมต่อ

## 2. SDK: เปรียบเทียบ Node (TS) vs Python

ทั้งสองค่ายเป็น v2 stable ตาม MCP spec 2026-07-28 แล้ว (v1 อยู่ในโหมด
maintenance) — ของใหม่ต้องขึ้น v2 ตั้งแต่ต้น ไม่ใช้ API v1

| ประเด็น | Node — `@modelcontextprotocol/server` 2.1.0 | Python — `mcp` 2.2.0 |
|---|---|---|
| ติดตั้ง | `npm install @modelcontextprotocol/server` | `pip install "mcp[cli]"` (ต้องการ `cli` extra สำหรับ `mcp dev/run`) |
| Runtime ขั้นต่ำ | Node 20+ (มี fetch ในตัว) | Python 3.10+ (เรียก API ผ่าน `httpx`, ต้องลงเพิ่ม) |
| นิยาม tool schema | Standard Schema — เขียนด้วย Zod v4 / Valibot / ArkType | type hints + docstring (`@mcp.tool()` สร้าง schema ให้) |
| โค้ด server ขั้นต่ำ | `McpServer` + `StdioServerTransport` + `registerTool` | `MCPServer("name")` + `@mcp.tool()` |
| เครื่องมือ dev | MCP Inspector (สากล) | เหมือนกัน + `mcp dev`/`mcp install` CLI |
| ทีม Smart Port | ตรงสาย — frontend ใช้ Node 20 + npm + eslint + vitest อยู่แล้ว, CI มี gate พร้อม | นอกสายหลัก — Python ใน repo มีแค่สคริปต์ (`graphify-safe`, hooks) ไม่มี test/lint gate |

## 3. คำแนะนำ: Node + TS SDK v2

เหตุผลหลัก 3 ข้อ:

1. ** toolchain เดียวกับ frontend** — `npm ci` / `npm test` (vitest) / `npm run lint`
   (eslint) เอามาใช้กับ `mcp-server/` ได้ทันที ไม่ต้องตั้ง gate ภาษาที่สอง
2. **HTTP client ไม่ต้องลงเพิ่ม** — Node 20 มี `fetch` + cookie handling
   ในตัว เหมาะกับงานห่อ REST API ที่ auth ด้วย cookies (`sp_access`/`sp_refresh`)
3. **schema ชัด** — Zod v4 บังคับ contract ของ tool params (ตรงนิสัย repo ที่ pin
   contract ไว้กัน drift) ในขณะที่ฝั่ง Python ต้องพึ่งวินัย docstring

Pin: `@modelcontextprotocol/server@^2.1.0` + `zod@^4`, Node `>=20`
(เครื่อง dev ตอนนี้ Node v24.15.0 — รันได้, แต่ประกาศขั้นต่ำ 20 ตาม frontend)

โครงที่เสนอสำหรับ `prototype-stdio`:

```text
mcp-server/
├── package.json          # name @smartport/mcp-server, type module
├── src/
│   ├── index.ts          # McpServer + StdioServerTransport
│   ├── api.ts            # login/refresh + fetch ห่อ REST (cookies)
│   └── tools/
│       ├── dashboard.ts  # dashboard_summary
│       ├── candidates.ts # candidate_search
│       └── probation.ts  # probation_watch
└── tests/                # vitest — contract tests ตาม tool-inventory
```

## 4. วิธีแจกจ่ายให้เครื่อง HR (Windows)

### สิ่งที่ต้องมีบนเครื่อง HR

1. Node.js 20 LTS (ติดตั้งครั้งเดียว)
2. Claude Desktop
3. โฟลเดอร์ `mcp-server` (zip หรือ `git pull`) + `npm ci` ครั้งเดียว

### Config ตัวอย่าง (ไฟล์ `%APPDATA%\Claude\claude_desktop_config.json`)

เปิดผ่าน Claude Desktop → Settings → Developer → Edit Config:

```json
{
  "mcpServers": {
    "smartport": {
      "command": "node",
      "args": ["C:\\smartport\\mcp-server\\dist\\index.js"],
      "env": {
        "SMARTPORT_API_URL": "https://smart-port.onrender.com/api",
        "SP_SERVICE_USERNAME": "<service-account>",
        "SP_SERVICE_PASSWORD": "<secret>"
      }
    }
  }
}
```

หมายเหตุ: ชื่อ env + วิธีเก็บ credential ฉบับจริงให้ ticket
`service-account` ตัดสิน — ตรงนี้เป็นแค่รูปทรง

### วิธีอัปเดตเวอร์ชัน (เฟส pilot — manual)

1. แทนที่โฟลเดอร์ `mcp-server` ด้วยรุ่นใหม่ + `npm ci`
2. เช็ก `node dist/index.js --self-test` (ให้ prototype ใส่ self-test มา)
3. Restart Claude Desktop (config ใหม่มีผลตอนเปิดโปรแกรม)

ยังไม่มี auto-update ในเฟสนี้ — วิธีแจกจ่าย/อัปเดตแบบ scale (intranet share,
script ติดตั้ง, signed bundle) เป็นงานของ `rollout`

### Gotcha บน Windows (เจอแน่ — เตรียมคู่มือไว้)

- ใช้ **absolute path** ใน `args` เสมอ (`node` หาไฟล์ผ่าน PATH ไม่ได้)
- backslash ใน JSON ต้อง escape (`C:\\smartport\\...`)
- แก้ config แล้วต้อง **restart Claude Desktop** ทุกครั้ง
- stdout สงวนให้ protocol — log ลง stderr/ไฟล์เท่านั้น
- ห้าม commit ไฟล์ config ที่มีรหัสผ่านเข้า repo (ดู `service-account`)

## 5. ทางเลือกที่ตัดออก (พร้อมเหตุผล)

- **Python SDK** — ของดีและเขียนสั้นกว่า แต่เพิ่ม runtime + gate ภาษาที่สองให้
  ทีม; กลับมาทบทวนได้ถ้าเครื่อง HR มีแต่ Python
- **โพสต์แพ็กเกจขึ้น registry + `npx -y`** — ต้องมี private registry + pipeline
  publish; เกินความจำเป็นของ pilot
- **bundle เป็น exe เดียว (pkg/SEA/PyInstaller)** — เสี่ยงโดน antivirus/
  นโยบายเซ็นซอฟต์แวร์บนเครื่องราชการสกัด; พักไปคุยใน `rollout`
- **Streamable HTTP ตั้งแต่ตอนนี้** — ต้องโฮสต์เซิร์ฟเวอร์ + ทำ auth แยก;
  รอเฟส web-chat
