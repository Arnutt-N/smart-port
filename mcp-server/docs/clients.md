# ต่อ MCP server เข้ากับ client ค่ายต่าง ๆ (17 เจ้า)

Server ตัวนี้พูด MCP ผ่าน **stdio** (stdin/stdout) — client ทุกเจ้าที่รองรับ
local MCP server จะรับ "สามอย่าง" ชุดเดียวกัน แล้วนำไปใส่ในรูป config ของตัวเอง:

```text
command: node
args:    [<absolute-path>/mcp-server/dist/index.js]
env:     SMARTPORT_API_URL / SP_SERVICE_USERNAME / SP_SERVICE_PASSWORD
```

- ใช้ **absolute path** เสมอ, บน Windows escape backslash (`\\`) ใน JSON
- ค่า `env` จริงห้ามเข้า repo — ไฟล์ข้างล่างนี้มีแค่ตัวอย่าง (placeholder)
- แก้ config แล้ว restart/reload client ทุกครั้ง (ดูหมายเหตุรายเจ้า)

## ตารางสรุป

| Client | ไฟล์ config | key/รูปทรง | หมายเหตุ |
|---|---|---|---|
| Claude Code | `.mcp.json` / `~/.claude.json` | `mcpServers` | มี `claude mcp add`, ตรวจด้วย `/mcp` |
| Codex | `~/.codex/config.toml` | `[mcp_servers.x]` (TOML) | มี `codex mcp add`, env เป็น `[mcp_servers.x.env]` |
| Cursor | `~/.cursor/mcp.json` / `.cursor/mcp.json` | `mcpServers` | Settings → MCP |
| Cline | `cline_mcp_settings.json` | `mcpServers` | MCP Servers → Configure |
| OpenCode | `opencode.json` | `mcp` + `type: "local"` | **command เป็น array**, env ใช้คีย์ `environment` |
| Kiro | `.kiro/settings/mcp.json` / `~/.kiro/settings/mcp.json` | `mcpServers` | ต่อ server ใหม่จากแผง MCP ได้ไม่ต้อง restart |
| Kilo Code | `~/.config/kilo/kilo.json` / `.mcp.json` | `mcp` (opencode-style) | อ่าน `.mcp.json` แบบ Claude Code ได้ด้วย |
| Qwen Code | `~/.qwen/settings.json` / `.qwen/settings.json` | `mcpServers` | มี `qwen mcp add` |
| Kimi Code | `~/.kimi/mcp.json` | `mcpServers` | มี `--mcp-config-file`; บางรุ่นใช้ `~/.kimi-code/mcp.json` |
| Muse Code | `~/.config/muse/settings.json` | `mcpServers` + `transport: "stdio"` | ต้องมี `schema_version: 1`; ห้ามปนคีย์ `mcp_servers` |
| MiMo Code | `~/.config/mimocode/mimocode.jsonc` | `mcp` (opencode-style) | คีย์ `mcpServers` ถูก reject — ต้องใช้ `mcp` |
| Qoder | `~/.qoder/settings.json` / `.qoder/settings.json` | `mcpServers` | มี `qoder mcp add --scope … --transport stdio` |
| ZCode | `~/.zcode/cli/config.json` | `mcp.servers` (ซ้อน) | workspace: `.zcode/config.json` |
| Hermes | `~/.hermes/config.yaml` | `mcp_servers` (YAML) | secret ใช้ `${env:VAR}` |
| OpenClaw | `~/.openclaw/openclaw.json` | `mcp.servers` (ซ้อน) | มี `openclaw mcp set` |
| Grok | ดูรายข้อ | แยกตามผลิตภัณฑ์ | CLI ใช้ stdio ได้; grok.com รับเฉพาะ remote (ยังไม่รองรับ) |
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` | `mcpServers` | ดู README หัวข้อต่อเข้า Claude Desktop |

## 1. Claude Code

ไฟล์ project (แชร์ผ่าน git ได้ — แต่ห้ามใส่ค่า env จริง): `.mcp.json` ที่ root;
ไฟล์ global: `~/.claude.json` — หรือสั่ง `claude mcp add smartport -- node <path>`
แล้วตรวจด้วย `/mcp` ใน session

```json
{
  "mcpServers": {
    "smartport": {
      "type": "stdio",
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

## 2. Codex (OpenAI CLI)

ไฟล์: `~/.codex/config.toml` — หรือสั่ง `codex mcp add smartport -- node <path>`

```toml
[mcp_servers.smartport]
command = "node"
args = ["C:\\path\\to\\smart-port\\mcp-server\\dist\\index.js"]

[mcp_servers.smartport.env]
SMARTPORT_API_URL = "https://smart-port.onrender.com/api"
SP_SERVICE_USERNAME = "sp_mcp_service"
SP_SERVICE_PASSWORD = "<รหัส>"
```

## 3. Cursor

ไฟล์ global `~/.cursor/mcp.json` หรือ project `.cursor/mcp.json`
(หรือ Settings → MCP → Add new MCP Server) — ทรงเดียวกับ Claude Code:

```json
{
  "mcpServers": {
    "smartport": {
      "type": "stdio",
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

## 4. Cline (VS Code extension)

Cline sidebar → ไอคอน MCP servers → Configure MCP Servers (ไฟล์
`cline_mcp_settings.json`, บน Windows อยู่ที่
`%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\`):

```json
{
  "mcpServers": {
    "smartport": {
      "type": "stdio",
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

## 5. OpenCode

ไฟล์ `opencode.json`/`opencode.jsonc` (project) หรือ
`~/.config/opencode/opencode.json` (global) — **รูปทรงต่างจากเจ้าอื่น:**
`command` เป็น **array** และ env ใช้คีย์ **`environment`** — ตรวจด้วย `/mcp`

```json
{
  "mcp": {
    "smartport": {
      "type": "local",
      "command": ["node", "C:\\path\\to\\smart-port\\mcp-server\\dist\\index.js"],
      "environment": {
        "SMARTPORT_API_URL": "https://smart-port.onrender.com/api",
        "SP_SERVICE_USERNAME": "sp_mcp_service",
        "SP_SERVICE_PASSWORD": "<รหัส>"
      },
      "enabled": true
    }
  }
}
```

## 6. Kiro (AWS IDE)

ไฟล์ project `.kiro/settings/mcp.json` หรือ global `~/.kiro/settings/mcp.json`
(ต่อ server ใหม่จากแผง MCP ได้โดยไม่ต้อง restart):

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

## 7. Kilo Code

ไฟล์ global `~/.config/kilo/kilo.json` (Windows: `%APPDATA%/kilo/kilo.json`)
หรือ project `kilo.json` — ใช้รูปทรง opencode-style (คีย์ `mcp`,
command เป็น array):

```json
{
  "$schema": "https://kilo.ai/config.json",
  "mcp": {
    "smartport": {
      "type": "local",
      "command": ["node", "C:\\path\\to\\smart-port\\mcp-server\\dist\\index.js"],
      "enabled": true
    }
  }
}
```

ทางเลือก: Kilo อ่าน `.mcp.json` ที่ project root ด้วยรูปทรงเดียวกับ
Claude Code ได้ — ใช้ไฟล์นั้นถ้าต้องการแชร์ config ข้ามทีม

## 8. Qwen Code (Alibaba CLI)

ไฟล์ user `~/.qwen/settings.json` (Windows: `%USERPROFILE%\.qwen\settings.json`)
หรือ project `.qwen/settings.json` — หรือสั่ง `qwen mcp add`:

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

## 9. Kimi Code / Kimi CLI (Moonshot)

ไฟล์ `~/.kimi/mcp.json` (บางรุ่น/เอกสารใช้ `~/.kimi-code/mcp.json` หรือ
`$KIMI_CODE_HOME/mcp.json` — ถ้าไฟล์แรกไม่ถูกอ่านให้ลองชื่อที่สอง):

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

ทางลัดไม่ต้องแก้ไฟล์: `kimi --mcp-config-file /path/to/mcp.json`
(หรือ `--mcp-config '{...}'` แบบ inline), ไม่มี `mcp add` — ใช้ TUI `/mcp-config`

## 10. Muse Code (Meta CLI)

ไฟล์ global อย่างเดียว: `~/.config/muse/settings.json`
(หรือ `$XDG_CONFIG_HOME/muse/settings.json`) — ต้องมี `schema_version: 1`
ระดับ top-level และใช้คีย์ `mcpServers` (camelCase) **ห้ามปนกับคีย์ legacy
`mcp_servers`** (ถ้ามีทั้งสอง loader จะทิ้ง MCP ทั้งก้อน):

```json
{
  "schema_version": 1,
  "mcpServers": {
    "smartport": {
      "transport": "stdio",
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

ย้าย config จากเจ้าอื่นได้ด้วย `muse mcp import --from claude`
(หรือ `--from opencode`), ตรวจด้วย `muse mcp list`

## 11. MiMo Code (Xiaomi — fork ของ OpenCode)

ไฟล์ `~/.config/mimocode/mimocode.jsonc` (หรือ `.json`) — ใช้ schema เดียวกับ
OpenCode (คีย์ `mcp`, `type: "local"`, command เป็น array) —
**ห้ามใช้คีย์ `mcpServers`** (CLI รุ่นใหม่ reject ด้วย `Unrecognized key`):

```jsonc
{
  "$schema": "https://mimo.xiaomi.com/mimocode/config.json",
  "mcp": {
    "smartport": {
      "type": "local",
      "command": ["node", "C:\\path\\to\\smart-port\\mcp-server\\dist\\index.js"],
      "environment": {
        "SMARTPORT_API_URL": "https://smart-port.onrender.com/api",
        "SP_SERVICE_USERNAME": "sp_mcp_service",
        "SP_SERVICE_PASSWORD": "<รหัส>"
      },
      "enabled": true
    }
  }
}
```

## 12. Qoder (Alibaba IDE/CLI)

ไฟล์ user `~/.qoder/settings.json` หรือ project `.qoder/settings.json`
(คีย์ `mcpServers`) — หรือสั่ง `qoder mcp add --scope user --transport stdio`
(ใน IDE: Settings → MCP → My Servers → + Add):

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

## 13. Antigravity (Google IDE)

ไฟล์หลัก: `~/.gemini/antigravity/mcp_config.json`
(Windows: `%USERPROFILE%\.gemini\antigravity\mcp_config.json`) —
บางรุ่นอ่าน `~/.gemini/config/mcp_config.json` (แชร์ IDE+CLI) หรือ project
`.antigravity/mcp.json` แทน ถ้าไฟล์หลักไม่ถูกอ่านให้เปิดใน IDE ผ่าน
"… → MCP store → Manage MCP Servers → View raw config" แล้วยืนยัน path:

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

## 14. ZCode (Z.AI)

ไฟล์ user `~/.zcode/cli/config.json` — **servers ซ้อนใต้ `mcp.servers`**
(ไม่ใช่ `mcpServers` ระดับ top-level); workspace ใช้ `<repo>/.zcode/config.json`
หรือ `<repo>/zcode.json`; มี fallback `.agents/mcp.json` (ทรง `mcpServers`
มาตรฐาน — อ่านเฉพาะเมื่อไฟล์หลักไม่มี server เลย):

```json
{
  "mcp": {
    "servers": {
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
}
```

## 15. Hermes Agent

ไฟล์ `$HERMES_HOME/config.yaml` (default `~/.hermes`) คีย์ `mcp_servers` —
เป็น **YAML** และอ้าง secret ด้วย `${env:VAR}` ได้:

```yaml
mcp_servers:
  smartport:
    command: "node"
    args: ["C:\\path\\to\\smart-port\\mcp-server\\dist\\index.js"]
    env:
      SMARTPORT_API_URL: "https://smart-port.onrender.com/api"
      SP_SERVICE_USERNAME: "sp_mcp_service"
      SP_SERVICE_PASSWORD: "${env:SP_SERVICE_PASSWORD}"
```

## 16. OpenClaw

ไฟล์ `~/.openclaw/openclaw.json` ใต้คีย์ **`mcp.servers`** (ซ้อนเหมือน ZCode) —
หรือสั่ง `openclaw mcp set smartport '<json-entry>'` แล้วตรวจด้วย
`openclaw mcp show`:

```json
{
  "mcp": {
    "servers": {
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
}
```

## 17. Grok (xAI) — แยกตามผลิตภัณฑ์

- **Grok CLI (superagent-ai/grok-cli):** ไฟล์ `.grok/settings.json` (project)
  หรือ `~/.grok/user-settings.json` คีย์ `mcpServers` ทรงมาตรฐาน
  (command/args/env) — หรือตั้งผ่าน TUI `/mcps`
- **Grok Build TUI (xAI):** ไฟล์ `~/.grok/config.toml` ทรงเดียวกับ Codex
  (`[mcp_servers.smartport]` + command/args/env) — หรือสั่ง
  `grok mcp add/list/remove`
- **grok.com / xAI API:** รับเฉพาะ **remote MCP** (ใส่ URL ผ่าน Settings →
  Connectors หรือ `server_url` ใน API) — server ตัวนี้เป็น stdio-only
  จึง**ใช้ด้วยไม่ได้** จนกว่าจะมี transport แบบ HTTP (งานเฟสถัดไป)
  หรือรันผ่าน tunnel เอง

## หมายเหตุความน่าเชื่อถือ

- ทุกรายการข้างบนสอบกับเอกสาร/ตัวอย่าง config จริงที่ค้นได้ ณ 2026-09-26 —
  เจ้าที่ path แกว่งตามรุ่น (Antigravity, Kimi, Kilo) ระบุทางเลือกไว้ให้แล้ว
- ถ้า client รุ่นใหม่อ่าน config ไม่ติด ให้เช็ก 3 อย่างก่อน: absolute path,
  ชื่อคีย์ (`mcpServers` vs `mcp` vs `mcp.servers` vs `mcp_servers`),
  และ restart client หลังแก้ไฟล์


