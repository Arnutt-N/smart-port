#!/usr/bin/env node
// CSP bundle audit — issue #113 (R2): ตรวจ build output ว่าจะชน CSP หลัง enforce ไหม
//
// ทำไมต้องมี: การตรวจว่า bundle มีอะไรที่ policy จะบล็อกบ้าง เคยทำด้วยการ "อ่านด้วยตา"
// แล้วบันทึกเป็นร้อยแก้วใน docs/frontend-security-headers.md — ครอบแค่ 6 chunk จากของจริง
// 74 ไฟล์ (65 JS chunk + 4 CSS + 2 HTML + 3 อื่น ๆ) ส่วนที่เหลือไม่เคยถูกตรวจเลย และไม่มี
// อะไรกันไม่ให้ chunk ใหม่พาของต้องห้ามเข้ามา
//
// สคริปต์นี้อ่าน policy จาก render.yaml (single source of truth เดียวกับ verify-live-headers.mjs)
// แล้วสแกน frontend/dist ทั้งโฟลเดอร์ — กฎทุกข้อผูกกับ directive จริง ไม่ใช่กฎที่ hardcode ไว้
// แก้ policy ให้ผ่อนลง กฎที่เกี่ยวข้องก็ผ่อนตามเอง (มีเทสยืนยันทั้งสองทิศ)
//
// Usage: node scripts/audit-bundle-csp.mjs [--dist <path>]
//   --dist  ใช้ตอนเทสกับ fixture (default = frontend/dist)
// Exit 0 = ไม่พบสิ่งที่จะชน policy, Exit 1 = พบ / ไม่มี dist / parse policy ไม่ได้
//
// ไม่ยิงเครือข่าย ไม่ใช้ Docker — รันเป็น CI gate ได้จริง (ต้องรันหลัง npm run build)

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join, extname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseRenderHeaders } from './verify-live-headers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RENDER_YAML = resolve(ROOT, 'render.yaml');
const DEFAULT_DIST = resolve(ROOT, 'frontend', 'dist');
// รองรับทั้งสองชื่อ เพราะ gate นี้มีไว้รองรับการย้าย report-only → enforce พอดี
// ถ้าผูกกับชื่อเดียวแล้ววันกดสวิตช์ gate จะพังทันทีในจังหวะที่คนกำลังรีบที่สุด
const CSP_HEADERS = ['Content-Security-Policy', 'Content-Security-Policy-Report-Only'];
const SHELL_PATH = '/*';

const FONT_EXTENSIONS = new Set(['.woff', '.woff2', '.ttf', '.otf', '.eot']);

/**
 * นามสกุลที่เป็น binary จริง — ข้ามได้เพราะไม่มีโค้ด/URL ที่ browser จะ execute หรือ fetch ต่อ
 *
 * **ทุกอย่างที่ไม่อยู่ในลิสต์นี้จะถูกอ่านและตรวจ** (fail-closed) — ของเดิมทำกลับกันคือ
 * ตรวจเฉพาะนามสกุลที่รู้จักแล้วข้ามที่เหลือเงียบ ๆ ซึ่งทำให้ `_redirects` (ไม่มีนามสกุล
 * และมี URL ของ backend อยู่) ไม่เคยถูกเปิดเลยทั้งที่ถูกนับรวมในตัวเลข "ตรวจแล้ว N ไฟล์"
 * — code review เรียกสิ่งนี้ว่า "ไม่ได้ตรวจ ถูกรายงานเป็น ตรวจแล้วสะอาด" ซึ่งเป็น failure
 * mode ที่แพงที่สุดของ gate ประเภทนี้
 */
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.xlsx', '.xls', '.pdf', '.zip', '.mp4', '.webm']);

/**
 * ไฟล์ที่อยู่ใน dist แต่ browser ไม่เคยโหลดเป็น subresource จึงไม่อยู่ใต้ CSP
 * ต้องมีเหตุผลรายตัวเหมือน NON_FETCHED_ORIGINS (มีเทสบังคับ)
 */
const NON_BROWSER_FILES = new Map([
  ['_redirects', 'ไฟล์ตั้งค่า rewrite ของ Render edge — CDN อ่านฝั่งเซิร์ฟเวอร์ ไม่เคยถูกส่งให้ browser โหลด URL ข้างในจึงไม่ผ่าน CSP'],
]);

/**
 * origin ที่ปรากฏใน bundle ได้โดยไม่ถูก browser โหลดจริง จึงไม่อยู่ใต้ directive ใด
 *
 * **ห้ามเติมโดยไม่เขียนเหตุผล** — เทส `ข้อยกเว้นทุกตัวใน allowlist ต้องมีเหตุผลเขียนกำกับ`
 * บังคับให้ทุก entry มีคำอธิบาย เพราะรายการนี้คือช่องเดียวที่ทำให้ gate มองข้ามของได้
 * ถ้าเติมมั่วโดยไม่คิด gate จะเงียบในวันที่ควรจะดัง
 */
const NON_FETCHED_ORIGINS = new Map([
  ['http://www.w3.org', 'XML/SVG namespace identifier — เป็นสตริงระบุ namespace ไม่ใช่ URL ที่ browser ไปโหลด'],
  ['https://vuejs.org', 'ลิงก์ในข้อความ error ของ Vue — ถูกแสดงเป็นข้อความให้คนอ่าน ไม่มีการ fetch'],
  ['https://tailwindcss.com', 'อยู่ในคอมเมนต์ลิขสิทธิ์ที่ Tailwind ใส่มากับ CSS (/*! tailwindcss ... MIT License ... */) — คอมเมนต์ไม่ทำให้เกิด request'],
]);

function parseArgs(argv) {
  const args = { dist: DEFAULT_DIST };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dist' && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args.dist = resolve(argv[i + 1]);
      i++;
      continue;
    }
    if (arg.startsWith('--dist=')) {
      args.dist = resolve(arg.slice('--dist='.length));
      continue;
    }
    throw new Error(`อาร์กิวเมนต์ที่ใช้ไม่ได้: "${arg}" — รองรับแค่ --dist <path>`);
  }
  return args;
}

/**
 * แตก policy string เป็น Map<directive, sources[]>
 *
 * **first-wins** ตามที่ browser ทำจริง — ถ้า directive ซ้ำใน policy เดียวกัน browser ใช้ตัวแรก
 * และ ignore ตัวหลัง ของเดิมใช้ `Map.set` ตรง ๆ จึงกลายเป็น last-wins ซึ่งตรงข้าม ผลคือ
 * `script-src 'self'; script-src 'unsafe-eval'` จะทำให้ gate เลิกฟ้อง `eval(` ทั้งที่ browser
 * ยังบล็อกอยู่ = false PASS (code review I2 พิสูจน์ด้วย fixture จริง)
 * ชื่อ directive ถูกทำเป็นตัวพิมพ์เล็กเพราะ CSP ไม่แยกตัวพิมพ์
 */
function parseCspPolicy(value) {
  const policy = new Map();
  for (const part of value.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const name = tokens[0].toLowerCase();
    if (policy.has(name)) continue;
    policy.set(name, tokens.slice(1));
  }
  return policy;
}

/**
 * origin ทั้งหมดที่ policy อนุญาต (จาก source ที่เป็น URL) — allowlist หลักมาจากตรงนี้
 * ไม่ใช่จากรายการที่เขียนไว้ในไฟล์นี้ เพื่อให้แก้ policy แล้ว gate ตามเอง
 */
function allowedOriginsFrom(policy) {
  const origins = new Set();
  for (const sources of policy.values()) {
    for (const source of sources) {
      if (!/^https?:\/\//.test(source)) continue;
      try {
        origins.add(new URL(source).origin);
      } catch {
        // source ที่ไม่ใช่ URL เต็ม (เช่น host pattern) — ข้ามไป ไม่ใช่ allowlist ที่เชื่อได้
      }
    }
  }
  return origins;
}

const hasSource = (policy, directive, source) => (policy.get(directive) ?? []).includes(source);

/** ไล่ไฟล์ทั้งหมดใน dist แบบ recursive */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * ตรวจ build output เทียบกับ policy
 *
 * fail-closed: dist ที่ไม่มีอยู่หรือว่างเปล่าคือ "ยังไม่ได้ตรวจ" ไม่ใช่ "ตรวจแล้วสะอาด" —
 * ถ้าปล่อยผ่านเงียบ ๆ gate จะเขียวตอน build ล้มเหลว ซึ่งอันตรายกว่าไม่มี gate
 *
 * @returns {{findings: Array<{file:string, rule:string, directive:string, detail:string}>, scanned:number}}
 */
function auditBundle(distDir, cspValue) {
  if (!existsSync(distDir)) {
    throw new Error(`ไม่พบ build output ที่ ${distDir} — รัน \`npm run build\` ใน frontend/ ก่อน (gate นี้ตรวจของที่ build แล้วเท่านั้น)`);
  }
  const files = walk(distDir);
  if (files.length === 0) {
    throw new Error(`build output ที่ ${distDir} ว่างเปล่า — น่าจะ build ล้มเหลว ถือว่ายังตรวจไม่ได้`);
  }

  const policy = parseCspPolicy(cspValue);
  const allowedOrigins = allowedOriginsFrom(policy);
  const allowsInlineScript = hasSource(policy, 'script-src', "'unsafe-inline'");
  const allowsDynamicCode = hasSource(policy, 'script-src', "'unsafe-eval'");
  const allowsSelfFont = hasSource(policy, 'font-src', "'self'");
  const findings = [];
  const skipped = [];
  let inspected = 0;
  const add = (file, rule, directive, detail) => findings.push({ file: relative(distDir, file).replace(/\\/g, '/'), rule, directive, detail });

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const base = file.split(/[\\/]/).pop();
    const rel = relative(distDir, file).replace(/\\/g, '/');

    // R5 — font ที่ self-host จะถูกบล็อกถ้า font-src ไม่มี 'self'
    if (FONT_EXTENSIONS.has(ext)) {
      if (!allowsSelfFont) {
        add(file, 'self-hosted-font', 'font-src', `ไฟล์ font ใน bundle แต่ font-src ไม่มี 'self' (${(policy.get('font-src') ?? []).join(' ') || 'ไม่ได้ประกาศ'})`);
      }
      skipped.push({ file: rel, reason: 'ไฟล์ font — ตรวจด้วยกฎ self-hosted-font ไม่ต้องอ่านเนื้อหา' });
      continue;
    }
    if (NON_BROWSER_FILES.has(base)) {
      skipped.push({ file: rel, reason: NON_BROWSER_FILES.get(base) });
      continue;
    }
    if (BINARY_EXTENSIONS.has(ext)) {
      skipped.push({ file: rel, reason: `นามสกุล ${ext} เป็น binary ไม่มีโค้ดหรือ URL ที่ browser จะใช้ต่อ` });
      continue;
    }

    // ทุกอย่างที่เหลือถูกอ่านและตรวจ — รวมถึงนามสกุลที่ยังไม่รู้จักและไฟล์ที่ไม่มีนามสกุล
    inspected++;
    const content = readFileSync(file, 'utf8');

    // R1/R2 ใช้กับ **ทุกไฟล์ที่อ่าน** ไม่ผูกกับนามสกุล — `<script>` ใน .svg และ `eval(` ใน .html
    // อันตรายเท่ากับใน .js และการผูกกฎกับนามสกุลคือวิธีเดียวกับที่ทำให้ C1 เกิดขึ้น
    // R1 — inline script / inline event handler (script-src ที่ไม่มี 'unsafe-inline')
    if (!allowsInlineScript) {
      for (const match of content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        const [, attrs, body] = match;
        if (body.trim() !== '' && !/\bsrc\s*=/i.test(attrs)) {
          add(file, 'inline-script', 'script-src', `พบ <script> ที่มีเนื้อหาในตัว: ${body.trim().slice(0, 60)}`);
        }
      }
      // `["']?` เพราะ HTML ยอมให้ค่า attribute ไม่มีเครื่องหมายคำพูด (`<button onclick=go()>`)
      // ซึ่งของเดิมหลุด — `frontend/public/50x.html` เป็นไฟล์ที่คนแก้ด้วยมือ จึงเกิดได้จริง
      for (const match of content.matchAll(/\son[a-z]+\s*=\s*["']?/gi)) {
        add(file, 'inline-event-handler', 'script-src', `พบ inline event handler: ${match[0].trim()}`);
      }
    }

    // R2 — eval / Function constructor (script-src ที่ไม่มี 'unsafe-eval')
    // ครอบ `Function(` ที่ไม่มี `new` ด้วย เพราะ `Function("return this")()` เป็นสำนวน
    // มาตรฐานของ polyfill ที่ bundler ลากติดมาบ่อยกว่า `new Function(` มาก (code review I1)
    // **ข้อจำกัดที่รู้ตัว**: indirect eval (`(0,eval)(...)`, `window["eval"](...)`) และ
    // `setTimeout("code")` regex จับไม่ได้โดยธรรมชาติ — gate นี้จึงลดความเสี่ยง ไม่ใช่พิสูจน์ว่าไม่มี
    if (!allowsDynamicCode) {
      for (const pattern of [/\beval\s*\(/g, /\b(?:new\s+)?Function\s*\(/g]) {
        for (const match of content.matchAll(pattern)) {
          add(file, 'dynamic-code', 'script-src', `พบการสร้างโค้ดตอน runtime: ${match[0].trim()}`);
        }
      }
    }

    // R3/R4 — absolute URL ที่ไม่ได้อยู่ใน policy และไม่ใช่ URL ที่ไม่ถูก fetch
    for (const match of content.matchAll(/https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?/g)) {
      const origin = match[0];
      if (allowedOrigins.has(origin) || NON_FETCHED_ORIGINS.has(origin)) continue;
      add(
        file,
        'external-origin',
        'connect-src / img-src / font-src',
        `พบ origin ที่ policy ไม่ได้อนุญาต: ${origin} — ถ้าโค้ดโหลดจากที่นี่จริงจะถูกบล็อกหลัง enforce`
      );
    }
  }

  return { findings, inspected, skipped, scanned: files.length };
}

/**
 * อ่าน CSP ที่ประกาศไว้จริงใน render.yaml — fail-closed ถ้าหาไม่เจอ
 *
 * กรองด้วย path `/*` เท่านั้น และ throw ถ้าเจอ CSP บน path อื่น — ถ้าวันหน้ามีคนเพิ่ม CSP
 * เฉพาะ `/assets/*` (ซึ่งคือ path ของเกือบทุกอย่างใน dist) การหยิบ entry แรกมาใช้เงียบ ๆ
 * จะทำให้ตรวจ bundle เทียบ policy ผิดตัว = false PASS · `verify-live-headers.mjs` ป้องกัน
 * เรื่องเดียวกันไว้แล้วด้วย buildExpectations() ที่ throw เมื่อเจอ path group ที่ไม่รู้จัก
 */
function readPolicyFromRenderYaml() {
  const entries = parseRenderHeaders(readFileSync(RENDER_YAML, 'utf8'));
  const csp = entries.filter((e) => CSP_HEADERS.includes(e.name));
  const offPath = csp.filter((e) => e.path !== SHELL_PATH);
  if (offPath.length > 0) {
    throw new Error(
      `render.yaml ประกาศ CSP บน path ที่ gate นี้ยังไม่รองรับ: ${[...new Set(offPath.map((e) => e.path))].join(', ')} — ` +
        `ขยาย readPolicyFromRenderYaml (และเทส) ก่อน ไม่งั้น bundle จะถูกตรวจเทียบ policy ผิดตัว`
    );
  }
  // enforce มาก่อน report-only: ถ้ามีทั้งคู่ ตัวที่บังคับใช้จริงคือตัวที่ต้องผ่าน
  for (const name of CSP_HEADERS) {
    const entry = csp.find((e) => e.name === name && e.path === SHELL_PATH);
    if (entry) return entry.value;
  }
  throw new Error(`ไม่พบ header ${CSP_HEADERS.join(' หรือ ')} บน path ${SHELL_PATH} ใน render.yaml — gate นี้ตรวจเทียบ policy ที่ประกาศจริงเท่านั้น`);
}

function main() {
  const { dist } = parseArgs(process.argv.slice(2));
  const policyValue = readPolicyFromRenderYaml();

  console.log('CSP bundle audit — issue #113');
  console.log(`dist:   ${dist}`);
  console.log('policy: จาก render.yaml (path /*)');

  const { findings, inspected, skipped, scanned } = auditBundle(dist, policyValue);
  // แยก "อ่านเนื้อหาจริง" ออกจาก "เดินผ่าน" และพิมพ์รายชื่อที่ข้ามเสมอ — ตัวเลขรวมอย่างเดียว
  // เคยทำให้เข้าใจผิดว่าตรวจครบทั้งที่ 3 ไฟล์ไม่เคยถูกเปิด (code review C1)
  console.log(`ตรวจเนื้อหา ${inspected} ไฟล์ · ข้าม ${skipped.length} ไฟล์ (จากทั้งหมด ${scanned})`);
  for (const s of skipped) console.log(`  – ข้าม ${s.file}: ${s.reason}`);

  if (findings.length > 0) {
    console.error('');
    for (const f of findings) {
      console.error(`  [✗] ${f.file} — ${f.detail}`);
      console.error(`      กฎ: ${f.rule} · directive ที่จะบล็อก: ${f.directive}`);
    }
    console.error(`\n✗ FAIL: พบ ${findings.length} รายการที่จะถูกบล็อกหลัง enforce CSP`);
    console.error('  ถ้าเป็นของที่ต้องใช้จริง ให้แก้ policy ใน render.yaml (แล้ว gate จะตามเอง)');
    console.error('  ถ้าเป็น URL ที่ไม่เคยถูก fetch ให้เพิ่มใน NON_FETCHED_ORIGINS พร้อมเหตุผล');
    process.exitCode = 1;
    return;
  }
  console.log('\n✓ PASS: ไม่พบสิ่งที่จะชน policy ใน build output');
}

export { auditBundle, parseCspPolicy, allowedOriginsFrom, NON_FETCHED_ORIGINS };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    console.error(`✗ FAIL: ${err.message}`);
    process.exitCode = 1;
  }
}
