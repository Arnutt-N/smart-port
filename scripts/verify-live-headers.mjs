#!/usr/bin/env node
// Live header smoke check — issue #131 Part 2 (external drift gate)
//
// ทำไมต้องมี: headers ของ render.yaml เคย drift เงียบ ๆ ใน production (issue #113/#125)
// — live site คืน default ของ Render ทั้งที่ไฟล์ประกาศไว้ครบ พบเจอตอนที่มีคน curl เอง
// สคริปต์นี้ curl จากภายนอกแล้ว assert กับ header set ที่ "ประกาศจริงใน render.yaml"
// (parse จากไฟล์ตรง ๆ — expected set จึงไม่ drift จาก render.yaml)
//
// Usage: node scripts/verify-live-headers.mjs [--base-url https://smart-port.onrender.com]
//   --base-url  ใช้ตอนเทสกับ mock server (default = production)
// Exit 0 = header set ครบตาม render.yaml, Exit 1 = ขาด/ค่าผิด/network fail
//
// หมายเหตุ edge layer: production อยู่หลัง Cloudflare ซึ่งอาจเติม header ของตัวเอง
// (cf-*, และ HSTS ค่าที่แรงกว่า เช่น preload) — เรา assert เฉพาะชุดที่ประกาศใน render.yaml
// ส่วน HSTS ถ้าค่าจริง "แรงกว่าหรือเท่ากัน" ที่ประกาศ (max-age ≥ และครอบทุก directive)
// จะเป็นแค่ warning — อ่อนกว่าถือว่า drift และ fail ตัวอย่างจริง: platform default ส่ง
// max-age=315360000; preload ซึ่งแรงกว่าจึงผ่านเป็น warning

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RENDER_YAML = resolve(ROOT, 'render.yaml');
const DEFAULT_BASE = 'https://smart-port.onrender.com';
const FETCH_TIMEOUT_MS = 30_000;
const FETCH_ATTEMPTS = 2; // gateway DNS เคยหน่วง/ตายเป็นพัก ๆ (handoff 2026-08-16) — retry หนึ่งครั้ง

function parseArgs(argv) {
  const args = { baseUrl: DEFAULT_BASE };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base-url' && argv[i + 1]) {
      args.baseUrl = argv[i + 1].replace(/\/+$/, '');
      i++;
    }
  }
  return args;
}

/**
 * แกะ block `headers:` ของ static site ใน render.yaml เป็นรายการ {path, name, value}
 * จบ block ด้วยการเทียบ indent กับบรรทัด `headers:` เอง (ระดับ indent เดียวกัน = key
 * ระดับ service เช่น `routes:` หรือ service ถัดไป) — ถ้าเขียนเป็น regex ตายตัวจะเพี้ยน
 * ทันทีที่ indent เปลี่ยน แล้วชบักไปกิน name/value ของ service อื่น (เคยเกิดแล้ว:
 * กิน `name: smartport-backend` + envVar ของ backend) — ถ้าโครงสร้างเปลี่ยนจน parse
 * ไม่ได้ gate จะ fail-closed พร้อมข้อความชี้จุด ดีกว่าผ่านเงียบ ๆ
 */
function parseRenderHeaders(yaml) {
  const entries = [];
  let headersIndent = null;
  let current = null;
  for (const rawLine of yaml.split(/\r?\n/)) {
    if (headersIndent === null) {
      const found = /^(\s*)headers:\s*$/.exec(rawLine);
      if (found) headersIndent = found[1].length;
      continue;
    }
    const indented = /^(\s*)\S/.exec(rawLine);
    if (indented && indented[1].length <= headersIndent) {
      if (current) entries.push(current);
      current = null;
      headersIndent = null;
      continue;
    }
    const item = /^(\s*)- path:\s*(\S+)\s*$/.exec(rawLine);
    if (item) {
      if (current) entries.push(current);
      current = { path: item[2] };
      continue;
    }
    const name = /^\s*name:\s*(.+?)\s*$/.exec(rawLine);
    if (name && current) {
      current.name = name[1];
      continue;
    }
    const value = /^\s*value:\s*(.+?)\s*$/.exec(rawLine);
    if (value && current) {
      current.value = value[1].replace(/^"(.*)"$/, '$1');
      continue;
    }
  }
  if (current) entries.push(current);
  return entries.filter((e) => e.name && e.value);
}

/**
 * สร้างชุดตรวจจาก entries ของ render.yaml — แยกตาม path pattern
 * fail-closed: path group ที่ไม่รู้จักต้อง throw ไม่ใช่ข้ามเงียบ ๆ
 * (ไม่งั้นวันหน้าเพิ่ม tier ใหม่ เช่น /img/* แล้ว header ของ path นั้นจะ
 * ผ่าน gate โดยไม่ถูกตรวจ — เป็น false-pass ทางเดียวของ gate นี้)
 */
function buildExpectations(entries) {
  const supported = new Set(['/*', '/assets/*']);
  const unknown = [...new Set(entries.filter((e) => !supported.has(e.path)).map((e) => e.path))];
  if (unknown.length > 0) {
    throw new Error(
      `render.yaml ประกาศ path group ที่ gate นี้ยังไม่รองรับ: ${unknown.join(', ')} — ` +
        `ขยาย buildExpectations (และเทส) ให้รองรับ path นี้ก่อน ไม่เช่นนั้น header ของ path นั้นจะไม่ถูกตรวจ`
    );
  }
  const shell = entries.filter((e) => e.path === '/*');
  const asset = entries.filter((e) => e.path === '/assets/*');
  // 2026-08-17: render.yaml ใช้กฎ Cache-Control เดียว (/*) ทั้ง site เพราะ engine ของ Render
  // จัดกฎซ้อนทับ (/* + /assets/*) แบบไม่ deterministic — เมื่อไม่มีกฎ /assets/* ให้ตรวจ
  // asset ด้วยชุดของ /* เพื่อยืนยันว่าทุก path ได้ค่าเดียวกัน deterministic
  return { shell, asset: asset.length > 0 ? asset : shell };
}

async function fetchWithRetry(url, method) {
  let lastError;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      return await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (err) {
      lastError = err;
      if (attempt < FETCH_ATTEMPTS) console.error(`  (retry ${attempt}/${FETCH_ATTEMPTS - 1} หลังจาก: ${err.message})`);
    }
  }
  throw lastError;
}

/** แยก HSTS เป็น max-age (ตัวเลข) + ชุด directives พิมพ์เล็ก — ใช้เทียบว่าค่าจริง "แรงกว่า" ได้ */
function parseHsts(value) {
  const parts = value.split(';').map((p) => p.trim().toLowerCase()).filter(Boolean);
  const maxAgePart = parts.find((p) => /^max-age=\d+$/.test(p));
  return {
    maxAge: maxAgePart ? Number(maxAgePart.split('=')[1]) : NaN,
    // max-age เทียบเป็นตัวเลขแล้ว จึงไม่รวมในชุด directives (ไม่งั้นค่าที่มากกว่าจะ
    // กลายเป็น "directive ไม่ match" ทั้งที่จริงคือแรงกว่า)
    directives: new Set(parts.filter((p) => p !== maxAgePart)),
  };
}

/**
 * เทียบ header จริงกับ expected — คืน array ของผลตรวจ {ok, warn, name, detail}
 * - exact: ตรงเป๊ะ
 * - directives (CSP): เทียบเป็นชุด directive หลัง split ';' — tolerant ต่อการเรียง
 *   ใหม่/whitespace แต่จับได้ว่า directive ไหนถูกผ่อน (เช่น script-src 'self' โดนเติม
 *   'unsafe-eval' = ไม่ match อีกต่อไป) ส่วน directive ที่มาเกินประกาศเป็น warning
 * - HSTS: ยอมเป็น warning เฉพาะเมื่อค่าจริง "แรงกว่าหรือเท่ากัน" (max-age ≥ และครอบ
 *   คลุมทุก directive ของที่ประกาศ) — อ่อนกว่า = fail
 */
function checkHeaders(expected, headers, { url }) {
  const results = [];
  for (const exp of expected) {
    if (exp.name === 'Strict-Transport-Security') {
      const actual = headers.get(exp.name);
      if (!actual) {
        results.push({ ok: false, name: exp.name, detail: `ขาดหาย (expected: ${exp.value})` });
        continue;
      }
      const expectedHsts = parseHsts(exp.value);
      if (Number.isNaN(expectedHsts.maxAge)) {
        results.push({ ok: false, name: exp.name, detail: `parse ค่า HSTS จาก render.yaml ไม่ได้: "${exp.value}"` });
        continue;
      }
      const actualHsts = parseHsts(actual);
      const coversAll = [...expectedHsts.directives].every((d) => actualHsts.directives.has(d));
      const exact = actualHsts.maxAge === expectedHsts.maxAge && actualHsts.directives.size === expectedHsts.directives.size;
      if (actualHsts.maxAge >= expectedHsts.maxAge && coversAll) {
        results.push({
          ok: true,
          warn: !exact,
          name: exp.name,
          detail: exact ? actual : `ค่าจริง "${actual}" แรงกว่า render.yaml "${exp.value}" — ยอมรับได้`,
        });
      } else {
        results.push({
          ok: false,
          name: exp.name,
          detail: `จริง "${actual}" อ่อนกว่า render.yaml "${exp.value}" (max-age น้อยกว่า หรือ directive หาย)`,
        });
      }
      continue;
    }
    const actual = headers.get(exp.name);
    if (!actual) {
      results.push({ ok: false, name: exp.name, detail: `ขาดหาย (expected: ${exp.value})` });
      continue;
    }
    const mode = exp.name === 'Content-Security-Policy-Report-Only' ? 'directives' : 'exact';
    if (mode === 'directives') {
      const actualSet = new Set(actual.split(';').map((d) => d.trim()).filter(Boolean));
      const expectedList = exp.value.split(';').map((d) => d.trim()).filter(Boolean);
      const missing = expectedList.filter((d) => !actualSet.has(d));
      const extra = [...actualSet].filter((d) => !expectedList.includes(d));
      if (missing.length > 0) {
        results.push({ ok: false, name: exp.name, detail: `ขาด/ถูกแก้ directives: ${missing.join('; ')}` });
      } else if (extra.length > 0) {
        results.push({ ok: true, warn: true, name: exp.name, detail: `มี directives เกินที่ไม่ได้ประกาศ: ${extra.join('; ')}` });
      } else {
        results.push({ ok: true, name: exp.name, detail: 'ครบทุก directive ตาม render.yaml' });
      }
    } else if (actual.trim() !== exp.value) {
      results.push({ ok: false, name: exp.name, detail: `จริง "${actual}" ≠ expected "${exp.value}"` });
    } else {
      results.push({ ok: true, name: exp.name, detail: actual });
    }
  }
  return results.map((r) => ({ ...r, url }));
}

function printResults(title, results) {
  console.log(`\n${title}`);
  for (const r of results) {
    const mark = r.ok ? (r.warn ? '~' : '✓') : '✗';
    console.log(`  [${mark}] ${r.name} — ${r.detail}`);
  }
  return results.filter((r) => !r.ok).length;
}

async function main() {
  const { baseUrl } = parseArgs(process.argv.slice(2));

  // ใช้ process.exitCode + return (ไม่ใช่ process.exit) — บน Windows process.exit()
  // ทับกับการเขียน stdout/stderr ที่ยังค้างใน pipe ได้ (เคย crash 0xC0000409 ในเทส)
  let entries;
  try {
    entries = parseRenderHeaders(readFileSync(RENDER_YAML, 'utf8'));
  } catch (err) {
    console.error(`✗ อ่าน/parse render.yaml ไม่ได้: ${err.message}`);
    console.error('  (gate นี้ fail-closed — ถ้า render.yaml เปลี่ยนโครงสร้าง headers: ให้แก้ parseRenderHeaders)');
    process.exitCode = 1;
    return;
  }
  const expectations = buildExpectations(entries);
  if (expectations.shell.length === 0) {
    console.error('✗ parse render.yaml ไม่ได้ header ของ path /* (ต้องมีอย่างน้อยกฎของ /*)');
    process.exitCode = 1;
    return;
  }

  console.log(`Live header smoke check — issue #131`);
  console.log(`base URL: ${baseUrl}`);

  // 1) app shell: ต้อง GET เพื่อเอา body ไปหาชื่อ asset ปัจจุบัน
  const shellRes = await fetchWithRetry(baseUrl + '/', 'GET');
  if (!shellRes.ok) {
    console.error(`✗ GET / ได้ status ${shellRes.status}`);
    process.exitCode = 1;
    return;
  }
  const body = await shellRes.text();
  let shellFailures = printResults(`— App shell (/) —`, checkHeaders(expectations.shell, shellRes.headers, { url: baseUrl + '/' }));

  // 2) hashed asset: ดึงชื่อจาก <script src> ของ shell แล้วตรวจ cache header
  const assetMatch = /assets\/[\w.-]+\.js/.exec(body);
  if (!assetMatch) {
    console.error(`\n✗ หาชื่อ hashed asset (assets/*.js) ใน HTML ไม่ได้ — ตรวจว่า build ยัง emit Vite chunk ปกติ`);
    process.exitCode = 1;
    return;
  }
  const assetUrl = `${baseUrl}/${assetMatch[0]}`;
  const assetRes = await fetchWithRetry(assetUrl, 'HEAD');
  if (!assetRes.ok) {
    console.error(`✗ HEAD ${assetMatch[0]} ได้ status ${assetRes.status}`);
    process.exitCode = 1;
    return;
  }
  const assetFailures = printResults(`— Hashed asset (${assetMatch[0]}) —`, checkHeaders(expectations.asset, assetRes.headers, { url: assetUrl }));

  const failures = shellFailures + assetFailures;
  if (failures > 0) {
    console.error(`\n✗ FAIL: ${failures} รายการไม่ผ่าน — header จริงไม่ตรงกับ render.yaml`);
    console.error('  ถ้าเพิ่งแก้ render.yaml: blueprint ต้องถูก Sync จาก Render dashboard ก่อน (auto-deploy ไม่ re-sync)');
    process.exitCode = 1;
    return;
  }
  console.log(`\n✓ PASS: header set ครบตามที่ประกาศใน render.yaml`);
}

// export ให้ scripts/tests/verify-live-headers.test.mjs ใช้ parser ตัวเดียวกัน
export { parseRenderHeaders, buildExpectations };

// รันเป็น CLI เมื่อถูกเรียกตรง ๆ (ไม่ใช่ถูก import)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exitCode = 1;
  });
}
