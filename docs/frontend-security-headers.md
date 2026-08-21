# Frontend Security Headers & Cache Policy (issue #113 — ระยะที่ 1)

อัปเดต: 2026-08-17

## Deploy paths และที่ที่ headers ถูกประกาศ

| Path | ใช้ตอน | Headers ประกาศที่ |
|---|---|---|
| Render static site (`smart-port.onrender.com`) | **production** | `render.yaml` → `headers:` (ไม่ใช่ nginx.conf!) |
| Docker/Nginx (`localhost:8081`) | local/compose | `frontend/nginx-security-headers.conf` (snippet ที่ `nginx.conf` include — Issue #126) |
| Vite dev (`localhost:5174`) | dev | ไม่มี security headers (ไม่เป็นไร — dev only) |

บทเรียน: repo เคยมี headers เฉพาะใน `nginx.conf` ซึ่ง production ไม่ได้ใช้เลย
เพราะ Render static site ไม่รัน nginx → ต้องประกาศใน blueprint ด้วยเสมอ

## Header set ที่ตกลง

| Header | ค่า | หมายเหตุ |
|---|---|---|
| `Content-Security-Policy-Report-Only` (render.yaml) / `Content-Security-Policy` (nginx) | ดูข้างล่าง | Render เริ่ม report-only เพื่อ inventory; nginx enforce เลย |
| `X-Frame-Options` | `DENY` | + `frame-ancestors 'none'` ใน CSP |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | |
| `Permissions-Policy` | `camera=(), geolocation=(), microphone=(), payment=()` | |
| `X-Content-Type-Options` | `nosniff` | |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | render.yaml เท่านั้น (nginx local เป็น http) |

### CSP

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com;
img-src 'self' data:;
connect-src 'self';
object-src 'none';              ← Issue #125: ไม่ใช้ plugin/embed
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
report-uri /api/csp-report     ← เฉพาะ render.yaml (report-only phase)
```

เหตุผลแต่ละ allowance:
- `style-src 'unsafe-inline'` — Vue runtime set inline style attribute ผ่าน `:style`
- `https://fonts.googleapis.com` / `fonts.gstatic.com` — Noto Sans Thai (Google Fonts ใน index.html)
- `img-src data:` — รองรับ data-URI thumbnail เล็ก ๆ
- `connect-src 'self'` พอเพราะ `/api/*` ถูก rewrite ฝั่ง server ไป backend (same-origin ในสายตา browser)

**ไม่อนุญาต** `unsafe-eval`, wildcard scheme (`http: https:`), หรือ `blob:` ใน default-src อีกต่อไป

## Cache behavior (app shell) — decision

- **Render (production) — กฎเดียวทั้ง site (shell + hashed assets):** `Cache-Control: no-cache`
  — revalidate ทุกครั้ง (ETag ทำให้ได้ 304 เมื่อเนื้อหาไม่เปลี่ยน) กัน stale shell ที่อ้างอิง
  hashed chunk ที่หายไปแล้ว เหตุผลที่ไม่แยกกฎ `immutable` ให้ assets บน Render:
  engine จัดกฎ Cache-Control ซ้อนทับ (`/*` + `/assets/*`) แบบ non-deterministic
  (วัดจริง 2026-08-17 รอบ 5 — ด้านล่าง)
- **nginx (Docker local):** shell `no-store` แต่ `/assets/*` ยังเป็น `public, immutable`
  ได้ เพราะ location matching ของ nginx เป็น longest-prefix deterministic
- ข้อมูล auth ไม่เคยถูก cache (มาทาง `/api/*` ของ backend)

## Live verification — Render Cache-Control precedence (issue #125)

**ผลตรวจ 2026-08-16 รอบที่ 2 (~10:47 UTC) หลัง merge #125 เข้า main:** auto-deploy
จาก push main ทำงานจริง (site rebuild 10:28 UTC, asset hash ใหม่) แต่ `/` และ
`/assets/*` ยังคงคืน default `Cache-Control: public, max-age=0, s-maxage=300` และ
ไม่มี header จาก render.yaml เลย → **code-push auto-deploy ไม่ re-sync blueprint
config** (ใช้ config ของ last-synced blueprint) ต้อง manual Sync จาก dashboard เท่านั้น

**ผลตรวจ 2026-08-16 รอบที่ 3 (~18:04–18:11 UTC) ด้วย `scripts/verify-live-headers.mjs`:**
ยังเป็น default เหมือนเดิมทุกจุด — `/` และ `/assets/index-B1YyXcfC.js` (ชื่อ asset
เดิมตั้งแต่รอบ 1 = ไม่มี build ใหม่หลัง 10:28 UTC) คืน `Cache-Control: public,
max-age=0, s-maxage=300` และไม่มี CSP-Report-Only / X-Frame-Options / Referrer-Policy /
Permissions-Policy หลักฐานเสริมว่า header ที่เห็นมาจาก edge layer ไม่ใช่ render.yaml:
HSTS จริงเป็น `max-age=315360000; includeSubdomains; preload` ซึ่งไม่ใช่ค่าที่ render.yaml
ประกาศ (`max-age=31536000; includeSubDomains`) และ `x-content-type-options: nosniff`
ก็มีอยู่แล้วก่อน sync — สองตัวนี้จึง**ไม่ใช่**สัญญาณว่า blueprint ถูก apply (สคริปต์
จึงถือ HSTS ค่า-ไม่-ตรงเป็น warning ไม่ใช่ fail)

**ผลตรวจ 2026-08-17 รอบที่ 4 (~06:35 UTC) หลังสร้าง Blueprint instance (associate existing):**
header ทั้งชุดขึ้นจริงครั้งแรก — CSP-Report-Only / X-Frame-Options / Referrer-Policy /
Permissions-Policy / XCTO และ `Cache-Control: no-cache` บน shell (backend ยืนที่ `075483f`,
`/api/*` rewrite ยังใช้ได้) root cause ของรอบ 1–3: **บัญชี Render ไม่เคยมี Blueprint instance
เลย** — render.yaml ไม่เคยถูกอ่าน ต้องสร้าง instance แบบ *Associate existing services*
(PR #137 reconcile ให้ config ตรงของจริงก่อน) จุดที่ยังไม่ผ่านรอบนี้: asset ได้ `no-cache`
จากกฎ `/*` แทน `immutable` จากกฎ `/assets/*`

**ผลตรวจ 2026-08-17 รอบที่ 5 (~07:04–07:45 UTC) — precedence ของกฎซ้อนทับคือ
non-deterministic:** สมมติฐานแรกคือ "กฎแรกที่ match ชนะ" เลยสลับลำดับให้กฎ `/assets/*`
ขึ้นก่อน (PR #138) — แต่หลัง sync จริง (deploy 07:04 UTC + manual sync) ค่ายังแกว่ง
~90/10 ต่อ request: ยิง URL asset เดิมซ้ำ 3 ครั้งติดกันได้ทั้ง `immutable` และ `no-cache`,
HEAD ตรง origin (cf MISS) ก็สลับค่าเช่นกัน (ไม่ใช่ edge cache) สรุป: **engine ของ Render
จัดกฎ Cache-Control สองตัวที่ path ทับกันแบบไม่ deterministic** (สลับลำดับก็ไม่ช่วย —
docs ของ Render ไม่ระบุเรื่องนี้ สรุปจากการวัดจริงเท่านั้น) → **decision รอบปลาย: ตัดกฎ
`/assets/*` ออก เหลือ `no-cache` เดียวทั้ง site** (PR #139) ยอมแลก asset caching กับความ
deterministic เพราะ stale shell ที่ชี้ chunk หาย แพงกว่า perf ที่เสียจาก revalidate
(ETag ยังทำให้ได้ 304 เมื่อเนื้อหาไม่เปลี่ยน) ผลหลัง sync PR #139 (deploy 08:18 UTC):
`verify-live-headers.mjs` **PASS เต็ม** (shell + asset ครบทุก header) และค่าจริง
deterministic — 8 request ติด ๆ ได้ `no-cache` เหมือนกันหมดไม่มีแกว่ง → **#131 ปิดจบ**

**ผลตรวจรอบแรก (เช้าวันเดียวกัน):** ทั้ง `/` และ `/assets/index-B1YyXcfC.js` คืนค่า
default ของ Render และไม่มี header อื่นจาก render.yaml เลย (ไม่มี CSP-Report-Only/
X-Frame-Options ฯลฯ) ทั้งที่ site ถูก deploy ใหม่ → header จาก blueprint ยังไม่มีผลจริง
สาเหตุที่เป็นไปได้: (1) blueprint นี้ปิด auto-sync ไว้ หรือ (2) static site นี้ไม่ได้ถูก
manage โดย blueprint นี้ตั้งแต่แรก (เช่น สร้างก่อนรับ render.yaml เข้ามา) — Render ค่า
default คือ [auto-sync ทุกครั้งที่ push blueprint changes](https://render.com/docs/infrastructure-as-code)
และ [docs ของ static-site headers](https://render.com/docs/static-site-headers)
ไม่ระบุ precedence สำหรับ path pattern ที่ทับกัน จึงต้องวัดจริงเท่านั้น

**Checklist นี้จบแล้ว (resolved รอบ 4–5, 2026-08-17):** blueprint adopt สำเร็จ header
ครบ และ Cache-Control ใช้กฎเดียว `no-cache` ทั้ง site — การตรวจประจำวันใช้
`node scripts/verify-live-headers.mjs` อย่างเดียว (gate อ่าน render.yaml เป็น source of
truth และ fail-closed เมื่อโครงสร้างเปลี่ยน)

## CSP monitoring ก่อน enforce

1. report-only phase: browser ส่ง violation ไป `POST /api/csp-report` (public, ไม่เก็บ body —
   log เฉพาะ directive + host ของ blocked URI ผ่าน `error_log`) ดูได้จาก Render log
2. เกณฑ์ promote เป็น enforce: Render log ไม่มี violation จากระบบจริง ≥ 7 วัน
   (violation จาก extension ของ user เช่น `chrome-extension:` ตัดทิ้งได้)
3. วิธี enforce: ใน `render.yaml` เปลี่ยน key `Content-Security-Policy-Report-Only`
   เป็น `Content-Security-Policy` (ค่าเดิม ตัด `report-uri` หรือไว้ต่อก็ได้)
   แล้วอัปเดตเทส `securityHeaders.test.js`

### Baseline check 2026-08-17 (~14:24–14:45 UTC) — วันที่ headers live วันแรก

หน้าต่าง 7 วันเพิ่งเริ่มนับวันนี้ (`last-modified` ของ `/` = 08:18 UTC 17 ส.ค. — เวลา deploy
ของ PR #139; header ขึ้นจริงตั้งแต่รอบ 4 ~06:35 UTC ใช้ค่าที่ช้ากว่าเพื่อความอนุรักษ์นิยม)
→ **จุดตัดสินใจ enforce เร็วที่สุดคือ 24 ส.ค. 2026** วันนี้เก็บได้แค่ baseline

- **pipeline ส่งถึง endpoint ได้จริง**: POST self-test ไป `https://smart-port.onrender.com/api/csp-report`
  (ผ่าน rewrite `/api/*` แบบเดียวกับที่ browser ใช้) → **HTTP 204** ตามสัญญาของ handler
  marker ที่ใช้คือ `blocked-host=csp-selftest.invalid` (directive `img-src`) — **เวลา ~14:45 UTC
  17 ส.ค. เป็นของทีม ไม่ใช่ violation จริง ให้ตัดทิ้งตอนอ่าน log** (ความสำคัญ: ถ้าไม่ยืนยันข้อนี้
  "log ว่าง" จะแยกไม่ออกระหว่าง "ไม่มี violation" กับ "report ไม่เคยส่งถึง")
  - **log อยู่ที่ service `smartport-backend` ไม่ใช่ static site `smart-port`** — `error_log()`
    ที่ handler เรียกออก stderr ของ container backend (`Dockerfile:64` ตั้ง `error_log = /dev/stderr`)
    เปิด log ผิด service จะเห็นว่างเสมอ และ hop สุดท้าย (`error_log` → Render log stream)
    ยังไม่เคยถูกยืนยันด้วยตา เพราะ session นี้เข้าถึง Render log ไม่ได้
  - **ข้อควรระวังที่ยังทำให้ "log ว่าง" ตีความไม่ได้ 100%:** POST นัดแรก timeout ที่ 30 วินาที
    ต้อง warm up ด้วย `GET /api/readyz` (ตอบ 200 ใน 1.1s) ก่อนจึงยิงผ่าน — ตอนนั้นสรุปสาเหตุ
    ไม่ได้ระหว่าง network hiccup ของ gateway (เคยเจอ 16 ส.ค.) กับ cold start
    **หลักฐานเพิ่ม 2026-08-18 05:00 UTC:** รอบนั้น request แรกคือ `GET /api/readyz` เอง
    และใช้เวลา **23.1 วินาที** ส่วน POST ถัดมาเร็วปกติ — รูปแบบ "request แรกที่ชน container
    ที่หลับช้ามาก ถัดไปเร็ว" ตรงกันทั้งสองรอบ จึงอธิบายได้ด้วย spin down อย่างเดียวโดยไม่ต้อง
    พึ่ง network hiccup (ยังเป็นการวัดครั้งเดียว ไม่ใช่ข้อพิสูจน์ปิดตาย) และยิ่งตอกย้ำว่า
    **backend เป็น `plan: free` ที่ spin down เมื่อไม่มี traffic** ซึ่งเป็นกลไกจริง และ CSP report เป็น
    fire-and-forget ไม่มี retry → report ที่ browser ยิงตอน backend หลับหายเงียบได้
    ในแอป HR ที่ traffic ต่ำ การเปิดหน้าแรกของวัน (จุดที่ violation จะโผล่พอดี) คือจุดที่
    backend หลับพอดี นอกจากนี้ handler ยัง rate limit ที่ 60 req/นาที ต่อ IP
    (`api.php:122`) — หน้าที่มี subresource ถูกบล็อกเยอะอาจชนเพดานจนบาง report ถูกทิ้ง
  - **ก่อนอ่าน log วันที่ 24 ให้ยิง self-test ใหม่ 1 นัดเพื่อให้ได้ marker สด** (Render retention
    ของ plan ที่ไม่ใช่ Enterprise ราว 7 วัน = marker ของ 17 ส.ค. จะอยู่ริมขอบพอดีหรือหลุดไปแล้ว)
    คำสั่งเดียวจบ — warm up `/api/readyz` ให้เองก่อน แล้วพิมพ์บรรทัดที่ต้องเอาไปค้นใน log:

    ```bash
    node scripts/csp-report-selftest.mjs
    ```

    marker ผูกวันที่ UTC + nonce (`csp-selftest-YYYYMMDD-xxxx.invalid`) จึงแยก "marker ที่เพิ่งยิง"
    ออกจากรอบก่อน ๆ ได้แม้รันหลายรอบในวันเดียวกัน — **ใช้ค่าที่สคริปต์พิมพ์ออกมาไปค้นเท่านั้น
    อย่าค้นด้วย prefix `csp-selftest-` ลอย ๆ** เพราะจะไปเจอ marker ของรอบเก่า
    **อ่านผลของสคริปต์ให้ครบสองทิศ:**
    - `exit 1` = ยังไม่มี marker สดในรอบนี้ → ห้ามข้ามไปอ่าน log
    - `exit 0` = request ถึงปลายทางและได้ 204 เท่านั้น **ไม่ใช่หลักฐานว่า marker ถูก log**
      (handler ตอบ 204 แม้แกะ body ไม่ได้ และ `error_log()` อาจเขียนไม่ลง) — ยังต้องเห็นด้วยตา
    - marker ที่เป็นของทีมและมีอยู่แล้วใน log (ตัดทิ้งตอนอ่าน ไม่ใช่ violation จริง):
      `csp-selftest.invalid` (17 ส.ค. ~14:45 UTC, ยิงด้วยมือ) ·
      `csp-selftest-20260818.invalid` (18 ส.ค. 05:00 UTC) ·
      `csp-selftest-20260818-ecc9.invalid` (18 ส.ค. 05:10 UTC) — สองตัวหลังคือรอบ validate
      สคริปต์กับ production ทั้งคู่ได้ 204 และ **จะหลุด retention ~7 วันพอดีช่วง 24–25 ส.ค.**

    **decision rule: เจอ marker สด → pipeline ครบวงจร ตัด marker ทิ้งแล้วดูที่เหลือ;
    ไม่เจอ marker → สรุปไม่ได้ ห้าม enforce**
  - **เมื่อ CSP counter (R1) ถูกเปิดใช้บน production แล้ว** ขั้นตอนนี้เหลือสองคำสั่งและไม่ต้องเปิด
    dashboard เลย:

    ```bash
    node scripts/csp-report-selftest.mjs
    read -rs CSP_SUMMARY_TOKEN && export CSP_SUMMARY_TOKEN
    node scripts/check-csp-violations.mjs --days 7 --require-marker '<marker ที่บรรทัดบนพิมพ์ เฉพาะส่วนที่ลงท้าย .invalid>'
    ```

    (ใช้ `read -rs` แทนการพิมพ์ค่า token ในบรรทัดคำสั่ง — การพิมพ์ inline ทำให้ค่าตกไปอยู่ใน
    `~/.bash_history` แบบอ่านได้)

    exit 0 = marker ถึงจริงและไม่มี violation จากระบบจริงในหน้าต่างนั้น · ขั้นตอนเปิดใช้ (รัน DDL บน
    prod + ตั้ง env) อยู่ที่ `docs/runbooks/csp-counter-activation.md`
    **ข้อจำกัดที่ห้ามลืม: counter เริ่มนับ ณ วันที่รัน DDL ย้อนหลังไม่ได้** — สำหรับรอบ 24 ส.ค.
    จึงเป็นหลักฐาน **เสริม** เท่านั้น หลักฐานหลักยังเป็น Render log + self-test
- **ต้องมี traffic จริงในหน้าต่าง 7 วันด้วย** — เกณฑ์ข้อ 2 มีความหมายก็ต่อเมื่อมีคนเปิดใช้จริง
  แอปมี ~24 route แต่ audit ด้านล่างครอบคลุมแค่ 6 chunk ถ้าไม่มีใครเปิดหน้าที่เหลือเลย
  "log ว่าง" แปลว่า "ยังไม่มีใครลอง" ไม่ใช่ "ปลอดภัย" → ก่อน enforce ให้เดินคลิกครบหน้าหลัก
  (dashboard / personnel / profile ที่มีรูป / import / ocr) โดยเปิด DevTools console ดู
  violation ตรง ๆ อย่างน้อย 1 รอบ — วิธีนี้ไม่ต้องพึ่ง Render log เลย
- **static audit ของ bundle — ตอนนี้เป็นสคริปต์อัตโนมัติแล้ว**
  (`scripts/audit-bundle-csp.mjs` · issue #113 R2) การตรวจรอบ 17 ส.ค. ด้านล่างเป็นการอ่านด้วยตา
  ที่ครอบแค่ **6 จาก ~24 route chunk ตามที่เข้าใจตอนนั้น** — วัดจริงภายหลังพบว่า build ปัจจุบันมี
  **74 ไฟล์** (65 JS chunk + 4 CSS + 2 HTML + 3 อื่น ๆ) จึงเหลืออีกมากที่ไม่เคยถูกตรวจเลย
  และไม่มีอะไรกัน chunk ใหม่ที่พาของต้องห้ามเข้ามา · สคริปต์ปัจจุบัน **อ่านเนื้อหา 72 ไฟล์ และข้าม 2
  พร้อมพิมพ์เหตุผลรายไฟล์ทุกครั้ง** (`import-template.xlsx` = binary · `_redirects` = ไฟล์ตั้งค่าของ
  Render edge ที่ browser ไม่เคยโหลด) — **ตัวเลข "ข้าม" ถูกพิมพ์เสมอโดยตั้งใจ** เพราะ code review
  จับได้ว่ารุ่นแรกนับไฟล์ที่ไม่เคยเปิดรวมเข้าไปในคำว่า "ตรวจแล้ว" ซึ่งคือ "ไม่ได้ตรวจ" ที่ถูกรายงาน
  เป็น "ตรวจแล้วสะอาด"
  · **รอบแรกที่รันสคริปต์จับได้ทันที**: `https://tailwindcss.com` ใน CSS bundle ซึ่งการอ่านด้วยตา
  มองข้ามไป (ตรวจแล้วเป็นคอมเมนต์ลิขสิทธิ์ ไม่ใช่การโหลดจริง จึงอยู่ใน allowlist พร้อมเหตุผล)
  · ตารางด้านล่างคือสิ่งที่วัดได้ตอนนั้น เก็บไว้เป็นบันทึก — **ของจริงที่บังคับใช้คือสคริปต์**:

  | Directive | ที่วัดได้ |
  |---|---|
  | `connect-src 'self'` | API base compile เป็น `"/api"` relative ล้วน ไม่มี absolute URL ใน chunk ที่ตรวจ — หลักฐานที่แข็งกว่า: `grep -rE "https?://" frontend/src` (ไม่นับ tests) ไม่เจออะไรเลย และ API base ประกอบจาก `import.meta.env.VITE_API_URL \|\| '/api'` แค่ 3 จุด (`useApi.js`, `auth.js` ×2) |
  | `script-src 'self'` | ไม่มี inline `<script>` / `eval(` / `new Function(` / `new Worker` |
  | `style-src` + `font-src` | external มีแค่ `fonts.googleapis.com` + `fonts.gstatic.com`; CSS bundle ไม่มี `url()` และ build ไม่มีไฟล์ font local |
  | `img-src 'self' data:` | blob URL ตัวเดียวในโค้ดคือ `OcrPage.vue` (`URL.createObjectURL`) ซึ่งใช้กับ `<a download>` = download ไม่ใช่ subresource จึงไม่อยู่ใต้ directive ใดเลย |

**ความเสี่ยงที่ต้องกันไว้ก่อน enforce (คนละเรื่องกับจำนวน violation ใน log):**

1. `VITE_API_URL` เป็น `sync: false` = ค่าจริงอยู่บน dashboard เท่านั้น bundle ที่ deploy
   อยู่ตอนนี้ใช้ `/api` (same-origin) จึงผ่าน แต่ยังมีค่าแบบ absolute
   (`https://smartport-backend.onrender.com/api` — origin เดียวกับ `destination` ของ rewrite
   ใน render.yaml) จดไว้ในบันทึกค่าคอนฟิกของทีม — **ถ้าใครตั้งค่านั้นกลับเข้า dashboard
   หลัง enforce จะพังสองชั้นพร้อมกัน**: `connect-src 'self'` บล็อก API call ทั้งหมด **และ**
   `img-src 'self' data:` บล็อกรูปข้าราชการทุกใบด้วย เพราะ `apiAssetUrl()` ประกอบ URL รูป
   จาก API base เดียวกัน (`useApi.js:112` → `useProfile.js:43` → `<img :src>` ที่
   `ProfilePage.vue:63`) — คนที่แก้โดยเติม backend origin เข้า `connect-src` อย่างเดียว
   จะได้ API กลับมาแต่รูปยังพังทั้งระบบ เช็ค bundle จริงอีกครั้งก่อนกดสวิตช์
2. `font-src https://fonts.gstatic.com` ไม่มี `'self'` — วันนี้ไม่พังเพราะไม่มี font ใน
   bundle แต่ถ้าย้ายมา self-host font เมื่อไร จะพังทันทีทั้งที่ดูเหมือนแค่เปลี่ยน asset

## การทดสอบ

- `frontend/src/__tests__/securityHeaders.test.js` — assert header set ข้างต้นในทั้ง
  render.yaml และ nginx.conf กัน drift/regression
- `scripts/verify-live-headers.mjs` — external smoke gate (issue #131): curl
  production จริงแล้ว assert กับ header set ที่ parse จาก render.yaml ตรง ๆ (single
  source of truth — แก้ render.yaml แล้ว gate ตามอัตโนมัติ) exit 1 เมื่อพบ drift;
  regression อยู่ที่ `scripts/tests/verify-live-headers.test.mjs` (mock origin บน
  127.0.0.1 ไม่พึ่งเครือข่าย) เสียบใน `scripts/ci-local.sh` / `.ps1` แล้ว
- `scripts/csp-report-selftest.mjs` — ยิง CSP report marker สดเข้า pipeline จริง (issue #113):
  warm up `/api/readyz` ก่อน แล้ว POST `/api/csp-report` ผ่าน rewrite เส้นเดียวกับที่ browser ใช้
  exit 0 เมื่อได้ 204 พร้อมพิมพ์บรรทัด log ที่ต้องไปค้นหา (ผูกกับข้อความ `error_log()` จริงใน
  `backend/api.php` — มีเทสกัน drift); regression อยู่ที่ `scripts/tests/csp-report-selftest.test.mjs`
  (mock origin บน 127.0.0.1) เสียบใน `scripts/ci-local.sh` / `.ps1` และ `.githooks/pre-push`
  (`node --test scripts/tests/*.test.mjs` ครอบ regression ของสคริปต์ทั้งโฟลเดอร์ ~17s) —
  pre-push คือที่เดียวที่ gate พวกนี้ถูกบังคับทุกครั้ง เพราะ GitHub Actions ปิด auto-trigger อยู่
  **ตัวสคริปต์เองไม่ได้อยู่ใน CI gate** เพราะยิง production จริง — เรียกมือตอนจะอ่าน log เท่านั้น
- `scripts/check-csp-violations.mjs` — gate ที่ตัดสินเกณฑ์ด้วย exit code แทนการเพ่ง log (issue #113 R1):
  ถาม `GET /api/csp-report/summary?days=N` (auth ด้วย header `X-CSP-Summary-Token` เทียบกับ env
  `CSP_SUMMARY_TOKEN` ที่ต้องยาว ≥ 32 ตัวอักษร) แล้ว **exit 0 เฉพาะเมื่อ `storage=ready` และ
  ไม่มี violation จริง และ (ถ้าระบุ `--require-marker`) เจอ marker ที่เพิ่งยิง** —
  `storage=unavailable` กับ `overflow_hits > 0` นับเป็นไม่ผ่านทั้งคู่โดยตั้งใจ ("ไม่มีข้อมูล" ≠ "ปลอดภัย")
  token อ่านจาก env เท่านั้น ไม่รับผ่าน argument; regression อยู่ที่
  `scripts/tests/check-csp-violations.test.mjs` · **ตัวสคริปต์ไม่อยู่ใน CI gate** เพราะยิง production จริง
  · ขั้นตอนเปิดใช้บน production: `docs/runbooks/csp-counter-activation.md`
- `scripts/audit-bundle-csp.mjs` — gate ตรวจ build output ว่ามีอะไรที่ policy จะบล็อกหลัง enforce
  ไหม (issue #113 R2): อ่าน CSP จาก `render.yaml` (path `/*` เท่านั้น รองรับทั้งชื่อ enforce และ
  report-only) แล้วสแกน `frontend/dist` — **อ่านทุกไฟล์ที่ไม่ใช่ binary รวมถึงไฟล์ที่ไม่มีนามสกุล**
  และพิมพ์รายชื่อไฟล์ที่ข้ามพร้อมเหตุผลทุกครั้ง
  — กฎผูกกับ directive จริง ไม่ hardcode: inline script/event handler (`script-src`) · `eval(`
  และ `Function(` (`script-src` — **ข้อจำกัดที่รู้ตัว**: indirect eval แบบ `(0,eval)()` regex
  จับไม่ได้ gate นี้ลดความเสี่ยง ไม่ใช่พิสูจน์ว่าไม่มี)
  · **URL ที่รู้ว่าถูกเรียกจริง** (argument ของ `fetch()` / `axios` / `XHR.open()` ที่เป็น string
  literal) เทียบกับ **`connect-src` เท่านั้น** — ไม่ใช่ allowlist รวมทุก directive ไม่งั้น origin
  ที่ policy อนุญาตไว้เพื่อโหลดฟอนต์จะกลายเป็นใบผ่านให้ยิง API (ความเสี่ยงข้อ 1 ด้านบน คือ
  `VITE_API_URL` แบบ absolute ซึ่งเป็นเคสที่ gate นี้มีไว้จับโดยตรง) · **ข้อจำกัดที่รู้ตัว**:
  URL ที่ประกอบจากตัวแปร (`fetch(base + path)`) มองไม่เห็น — allowlist รวมยังคุมสตริงลอยอีกชั้น
  · absolute URL ที่บอกบริบทไม่ได้ เทียบกับ allowlist รวม และรายงาน directive ที่เทียบตาม
  policy จริง · `url()` ภายนอกใน stylesheet **ทุกที่ที่เจอ ไม่ใช่เฉพาะไฟล์ `.css`** (`<style>` ใน HTML และ
  CSS-in-JS ก็โหลดจริง) **รวมรูป protocol-relative `url(//host/…)`** ซึ่ง browser เติม scheme
  ของหน้าเว็บให้ · เช่นเดียวกับ **ค่าของ attribute ที่เป็น URL** (`src` / `href` / `srcset` /
  `poster` / `data` / `action` / `formaction`) — `<img src="//host">` คือบริบทที่บอกว่าเป็น URL
  ชัดกว่า `url()` ด้วยซ้ำ · **ข้อจำกัดที่รู้ตัว**: `//host` จับเฉพาะสามบริบทนี้เท่านั้น
  สตริงลอย ๆ ไม่ถูกตรวจ เพราะไล่จับทุกที่แล้วชนโค้ดปกติ (วัดกับ build จริงแล้วได้ `//i.test`
  จาก regex literal ที่ bundler ลากมา)
  · **ไฟล์ font ใน bundle เมื่อ `font-src` ไม่มี `'self'`** (ความเสี่ยงข้อ 2
  ด้านบน — ตอนนี้มี gate จับแล้ว ไม่ต้องพึ่งความจำ) · ผ่อน policy แล้วกฎผ่อนตามเอง
  · **fail-closed**: ไม่มี `dist` หรือ `dist` ว่าง = fail ("ยังไม่ได้ตรวจ" ห้ามอ่านเป็น "ตรวจแล้วสะอาด")
  · ไม่ยิงเน็ต ไม่ใช้ Docker · เสียบใน `scripts/ci-local.sh` / `.ps1` หลังขั้น frontend build
  · regression: `scripts/tests/audit-bundle-csp.test.mjs` (51 เทส ใช้ fixture ใน temp dir ไม่แตะ
  `frontend/dist` จริง) ซึ่ง `.githooks/pre-push` รันให้อยู่แล้วผ่าน glob
- ตรวจจากภายนอกหลัง deploy:
  ```bash
  curl -sI https://smart-port.onrender.com/ | grep -i "content-security\|x-frame\|referrer\|permissions\|strict-transport"
  ```

## Follow-up ที่เหลือของ issue #113 (แยก PR)

**ลดการอ่าน token ผ่าน JavaScript** — ปัจจุบัน access/refresh/CSRF token อยู่ใน
`localStorage` (`frontend/src/stores/auth.js`) ซึ่ง XSS เดียวอ่านได้ทั้งหมด แผนคือย้าย
refresh token ไป Secure/HttpOnly/SameSite cookie + เก็บ access token ใน memory
ต้องทำแยกเพราะแตะ:
- backend `routes/auth.php` (Set-Cookie ใน login/refresh/logout, อ่าน refresh จาก cookie)
- CSRF design ใหม่หลัง cookie transition (double-submit → SameSite-based หรือ token ผูก session)
- multi-tab behavior + browser regression suite ด้วยบัญชีทดสอบที่ไม่ใช่ production
