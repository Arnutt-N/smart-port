#!/usr/bin/env node
// CSP bundle audit — issue #113 (R2): ตรวจ build output ว่าจะชน CSP หลัง enforce ไหม
//
// ทำไมต้องมี: การตรวจว่า bundle มีอะไรที่ policy จะบล็อกบ้าง เคยทำด้วยการ "อ่านด้วยตา"
// แล้วบันทึกเป็นร้อยแก้วใน docs/frontend-security-headers.md — ครอบแค่ 6 chunk จากของจริง 65
// ไฟล์ ส่วนที่เหลือไม่เคยถูกตรวจเลย และไม่มีอะไรกันไม่ให้ chunk ใหม่พาของต้องห้ามเข้ามา
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
const CSP_HEADER = 'Content-Security-Policy-Report-Only';

const FONT_EXTENSIONS = new Set(['.woff', '.woff2', '.ttf', '.otf', '.eot']);
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html']);

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

/** แตก policy string เป็น Map<directive, sources[]> */
function parseCspPolicy(value) {
  const policy = new Map();
  for (const part of value.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    policy.set(tokens[0], tokens.slice(1));
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
  const add = (file, rule, directive, detail) => findings.push({ file: relative(distDir, file).replace(/\\/g, '/'), rule, directive, detail });

  for (const file of files) {
    const ext = extname(file).toLowerCase();

    // R5 — font ที่ self-host จะถูกบล็อกถ้า font-src ไม่มี 'self'
    if (FONT_EXTENSIONS.has(ext) && !allowsSelfFont) {
      add(file, 'self-hosted-font', 'font-src', `ไฟล์ font ใน bundle แต่ font-src ไม่มี 'self' (${(policy.get('font-src') ?? []).join(' ') || 'ไม่ได้ประกาศ'})`);
      continue;
    }
    if (!TEXT_EXTENSIONS.has(ext)) continue;

    const content = readFileSync(file, 'utf8');

    // R1 — inline script / inline event handler (script-src ที่ไม่มี 'unsafe-inline')
    if (ext === '.html' && !allowsInlineScript) {
      for (const match of content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        const [, attrs, body] = match;
        if (body.trim() !== '' && !/\bsrc\s*=/i.test(attrs)) {
          add(file, 'inline-script', 'script-src', `พบ <script> ที่มีเนื้อหาในตัว: ${body.trim().slice(0, 60)}`);
        }
      }
      for (const match of content.matchAll(/\son[a-z]+\s*=\s*["']/gi)) {
        add(file, 'inline-event-handler', 'script-src', `พบ inline event handler: ${match[0].trim()}`);
      }
    }

    // R2 — eval / new Function (script-src ที่ไม่มี 'unsafe-eval')
    if ((ext === '.js' || ext === '.mjs') && !allowsDynamicCode) {
      for (const pattern of [/\beval\s*\(/g, /\bnew\s+Function\s*\(/g]) {
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

  return { findings, scanned: files.length };
}

/** อ่าน CSP ที่ประกาศไว้จริงใน render.yaml — fail-closed ถ้าหาไม่เจอ */
function readPolicyFromRenderYaml() {
  const entries = parseRenderHeaders(readFileSync(RENDER_YAML, 'utf8'));
  const entry = entries.find((e) => e.name === CSP_HEADER);
  if (!entry) {
    throw new Error(`ไม่พบ header ${CSP_HEADER} ใน render.yaml — gate นี้ตรวจเทียบ policy ที่ประกาศจริงเท่านั้น`);
  }
  return entry.value;
}

function main() {
  const { dist } = parseArgs(process.argv.slice(2));
  const policyValue = readPolicyFromRenderYaml();

  console.log('CSP bundle audit — issue #113');
  console.log(`dist:   ${dist}`);
  console.log(`policy: ${CSP_HEADER} (จาก render.yaml)`);

  const { findings, scanned } = auditBundle(dist, policyValue);
  console.log(`ตรวจแล้ว ${scanned} ไฟล์`);

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
