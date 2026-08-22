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
 * origin ที่ source list ของ directive หนึ่งอนุญาต
 *
 * keyword (`'self'`/`'none'`) และ host pattern ที่มี wildcard ไม่ใช่ origin ที่เทียบตรงตัวได้
 * จึงถูกข้าม — ไม่ใช่ allowlist ที่เชื่อได้ · ใช้ `originOf` ตัวเดียวกับฝั่ง bundle เพื่อไม่ให้
 * ตรรกะแปลง URL→origin มีสองสำเนาที่เพี้ยนออกจากกันได้
 */
function policyOrigins(sources) {
  const origins = new Set();
  for (const source of sources ?? []) {
    const origin = originOf(source);
    if (origin !== null) origins.add(origin);
  }
  return origins;
}

/**
 * origin ที่ policy อนุญาต **รวมทุก directive** — ใช้ได้เฉพาะกับ URL ที่บอกบริบทไม่ได้
 * (สตริงลอย ๆ ใน bundle ที่ static analysis ไม่รู้ว่าจะถูกใช้โหลดอะไร)
 *
 * **ห้ามใช้กับ URL ที่รู้บริบทแล้ว** — origin ที่ policy อนุญาตไว้เพื่อโหลดฟอนต์จะกลายเป็น
 * ใบผ่านให้ยิง API ทั้งที่ `connect-src` ไม่ได้อนุญาต ซึ่งคือความเสี่ยงข้อ 1 ในเอกสาร
 * (`VITE_API_URL` แบบ absolute) ที่ gate นี้มีไว้จับโดยตรง — review C1 พิสูจน์ว่า
 * `fetch("https://fonts.gstatic.com/…")` เคยผ่านฉลุยเพราะ gstatic อยู่ใน `font-src`
 */
function allowedOriginsFrom(policy) {
  const origins = new Set();
  for (const sources of policy.values()) {
    for (const origin of policyOrigins(sources)) origins.add(origin);
  }
  return origins;
}

/**
 * directive ที่ควบคุมการโหลด subresource — ใช้บอกผู้อ่านว่า finding เทียบกับอะไรจริง ๆ
 * คำนวณจาก policy ที่ parse มา ไม่ใช่รายการที่พิมพ์ค้างไว้ ซึ่งเคยตกหล่น `style-src`
 */
const FETCH_DIRECTIVES = ['connect-src', 'img-src', 'font-src', 'style-src', 'script-src', 'media-src'];

/**
 * รูปแบบการเรียกที่ทำให้เกิด request ใต้ `connect-src` — capture group 1 คือ URL
 *
 * **ข้อจำกัดที่รู้ตัว**: เห็นเฉพาะ URL ที่เป็น string literal ตรง ๆ ในวงเล็บ · URL ที่
 * ประกอบจากตัวแปร (`fetch(base + path)`) มองไม่เห็น — allowlist รวมยังคุมสตริงลอยอีกชั้น
 * gate นี้จึงลดความเสี่ยง ไม่ใช่พิสูจน์ว่าไม่มี (หลักการเดียวกับข้อจำกัดของ R2)
 */
const CONNECT_CALL_PATTERNS = [
  /\b(?:fetch|Request)\s*\(\s*["'`]([^"'`]+)/g,
  /\baxios(?:\.\w+)?\s*\(\s*["'`]([^"'`]+)/g,
  /\.open\s*\(\s*["'][^"']*["']\s*,\s*["'`]([^"'`]+)/g,
];

/**
 * argument ของ `url(…)` — ใช้กับ **ทุกไฟล์ที่อ่าน** ไม่ใช่เฉพาะนามสกุล `.css` เพราะ `<style>`
 * ใน HTML และ CSS-in-JS ก็ทำให้ browser โหลดจริงเหมือนกัน (หลักการเดียวกับ R1 ที่ผูกกับ
 * รูปทรงของ markup ไม่ใช่ชนิดไฟล์ — บทเรียนจาก C2)
 */
const URL_FUNCTION_ARG = /url\(\s*["']?([^"')]+)/gi;

/**
 * การกำหนดค่าให้ attribute (หรือ property) ที่เป็น URL ซึ่ง browser โหลดจริง
 *
 * จับที่ **คู่ชื่อ-ค่า** ไม่ใช่ขอบเขตของแท็ก เพราะ regex ที่อ่านแท็กขาดกลางคันทันทีที่มี `>`
 * อยู่ในค่า attribute — `<img alt="a>b" src="//host">` ทำให้ `src` อยู่นอกช่วงที่ถูกตรวจทั้งดุ้น
 * แล้ว guard quote-ไม่-สมดุลก็สั่งข้ามแท็กนั้นซ้ำอีกชั้น (fail-open สองชั้น จาก code review)
 * รูปนี้ยังครอบ `el.src = "//host"` ในโค้ด JS ซึ่งทำให้เกิด request จริงเหมือนกัน
 *
 * ใช้ lookbehind ไม่ใช่ `\b` เพราะ `\b` ถือว่า `-` เป็นขอบเขตของคำ `data-src=` จึงถูกอ่านเป็น
 * `src=` ซึ่งคือบั๊กเดิมของ review #3 · เรียงชื่อยาวก่อนสั้น เพราะ alternation เลือกตัวแรกที่ match
 *
 * **ข้อจำกัดที่รู้ตัว**: `href` ของ `<a>` (การ navigate ซึ่ง CSP ไม่คุม) กับของ
 * `<link rel="stylesheet">` (subresource ซึ่ง style-src คุม) แยกจากกันไม่ได้ด้วย static
 * analysis — เลือกฟ้องไว้ก่อนตามหลักการของ issue นี้ ทางออกคือใส่ origin นั้นใน
 * NON_FETCHED_ORIGINS พร้อมเหตุผล (มีเทสล็อกไว้ว่านี่คือการตัดสินใจ ไม่ใช่ความพลาด)
 */
const URL_ATTRIBUTE_ASSIGNMENT =
  /(?<![-\w])(?:formaction|srcset|poster|action|href|data|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/gi;

/**
 * origin ของ URL ที่พบใน bundle — คืน `null` เมื่อเป็น path สัมพัทธ์ (อยู่ใต้ 'self' อยู่แล้ว)
 * หรือเมื่อไม่ใช่ URL ที่ parse เป็น origin ได้
 *
 * รองรับ **protocol-relative** (`//host/…`) ด้วย ซึ่งไม่ใช่ relative path: browser เติม
 * scheme ของหน้าเว็บให้แล้วโหลดข้าม origin จริง (production เป็น https เสมอ มี HSTS)
 *
 * เงื่อนไขหลัง `//` เป็น "อะไรก็ได้ที่ไม่ใช่ `/` หรือช่องว่าง" ไม่ใช่ alnum — ของเดิมบังคับ alnum
 * แล้วตัด IPv6 literal (`//[2001:db8::1]/`) กับ host ที่ขึ้นต้นด้วย `_` ทิ้งเป็น null ทั้งที่
 * browser resolve และยิงจริง ส่วนกฎรวมก็มองไม่เห็นเพราะบังคับ `https?://` เหมือนกัน
 * = ไม่มีกฎไหนครอบ ซึ่งเป็นช่องคลาสเดียวกับที่ฟังก์ชันนี้ถูกสร้างมาปิดพอดี
 *
 * **ข้อจำกัดที่รู้ตัว**: จับ `//host` เฉพาะที่มีบริบทบอกว่าเป็น URL (argument ของ fetch/XHR,
 * ใน `url()`, หรือค่าที่ถูกกำหนดให้ attribute/property ตาม URL_ATTRIBUTE_ASSIGNMENT) · สตริง `//host` ลอย ๆ ไม่ถูกตรวจ
 * เพราะการไล่จับทุกที่ให้ false positive กับโค้ดปกติ (วัดกับ build จริงแล้วได้ `//i.test`
 * จาก regex literal ที่ bundler ลากมา)
 */
function originOf(url) {
  const trimmed = url.trim();
  if (!/^(?:https?:)?\/\//i.test(trimmed)) return null; // path สัมพัทธ์ หรือ scheme อื่น
  // `///x` มี scheme ถูกแต่ไม่มี host — URL parser **ไม่ throw** แต่ยกส่วนแรกของ path ขึ้นมา
  // เป็น host แทน (`new URL("https:///z").origin === "https://z"`) จึงต้องตัดทิ้งเองก่อน
  // ไม่งั้น gate จะฟ้อง origin ที่ไม่มีอยู่จริง · guard เดิมผูกกับ https จึงไม่ครอบรูป http
  if (/^(?:https?:)?\/{3}/i.test(trimmed)) return null;
  const absolute = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
  try {
    return new URL(absolute).origin.toLowerCase(); // CSP host-source ไม่แยกตัวพิมพ์
  } catch {
    return null;
  }
}

/** URL ที่ต้องอาศัย scheme ของหน้าเว็บ — กฎรวมที่บังคับ `https?://` มองไม่เห็นรูปนี้ */
const isProtocolRelative = (url) => url.trim().startsWith('//');

/**
 * URL รูปเต็มที่อาจอยู่ในไฟล์ — **ไม่ตัดสิน host เอง** แค่คว้าก้อนที่น่าจะเป็น URL แล้วส่งให้
 * `originOf()` (คือ `new URL()`) เป็นคนตัดสิน
 *
 * ของเดิมใช้ `[a-zA-Z0-9.-]+` เป็นตัวตัด host เอง ซึ่งผิดสามทางพร้อมกัน: `_` เป็นอักขระที่
 * host จริงมีได้ (`fonts.googleapis.com_evil.example` ถูกตัดหัวเหลือ origin ที่ policy อนุญาต
 * = false PASS) · `@` แยก userinfo ออกจาก host ไม่ได้ (`fonts.gstatic.com@evil.example`
 * host จริงคือ evil.example) · `[` ของ IPv6 literal ไม่เข้าข่ายเลยจึงไม่มีกฎไหนครอบ
 *
 * ตัดที่วงเล็บ/จุลภาค/อัฒภาคด้วย เพราะ `url(a),url(b)` ต้องแยกเป็นสอง origin ไม่ใช่ก้อนเดียว
 * ที่ทำให้ตัวหลังหายไปเงียบ ๆ · `[` `]` ถูกเก็บไว้เพราะเป็นส่วนหนึ่งของ IPv6 literal
 */
const ABSOLUTE_URL_CANDIDATE = /https?:\/\/[^\s"'`<>\\)]+/gi;

/**
 * เครื่องหมายวรรคตอนท้ายก้อนที่ไม่ใช่ส่วนหนึ่งของ URL — ตัดทิ้งก่อนส่งให้ URL parser
 *
 * ทำแบบนี้แทนการใส่อักขระเหล่านี้ใน character class ด้านบน เพราะ `, ; { }` **อยู่ในส่วน
 * userinfo ได้ตามมาตรฐาน URL** และ host จริงถูกตัดสินด้วย `@` ตัวสุดท้าย — การใช้มันเป็น
 * ตัวตัดจึงเปิดช่องเดียวกับที่ review ฉ ปิดไป: `https://fonts.gstatic.com,x@evil.example/`
 * ถูกอ่านเป็น origin ที่ policy อนุญาต ทั้งที่ browser โหลดไป evil.example (review ซ)
 * `)` ยังตัดอยู่ในตัว regex เพราะมันปิด `url(…)` จริง และ `url(a),url(b)` ต้องแยกเป็นสอง origin
 */
const stripTrailingPunctuation = (url) => url.replace(/[.,;:{}!?'"]+$/, '');

/**
 * ความยาวสูงสุดที่ยอมให้แท็กเปิดกินพื้นที่ — แท็กจริงไม่ยาวขนาดนี้ ส่วนในไฟล์ JS `a<b`
 * เป็นตัวดำเนินการเปรียบเทียบที่หน้าตาเหมือนแท็กเปิด ถ้าไม่จำกัดจะลากยาวไปทั้งไฟล์
 */
const OPEN_TAG_SCAN_LIMIT = 4096;

/**
 * แตกแท็กเปิดโดยเคารพ quote แบบเดียวกับ HTML tokenizer — `>` ที่อยู่ในค่า attribute
 * ไม่ปิดแท็ก (`<img alt="a>b" onclick="…">` เป็นแท็กเดียว ซึ่งคือสิ่งที่ browser อ่านจริง)
 *
 * ของเดิมใช้ `/<[a-zA-Z][^>]*>/` ที่ตัดตรง `>` ตัวแรกเสมอ แล้วชดเชยด้วย guard นับ quote
 * ให้ครบคู่ · กฎ URL เลิกพึ่งขอบเขตแท็กไปแล้วในรอบที่สี่ แต่กฎ handler ยังพึ่งอยู่ จึงเหลือ
 * เป็นช่องสุดท้ายของคลาสเดียวกัน — วิธีที่ปิดได้จริงคือแตกแท็กให้ถูกตั้งแต่แรก
 *
 * `terminated: false` แปลว่า **แยก attribute ไม่ได้จริง** (ไม่เจอ `>` นอก quote ก่อนชน `<`
 * ตัวถัดไปหรือชนลิมิต) ผู้เรียกต้องไม่เชื่อ `attrs` ในกรณีนั้น ซึ่งตรงกับ browser ด้วย:
 * ข้อความที่ quote ยังไม่ปิดคือค่าของ attribute ไม่ใช่ attribute ตัวใหม่
 */
function* openTags(content) {
  for (const start of content.matchAll(/<([a-zA-Z][a-zA-Z0-9:-]*)/g)) {
    const from = start.index + start[0].length;
    const limit = Math.min(content.length, from + OPEN_TAG_SCAN_LIMIT);
    let quote = null;
    let i = from;
    let terminated = false;
    let truncated = false;
    for (; i < limit; i++) {
      const ch = content[i];
      if (quote !== null) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '<') break; // แท็กเปิดซ้อนแท็กเปิดไม่ได้ — ตัวแรกไม่ใช่แท็กจริง
      else if (ch === '>') { terminated = true; break; }
    }
    // ชนลิมิตทั้งที่ยังไม่จบแท็ก = **อ่านไม่ครบ** ซึ่งต่างจากการเจอ `<` (แปลว่าไม่ใช่แท็กจริง)
    // สองกรณีนี้ต้องแยกกัน เพราะกรณีแรกคือ "ไม่รู้" ที่ห้ามกลายเป็น "สะอาด"
    if (!terminated && i === limit && limit < content.length) truncated = true;
    yield { name: start[1].toLowerCase(), attrs: content.slice(from, i), end: i, terminated, truncated };
  }
}

/**
 * ชื่อ attribute ที่ browser ถือว่าเป็น **event handler content attribute** จริง
 *
 * ใช้ชุดปิดแทนรูป `on` + ตัวอักษรอะไรก็ได้ เพราะ **นี่คือความหมายของ CSP จริง ไม่ใช่ heuristic**:
 * attribute ชื่อ `onfoo` ที่ไม่มีในรายการนี้ browser ไม่ compile เป็นโค้ดตั้งแต่แรก จึงไม่มีอะไร
 * ให้ `script-src` บล็อก · ผลพลอยได้คือปิด regression M-A ที่ยั้งไม่อยู่มาสามรอบ — ` once = `
 * และ ` only = ` ในโค้ด JS ที่ถูกอ่านเป็น pseudo-tag จะตกไปเองเพราะไม่ใช่ชื่อ event
 *
 * **ข้อจำกัดที่รู้ตัว**: event ที่ browser เพิ่มในอนาคตจะหลุดจนกว่าจะมีคนเติมที่นี่ — เป็นการ
 * แลกที่ตั้งใจ เพราะทางเลือกเดิม (รับทุกคำที่ขึ้นต้นด้วย on) ให้ false positive กับโค้ดปกติ
 * ซึ่งทำให้คนเลิกเชื่อ gate ทั้งตัว · รายการนี้มาจาก event handler content attributes ของ
 * HTML spec รวมกับกลุ่ม pointer/touch/animation/transition ที่ browser รองรับจริง
 */
const EVENT_HANDLER_ATTRIBUTES = new Set([
  'onabort', 'onafterprint', 'onanimationcancel', 'onanimationend', 'onanimationiteration', 'onanimationstart',
  'onauxclick', 'onbeforeinput', 'onbeforematch', 'onbeforeprint', 'onbeforetoggle', 'onbeforeunload', 'onblur',
  'oncancel', 'oncanplay', 'oncanplaythrough', 'onchange', 'onclick', 'onclose', 'oncontextlost', 'oncontextmenu',
  'oncontextrestored', 'oncopy', 'oncuechange', 'oncut', 'ondblclick', 'ondrag', 'ondragend', 'ondragenter',
  'ondragleave', 'ondragover', 'ondragstart', 'ondrop', 'ondurationchange', 'onemptied', 'onended', 'onerror',
  'onfocus', 'onfocusin', 'onfocusout', 'onformdata', 'ongotpointercapture', 'onhashchange', 'oninput', 'oninvalid',
  'onkeydown', 'onkeypress', 'onkeyup', 'onlanguagechange', 'onload', 'onloadeddata', 'onloadedmetadata',
  'onloadstart', 'onlostpointercapture', 'onmessage', 'onmessageerror', 'onmousedown', 'onmouseenter',
  'onmouseleave', 'onmousemove', 'onmouseout', 'onmouseover', 'onmouseup', 'onoffline', 'ononline', 'onpagehide',
  'onpageshow', 'onpaste', 'onpause', 'onplay', 'onplaying', 'onpointercancel', 'onpointerdown', 'onpointerenter',
  'onpointerleave', 'onpointermove', 'onpointerout', 'onpointerover', 'onpointerup', 'onpopstate', 'onprogress',
  'onratechange', 'onrejectionhandled', 'onreset', 'onresize', 'onscroll', 'onscrollend', 'onsecuritypolicyviolation',
  'onseeked', 'onseeking', 'onselect', 'onselectionchange', 'onselectstart', 'onslotchange', 'onstalled',
  'onstorage', 'onsubmit', 'onsuspend', 'ontimeupdate', 'ontoggle', 'ontouchcancel', 'ontouchend', 'ontouchmove',
  'ontouchstart', 'ontransitioncancel', 'ontransitionend', 'ontransitionrun', 'ontransitionstart',
  'onunhandledrejection', 'onunload', 'onvolumechange', 'onwaiting', 'onwheel',
]);

/** ชื่อ attribute + ค่า — ใช้แตกแท็กเปิดเป็น Map เพื่อเทียบ **ชื่อเต็ม** ไม่ใช่ substring */
const HTML_ATTRIBUTE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;

/**
 * แตก attribute ของแท็กเปิดเป็น Map<name, value>
 *
 * ของเดิมเทียบด้วย `/\bsrc\s*=/` ซึ่งพัง เพราะ `\b` ถือว่า `-` เป็นขอบเขตของคำอยู่แล้ว
 * `data-src=` จึงถูกอ่านว่า "แท็กนี้มี src" แล้วข้ามการตรวจทั้งแท็ก — `data-src` เป็นสำนวน
 * ของ deferred-script loader ที่ใช้จริง ไม่ใช่เคสสมมติ (review #3)
 */
function parseAttributes(attrs) {
  const map = new Map();
  for (const match of attrs.matchAll(HTML_ATTRIBUTE)) {
    const name = match[1].toLowerCase();
    if (map.has(name)) continue; // HTML ใช้ค่าแรกเมื่อชื่อซ้ำ
    map.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }
  return map;
}

/**
 * type ที่ browser ไม่ execute (data block) จึงไม่ถูก script-src บล็อก
 * เทียบแบบตรงตัวหลังตัด parameter (`; charset=…`) ออก — type ที่ไม่รู้จักถือว่า execute ได้
 */
const NON_EXECUTABLE_TYPES = new Set(['application/json', 'application/ld+json', 'text/template']);

/** type ของแท็ก `<script>` ที่ browser ไม่ execute — ตัด parameter (`; charset=…`) ก่อนเทียบตรงตัว */
const isNonExecutableType = (value) => NON_EXECUTABLE_TYPES.has((value ?? '').split(';')[0].trim().toLowerCase());

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

// ── กฎแต่ละข้อเป็นฟังก์ชันบริสุทธิ์ ─────────────────────────────────────────────
// คืน finding ที่ยัง **ไม่มีชื่อไฟล์** ให้ผู้เรียกเติม — แยกออกมาเพราะตอนรวมอยู่ในลูปเดียว
// ยาว 167 บรรทัด ทิศทางของ `continue` แต่ละตัวตรวจด้วยตาไม่ไหว จน guard ที่เพิ่มเข้าไป
// เพื่อปิดช่องหนึ่งกลับเปิดอีกช่องโดยไม่มีใครเห็น (code review รอบที่สี่)

/**
 * R1 — inline `<script>` ที่มีเนื้อหา และ inline event handler ที่เป็น attribute ในแท็ก
 *
 * ใช้กับ **ทุกไฟล์ที่อ่าน** แต่ผูกกับ**รูปทรงของ markup ไม่ใช่ชนิดไฟล์** — CSP บล็อก handler
 * ที่เขียนเป็น attribute ใน tag เท่านั้น ส่วน `el.onclick = fn` ในไฟล์ JS เป็นการ assign
 * property ซึ่ง **CSP ไม่บล็อก** (สคริปต์ตัวนั้นผ่าน script-src มาแล้ว) การยิง regex ใส่ทั้งไฟล์
 * จึงผิดทั้งเชิงเสียงรบกวนและเชิงความหมาย — ` once = true` เคยถูกจับเป็น handler (review M-A)
 *
 * guard เดิมแก้ด้วยการเดา "ไฟล์นี้เป็น HTML ไหม" ซึ่งพังทันทีที่ chunk เดียวมีทั้ง HTML
 * fragment และโค้ดปกติ (review C2) ตอนนี้จำกัดขอบเขตไว้ใน **ช่วงแท็กเปิด** ซึ่งเป็นที่เดียว
 * ที่ inline handler อยู่ได้จริง จึงไม่ต้องเดาชนิดไฟล์อีก
 */
function inlineScriptFindings(content) {
  const found = [];
  // เดินที่ **แท็กเปิด** ไม่ใช่คู่เปิด-ปิด เพราะ bundler escape `</script>` เป็น `<\/script>`
  // ในสตริง JS เสมอ (กัน HTML parser ตัดจบก่อนเวลา) กฎที่จับเป็นคู่จึงมองไม่เห็นเคสนั้นเลย
  for (const tag of openTags(content)) {
    if (tag.name === 'script') {
      // แยก attribute ไม่ได้ = ไม่มีหลักฐานว่ามี src → ตรวจต่อ ไม่ใช่ข้าม (fail-closed)
      const attrs = tag.terminated ? parseAttributes(tag.attrs) : new Map();
      const executable = !attrs.has('src') && !isNonExecutableType(attrs.get('type'));
      // spec R1 พูดถึง inline script "ที่มีเนื้อหา" — แท็กว่างเปล่า browser ไม่บล็อก
      // รับแท็กปิดทั้งรูปปกติและรูปที่ถูก escape · หาไม่เจอ = ถือว่ามีเนื้อหา (fail-closed)
      // `end` ชี้ที่ `>` เฉพาะตอน terminated — ตอนอื่นชี้ที่ `<` ตัวถัดไปหรือที่ลิมิต
      const after = content.slice(tag.terminated ? tag.end + 1 : tag.end);
      const closeAt = after.search(/<\\?\/script\s*>/i);
      const empty = closeAt !== -1 && after.slice(0, closeAt).trim() === '';
      if (executable && !empty) {
        found.push({ rule: 'inline-script', directive: 'script-src', detail: `พบ <script> ที่ไม่มี src (โค้ดฝังในตัว): ${`<script${tag.attrs}>`.slice(0, 60)}` });
      }
    }
    // อ่านแท็กไม่จบเพราะชนลิมิต = ตรวจไม่ได้ ต้องฟ้อง ไม่ใช่เงียบ ("ไม่รู้" ห้ามเป็น "สะอาด")
    // ต่างจากการเจอ `<` ตัวถัดไป ซึ่งแปลว่านี่ไม่ใช่แท็กจริงตั้งแต่แรก จึงข้ามได้อย่างมีเหตุผล
    if (tag.truncated) {
      found.push({
        rule: 'unparsable-tag',
        directive: 'script-src',
        detail: `แท็ก <${tag.name}> ยาวเกิน ${OPEN_TAG_SCAN_LIMIT} ตัวอักษรจนอ่าน attribute ไม่ครบ — ตรวจ inline handler ในแท็กนี้ไม่ได้`,
      });
      continue;
    }
    if (!tag.terminated) continue;
    // แตก attribute ด้วยตัวเดียวกับที่ branch <script> ใช้ แทนการยิง regex ดิบทับ attrs
    // ของเดิมบังคับ whitespace นำหน้า (`/\son[a-z]+/`) ซึ่ง HTML ไม่ได้บังคับ — `<img/onerror=…>`
    // และ `<a href="x"onclick=…>` จึงหลุดทั้งคู่ ทั้งที่เป็นสำนวน bypass ที่ใช้กันจริง (review ฌ)
    for (const name of parseAttributes(tag.attrs).keys()) {
      if (!EVENT_HANDLER_ATTRIBUTES.has(name)) continue;
      found.push({ rule: 'inline-event-handler', directive: 'script-src', detail: `พบ inline event handler: ${name}= ใน ${`<${tag.name}${tag.attrs}`.slice(0, 40)}` });
    }
  }
  return found;
}

/**
 * R2 — eval / Function constructor
 *
 * ครอบ `Function(` ที่ไม่มี `new` ด้วย เพราะ `Function("return this")()` เป็นสำนวนมาตรฐาน
 * ของ polyfill ที่ bundler ลากติดมาบ่อยกว่า `new Function(` มาก (review I1) · ใช้กับทุกไฟล์
 * ที่อ่าน ไม่ผูกกับนามสกุล — `eval(` ใน .html หรือไฟล์ไม่มีนามสกุลอันตรายเท่ากับใน .js
 *
 * **ข้อจำกัดที่รู้ตัว**: indirect eval (`(0,eval)(...)`, `window["eval"](...)`) และ
 * `setTimeout("code")` regex จับไม่ได้โดยธรรมชาติ — ลดความเสี่ยง ไม่ใช่พิสูจน์ว่าไม่มี
 */
function dynamicCodeFindings(content) {
  const found = [];
  for (const pattern of [/\beval\s*\(/g, /\b(?:new\s+)?Function\s*\(/g]) {
    for (const match of content.matchAll(pattern)) {
      found.push({ rule: 'dynamic-code', directive: 'script-src', detail: `พบการสร้างโค้ดตอน runtime: ${match[0].trim()}` });
    }
  }
  return found;
}

/**
 * R3/R4 — origin ภายนอกที่ policy ไม่ได้อนุญาต
 *
 * แยกสองระดับ: URL ที่ static analysis **รู้บริบทแล้ว** ว่าเป็น request เทียบกับ `connect-src`
 * อย่างเดียว (review C1 — ถ้าใช้ allowlist รวม origin ที่อนุญาตไว้เพื่อโหลดฟอนต์จะกลายเป็น
 * ใบผ่านให้ยิง API) ส่วน URL ที่บอกบริบทไม่ได้ใช้ allowlist รวมตามเดิม
 *
 * นับซ้ำแล้วสรุปเป็นรายการเดียวต่อ origin — ถ้ามีคนตั้ง VITE_API_URL เป็น absolute URL
 * (เคสที่ gate นี้มีไว้จับ) origin เดียวจะโผล่หลายสิบครั้งต่อ chunk การพิมพ์ทีละครั้ง
 * ทำให้คนอ่านเห็นจอเต็มไปด้วยข้อความเดียวกันแทนที่จะเห็นภาพรวม (review M-B)
 */
function externalOriginFindings(content, { policy, connectOrigins, allowedOrigins, consultedDirectives }) {
  const found = [];
  const reported = new Set(); // origin ที่ฟ้องด้วย connect-src ไปแล้ว — กันฟ้องซ้ำคนละ directive
  for (const pattern of CONNECT_CALL_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      const origin = originOf(match[1]); // null = path สัมพัทธ์ ซึ่งอยู่ใต้ 'self' อยู่แล้ว
      if (origin === null) continue;
      if (connectOrigins.has(origin) || NON_FETCHED_ORIGINS.has(origin) || reported.has(origin)) continue;
      reported.add(origin);
      found.push({
        rule: 'external-origin',
        directive: 'connect-src',
        detail: `พบการเรียกข้อมูลไป ${origin} แต่ connect-src อนุญาตแค่ ${(policy.get('connect-src') ?? []).join(' ') || 'ไม่ได้ประกาศ'} — จะถูกบล็อกหลัง enforce`,
      });
    }
  }

  const originCounts = new Map();
  const countOrigin = (origin) => {
    if (allowedOrigins.has(origin) || NON_FETCHED_ORIGINS.has(origin) || reported.has(origin)) return;
    originCounts.set(origin, (originCounts.get(origin) ?? 0) + 1);
  };
  // ให้ URL parser เป็นคนบอกว่า host คืออะไร ไม่ใช่ character class (ดู ABSOLUTE_URL_CANDIDATE)
  for (const match of content.matchAll(ABSOLUTE_URL_CANDIDATE)) {
    const origin = originOf(stripTrailingPunctuation(match[0])); // lowercase ให้แล้ว
    if (origin !== null) countOrigin(origin);
  }

  // สองกฎด้านล่างเก็บ **เฉพาะรูป protocol-relative** เพราะรูปเต็มถูก regex ด้านบนนับไปแล้ว
  // ถ้าไม่กรอง origin เดียวจะถูกนับสองรอบ แล้วจำนวนครั้งในข้อความ error ผิดเป็นเท่าตัว
  // (flag `i` ของ URL_FUNCTION_ARG ทำให้ `new URL("https://…")` ในไฟล์ JS เข้าข่ายด้วย)
  const countIfProtocolRelative = (raw) => {
    if (!isProtocolRelative(raw)) return;
    const origin = originOf(raw);
    if (origin !== null) countOrigin(origin);
  };

  // `url(…)` ในทุกไฟล์ ไม่ใช่เฉพาะ .css — `<style>` ใน HTML และ CSS-in-JS โหลดจริงเหมือนกัน
  for (const match of content.matchAll(URL_FUNCTION_ARG)) countIfProtocolRelative(match[1]);

  // attribute/property ที่ค่าเป็น URL — `<img src="//host">` คือบริบทที่บอกว่าเป็น URL
  // ชัดกว่า url() ด้วยซ้ำ · จับที่คู่ชื่อ-ค่า ไม่พึ่งขอบเขตแท็ก (ดู URL_ATTRIBUTE_ASSIGNMENT)
  for (const match of content.matchAll(URL_ATTRIBUTE_ASSIGNMENT)) {
    const value = match[1] ?? match[2] ?? match[3] ?? '';
    // srcset เป็นรายการคั่นด้วย comma และมี descriptor ต่อท้ายแต่ละตัว · ชิ้นส่วน base64
    // ของ data URI ที่ถูกแตกมาด้วยจะตกไปเองเพราะไม่ได้ขึ้นต้นด้วย `//`
    for (const entry of value.split(',')) countIfProtocolRelative(entry.trim().split(/\s+/)[0] ?? '');
  }

  for (const [origin, count] of originCounts) {
    found.push({
      rule: 'external-origin',
      directive: consultedDirectives,
      detail: `พบ origin ที่ policy ไม่ได้อนุญาต: ${origin}${count > 1 ? ` (${count} ครั้งในไฟล์นี้)` : ''} — ถ้าโค้ดโหลดจากที่นี่จริงจะถูกบล็อกหลัง enforce`,
    });
  }
  return found;
}

/**
 * ตรวจ build output เทียบกับ policy
 *
 * fail-closed: dist ที่ไม่มีอยู่หรือว่างเปล่าคือ "ยังไม่ได้ตรวจ" ไม่ใช่ "ตรวจแล้วสะอาด" —
 * ถ้าปล่อยผ่านเงียบ ๆ gate จะเขียวตอน build ล้มเหลว ซึ่งอันตรายกว่าไม่มี gate
 *
 * @returns {{findings: Array<{file:string, rule:string, directive:string, detail:string}>,
 *   inspected:number, skipped: Array<{file:string, reason:string}>, scanned:number}}
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
  // allowlist แยกสำหรับ URL ที่รู้บริบทแล้วว่าเป็น request — ต้องผ่าน connect-src เท่านั้น
  const connectOrigins = policyOrigins(policy.get('connect-src'));
  // directive ที่รายงานต้องสะท้อน policy จริง แก้ policy แล้วข้อความตามเอง
  const consultedDirectives = FETCH_DIRECTIVES.filter((d) => policy.has(d)).join(' / ') || 'default-src';
  // สี่ค่านี้เดินทางด้วยกันเสมอในกฎ R3/R4 จึงมัดเป็นก้อนเดียว แทนที่จะส่งทีละตัว
  const originContext = { policy, connectOrigins, allowedOrigins, consultedDirectives };
  const allowsInlineScript = hasSource(policy, 'script-src', "'unsafe-inline'");
  const allowsDynamicCode = hasSource(policy, 'script-src', "'unsafe-eval'");
  const allowsSelfFont = hasSource(policy, 'font-src', "'self'");
  const findings = [];
  const skipped = [];
  let inspected = 0;
  const add = (file, rule, directive, detail) => findings.push({ file: relative(distDir, file).replace(/\\/g, '/'), rule, directive, detail });

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    // เทียบด้วย path จากรากของ dist ไม่ใช่ชื่อไฟล์ล้วน — ไม่งั้นไฟล์ชื่อซ้ำในโฟลเดอร์ย่อย
    // จะถูกยกเว้นตามไปด้วยโดยไม่ตั้งใจ
    const rel = relative(distDir, file).replace(/\\/g, '/');

    // R5 — font ที่ self-host จะถูกบล็อกถ้า font-src ไม่มี 'self'
    if (FONT_EXTENSIONS.has(ext)) {
      if (!allowsSelfFont) {
        add(file, 'self-hosted-font', 'font-src', `ไฟล์ font ใน bundle แต่ font-src ไม่มี 'self' (${(policy.get('font-src') ?? []).join(' ') || 'ไม่ได้ประกาศ'})`);
      }
      skipped.push({ file: rel, reason: 'ไฟล์ font — ตรวจด้วยกฎ self-hosted-font ไม่ต้องอ่านเนื้อหา' });
      continue;
    }
    if (NON_BROWSER_FILES.has(rel)) {
      skipped.push({ file: rel, reason: NON_BROWSER_FILES.get(rel) });
      continue;
    }
    if (BINARY_EXTENSIONS.has(ext)) {
      skipped.push({ file: rel, reason: `นามสกุล ${ext} เป็น binary ไม่มีโค้ดหรือ URL ที่ browser จะใช้ต่อ` });
      continue;
    }

    // ทุกอย่างที่เหลือถูกอ่านและตรวจ — รวมถึงนามสกุลที่ยังไม่รู้จักและไฟล์ที่ไม่มีนามสกุล
    inspected++;
    const content = readFileSync(file, 'utf8');

    // กฎแต่ละข้ออยู่ในฟังก์ชันของตัวเอง (ดูด้านบน) — ที่นี่เหลือแค่ประกอบผลเข้ากับชื่อไฟล์
    const push = (list) => { for (const f of list) add(file, f.rule, f.directive, f.detail); };
    if (!allowsInlineScript) push(inlineScriptFindings(content));
    if (!allowsDynamicCode) push(dynamicCodeFindings(content));
    push(externalOriginFindings(content, originContext));
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
