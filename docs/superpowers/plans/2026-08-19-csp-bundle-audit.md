# CSP Bundle Audit Gate — Implementation Plan (R2)

> **For agentic workers:** ใช้ superpowers:subagent-driven-development หรือ executing-plans · steps ใช้ checkbox

**Goal:** เปลี่ยน static audit ของ bundle จาก "ร้อยแก้วในเอกสารที่ครอบแค่ 6 จาก 65 chunk" เป็นสคริปต์ที่ตรวจ **ทุกไฟล์ใน build output** แล้ว fail ถ้าพบสิ่งที่จะชน CSP หลัง enforce

**Architecture:** สคริปต์เดี่ยว `scripts/audit-bundle-csp.mjs` อ่าน CSP policy จาก `render.yaml` (single source of truth เดียวกับ `verify-live-headers.mjs` — reuse `parseRenderHeaders` ที่ export ไว้แล้ว) แล้วสแกน `frontend/dist` ทั้งโฟลเดอร์ ตรวจว่าไม่มีอะไรที่ policy จะบล็อก · ไม่ยิงเน็ต ไม่ต้องใช้ Docker → เสียบเป็น CI gate ได้จริง

**Tech Stack:** Node 24 (`node:fs`, `node:test`) — ไม่มี dependency ใหม่

**Spec:** ไม่มี spec แยก — ที่มาคือข้อเสนอ R2 ใน `project-log-md/claude-code/handoff-2026-08-18-csp-baseline-shipped.md` และหัวข้อ static audit ใน `docs/frontend-security-headers.md`

## Global Constraints

- **fail-closed ทุกกรณีที่ไม่รู้**: ไม่มี `frontend/dist` = fail (ไม่ใช่ skip) · parse policy ไม่ได้ = fail · เจอ origin ที่ไม่รู้จัก = fail
- **allowlist ต้องมาจาก policy เป็นหลัก** — origin ที่ policy อนุญาตอยู่แล้ว (`fonts.googleapis.com`, `fonts.gstatic.com`) มาจากการ parse ไม่ใช่ hardcode · ข้อยกเว้นที่ hardcode ได้มีเฉพาะ URL ที่ **ไม่เคยถูก fetch** และต้องมีคอมเมนต์อธิบายเหตุผลรายตัว
  - **ข้อยกเว้นชั้นที่สองที่เกิดขึ้นจริงระหว่างทาง**: `NON_BROWSER_FILES` ยกเว้นทั้ง**ไฟล์** ไม่ใช่แค่ URL
    (`_redirects` = ไฟล์ตั้งค่าของ Render edge ที่ browser ไม่เคยโหลด แม้ข้างในจะมี URL ของ backend)
    แผนเดิมไม่ได้เปิดช่องนี้ไว้ · อยู่ใต้กฎเดียวกับ `NON_FETCHED_ORIGINS` คือ **ต้องมีเหตุผลรายตัว
    และถูกพิมพ์ออกทุกครั้งที่รัน** เพื่อไม่ให้ "ไม่ได้ตรวจ" ถูกนับเป็น "ตรวจแล้วสะอาด"
- ไม่ยิงเครือข่าย ไม่ใช้ Docker — ต้องรันได้บนเครื่องเปล่าที่มีแค่ `frontend/dist`
- โค้ดคอมเมนต์ภาษาไทย ตามแบบ `scripts/verify-live-headers.mjs` / `scripts/csp-report-selftest.mjs`
- ข้อความ error ต้องบอก **ไฟล์ + สิ่งที่เจอ + directive ไหนที่จะบล็อกมัน** ไม่ใช่แค่ "พบปัญหา"

## ข้อเท็จจริงที่วัดจาก build ปัจจุบัน (2026-08-19)

| สิ่งที่วัด | ค่า |
|---|---|
| JS chunk ใน `frontend/dist/assets/` | **65 ไฟล์** (เอกสารเดิมอ้างว่าตรวจ 6 จาก ~24) |
| absolute URL ใน JS ทั้งหมด | **5 ตัว**: `http://www.w3.org` ×4 (XML/SVG namespace — ไม่ใช่การโหลด), `https://vuejs.org` ×1 (ลิงก์ในข้อความ error ของ Vue) |
| `url(http...)` ใน CSS | **0** |
| ไฟล์ font ใน dist | **0** — ยืนยันว่าความเสี่ยงเรื่อง `font-src` ที่ไม่มี `'self'` ยังไม่เกิดจริง |

allowlist จึงเล็กและอธิบายได้ครบ — false positive แทบเป็นศูนย์

---

### Task 1: สคริปต์ audit + เทส

**Files:**
- Create: `scripts/audit-bundle-csp.mjs`
- Create: `scripts/tests/audit-bundle-csp.test.mjs`

**Interfaces:**
- Consumes: `parseRenderHeaders(yaml)` ที่ `scripts/verify-live-headers.mjs` export ไว้แล้ว
- Produces: `auditBundle(distDir, cspValue) -> {findings: Array<{file, rule, detail, directive}>, inspected, skipped}` · `parseCspPolicy(policyValue) -> Map<directive, string[]>` · CLI exit 0/1
  - รับ **CSP string ดิบ** แล้ว `parseCspPolicy` ข้างในเอง (แผนเดิมเขียน `policy` ที่ parse แล้ว) —
    ผู้เรียกทุกทางมี string อยู่ในมือพอดี การให้ parse ข้างในทำให้ไม่มีสองสำเนาของ policy ที่เพี้ยนกันได้
  - คืน `inspected` / `skipped` ด้วย เพราะ "ตรวจแล้วกี่ไฟล์ ข้ามกี่ไฟล์ เพราะอะไร" ต้องพิมพ์ทุกครั้ง
    ไม่งั้นไฟล์ที่ไม่เคยถูกเปิดจะถูกนับรวมในคำว่า "ตรวจแล้วสะอาด"

**กฎที่ต้องตรวจ (แต่ละข้อผูกกับ directive จริงใน policy):**

| # | กฎ | directive ที่รองรับ | ทำไม |
|---|---|---|---|
| R1 | ไม่มี inline `<script>` ที่มีเนื้อหา และไม่มี inline event handler (`on*=`) ใน `.html` | `script-src` ที่ไม่มี `'unsafe-inline'` | inline script จะถูกบล็อกทันทีหลัง enforce |
| R2 | ไม่มี `eval(` / `new Function(` ใน `.js` | `script-src` ที่ไม่มี `'unsafe-eval'` | เดียวกัน |
| R3 | ทุก absolute URL ใน `.js`/`.css` ต้องอยู่ใน allowlist | `connect-src` / `img-src` / `style-src` / `font-src` | URL ที่ไม่ได้ประกาศจะถูกบล็อกตอน fetch |
| R4 | ไม่มี `url(http...)` ใน `.css` ที่ origin ไม่อยู่ใน allowlist | `img-src` / `font-src` | เดียวกัน |
| R5 | ไม่มีไฟล์ font ใน `dist` | `font-src` ที่ไม่มี `'self'` | **ความเสี่ยงที่เอกสารเตือนไว้ข้อ 2** — ย้ายมา self-host font เมื่อไรพังทันทีทั้งที่ดูเหมือนแค่เปลี่ยน asset |

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน** — สร้าง `scripts/tests/audit-bundle-csp.test.mjs` ที่สร้าง fixture dist ชั่วคราวใน temp dir (ไม่แตะ `frontend/dist` จริง) แล้วครอบเคส: bundle สะอาด → 0 finding · inline script → finding ผูก `script-src` · `eval(` → finding · URL นอก allowlist → finding พร้อมชื่อ origin · URL ที่ policy อนุญาต (`fonts.gstatic.com`) → ไม่ finding · ไฟล์ `.woff2` → finding ผูก `font-src` · dist ไม่มีอยู่ → throw/exit 1 (ไม่ใช่ผ่านเงียบ)
- [ ] **Step 2: รันเทสให้เห็นว่า fail** — `timeout 300 node --test scripts/tests/audit-bundle-csp.test.mjs` → `Cannot find module`
- [ ] **Step 3: เขียนสคริปต์** ตามกฎ R1-R5 พร้อม allowlist ที่มีคอมเมนต์เหตุผลรายตัว (`www.w3.org` = XML namespace ไม่ใช่ URL ที่ถูกโหลด · `vuejs.org` = ลิงก์ในข้อความ error) และ fail-closed เมื่อ parse policy ไม่ได้/ไม่มี dist
- [ ] **Step 4: รันเทสให้ผ่าน**
- [ ] **Step 5: รันกับ bundle จริง** — `node scripts/audit-bundle-csp.mjs` ต้อง **exit 0** บน build ปัจจุบัน (ถ้าไม่ผ่าน แปลว่าเจอของจริงที่เอกสารเดิมมองไม่เห็น — รายงานก่อนแก้ อย่าผ่อนกฎเพื่อให้เขียว)
- [ ] **Step 6: Commit**

### Task 2: เสียบเป็น gate + อัปเดตเอกสาร

**Files:**
- Modify: `scripts/ci-local.sh` · `scripts/ci-local.ps1` (ต่อจากขั้น frontend build เพราะต้องมี `dist`)
- Modify: `.githooks/pre-push` — **เสียบเพิ่มหลังรีวิว**: ci-local ไม่มีอะไรบังคับให้ใครรัน และ
  GitHub Actions ปิด auto-trigger อยู่ (quota) hook นี้จึงเป็นที่เดียวที่ gate ถูกบังคับจริงทุกครั้ง ·
  ตรวจเฉพาะเมื่อมี `dist` อยู่แล้ว เพราะ hook ตั้งใจให้เบา (ไม่ build ให้เอง) และเมื่อไม่มีต้อง
  **พิมพ์บอกว่ายังไม่ได้ตรวจพร้อมวิธีแก้** ไม่ใช่เงียบ
- Modify: `docs/frontend-security-headers.md` (§การทดสอบ + แทนที่ตาราง static audit แบบร้อยแก้ว)

- [ ] **Step 1: เสียบเข้า ci-local ทั้งสองไฟล์** หลังบล็อก frontend build (ต้องรันหลัง `npm run build` เพราะอ่าน `dist`)
- [ ] **Step 2: อัปเดต `docs/frontend-security-headers.md`** — เพิ่มรายการสคริปต์ใน §การทดสอบ และแก้ตาราง static audit ให้ระบุว่า **ตอนนี้ตรวจอัตโนมัติครบทุกไฟล์แล้ว** (เดิมเขียนว่าครอบ 6 จาก ~24 chunk) พร้อมคงข้อความความเสี่ยง 2 ข้อเดิมไว้ (`VITE_API_URL` แบบ absolute · `font-src` ที่ไม่มี `'self'`) และระบุว่าข้อหลังตอนนี้มี gate จับแล้ว
- [ ] **Step 3: รัน gate ทั้งชุด** — `node scripts/validate-schema-parity.mjs` · `node --test scripts/tests/*.test.mjs` · `node scripts/audit-bundle-csp.mjs`
- [ ] **Step 4: Commit**

---

## หลังจบ

1. code review อิสระ (`superpowers:requesting-code-review`) — งานนี้ผู้เขียนแผนกับผู้ลงมือเป็นคนเดียวกัน จึงต้องมีตาที่สาม
2. push + PR อ้าง issue #113
