import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { auditBundle, EVENT_HANDLER_ATTRIBUTES } from '../audit-bundle-csp.mjs';

// Issue #113 (R2) — differential test: ให้ **ตัว parse จริง** เป็นกรรมการ แทนการไล่นึกรูปที่ยังไม่ได้ปิด
//
// ทำไมต้องมีไฟล์นี้แยก: gate ตัวนี้ถูกรีวิว 6 รอบ ทุกรอบเจอ false clean ของ **คลาสเดียวกัน** คือ
// กฎเดาโครงสร้างเอาเองด้วย regex แล้วพลาดรูปที่คนเขียนกฎนึกไม่ถึง · การไล่ปิดทีละรูปแพ้มาหกรอบแล้ว
// เพราะมันแข่งกับจินตนาการของคนเขียน ไม่ใช่กับมาตรฐานจริง
//
// เทสในไฟล์นี้จึงไม่ได้ระบุ "คำตอบที่ถูก" เอง แต่ถาม **แหล่งความจริงเดียวกับที่ browser ใช้**:
//   – `parse5` (HTML tokenizer อ้างอิงตาม spec เดียวกับที่ browser ใช้) ตอบว่า markup นี้มี
//     attribute อะไรบ้างจริง ๆ
//   – `new URL()` (WHATWG URL parser) ตอบว่า URL นี้ browser จะไปที่ origin ไหนจริง ๆ
// แล้ว assert ว่า gate เห็นตรงกัน · รูปแบบใหม่ที่ยังไม่มีใครนึกถึงจึงถูกครอบไปด้วยโดยอัตโนมัติ
//
// **การพึ่ง dependency**: `scripts/` ตั้งใจให้รันด้วย `node --test` เปล่า ๆ ไม่ต้องติดตั้งอะไร
// ไฟล์นี้จึงยืม parse5 จาก `frontend/node_modules` (มาจาก jsdom ที่ vitest ใช้อยู่แล้ว) และ
// **ข้ามตัวเองพร้อมเหตุผลที่อ่านออก** เมื่อยังไม่ได้ `npm install` ฝั่ง frontend — ไม่ใช่ fail
// เพราะการบังคับให้ทุกคนติดตั้ง frontend ก่อนรัน script test จะทำให้ gate อื่น ๆ พังไปด้วย
// ในทางปฏิบัติเทสนี้ได้รันจริงเสมอบนเส้นทางที่สำคัญ: `.githooks/pre-push` รัน vitest อยู่แล้ว
// จึงต้องมี node_modules ครบ · CI ก็ `npm ci` ฝั่ง frontend ก่อน

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PARSE5_ENTRY = resolve(ROOT, 'frontend', 'node_modules', 'parse5', 'dist', 'index.js');

/** policy ที่สะท้อน production — เทสใน audit-bundle-csp.test.mjs ยืนยันว่าตรงกับ render.yaml จริง */
const POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; " +
  "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; report-uri /api/csp-report";

const parse5 = existsSync(PARSE5_ENTRY) ? await import(pathToFileURL(PARSE5_ENTRY).href) : null;
const skip = parse5
  ? false
  : `ไม่พบ parse5 ที่ ${PARSE5_ENTRY} — รัน \`npm ci\` ใน frontend/ ก่อน (เทส differential ต้องใช้ตัว parse จริงเป็นกรรมการ)`;

function makeDist(files) {
  const dir = mkdtempSync(join(tmpdir(), 'csp-diff-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** ชื่อ attribute ทั้งหมดที่ parse5 มองเห็นในเอกสาร — เดินทั้งต้นไม้ ไม่ใช่แค่ระดับบนสุด */
function attributeNamesFrom(html) {
  const names = new Set();
  const walk = (node) => {
    for (const attr of node.attrs ?? []) names.add(attr.name.toLowerCase());
    for (const child of node.childNodes ?? []) walk(child);
    if (node.content) walk(node.content); // <template>
  };
  walk(parse5.parse(html));
  return names;
}

/**
 * รูปแบบ markup ที่ต้องให้ผลตรงกับ parse5
 *
 * ตั้งใจใส่รูปที่ **เคยหลุดจริง** ปนกับรูปที่ยังไม่มีใครรายงาน — ค่าของเทสนี้อยู่ที่กลุ่มหลัง
 *
 * **แท็กต้องอยู่ในบริบทที่ HTML ยอมรับ** — `parse5` ทำตาม tree-construction rules ของ spec
 * เต็มรูป จึง**ทิ้ง** `<td>` ที่อยู่นอก `<table>` ไปทั้งแท็ก ขณะที่ gate สแกนแบบไม่สนบริบท
 * (ซึ่งถูกต้องตามหน้าที่: HTML fragment ใน chunk JS ไม่มี wrapper แต่ handler จะทำงานจริง
 * เมื่อ fragment ถูก inject เข้าที่) · fixture ที่วางผิดบริบทจึงเทียบกันไม่ได้ ไม่ใช่บั๊กของ gate
 */
const MARKUP_SHAPES = [
  '<img onerror="x()">',
  '<img/onerror="x()">',                       // review ฌ — ไม่มีช่องว่างนำหน้า
  '<img src=y /onerror="x()">',                // review ฌ — หลัง self-closing slash
  '<a href="y"onclick="x()">t</a>',            // review ฌ — ติดกับ quote ปิด
  '<img alt="a>b" onclick="x()">',             // review จ — `>` ในค่า attribute
  "<img alt='a>b' onmouseover=\"x()\">",       // เหมือนบน แต่ single quote
  '<img ONCLICK="x()">',                       // ตัวพิมพ์ใหญ่
  '<img onclick=x()>',                         // ค่าไม่มี quote
  '<img\nonclick="x()">',                      // ขึ้นบรรทัดใหม่แทนช่องว่าง
  '<img\tonclick="x()">',                      // tab
  '<img onclick = "x()">',                     // เว้นวรรครอบ =
  '<body onload="x()"></body>',
  '<svg onload="x()"></svg>',
  '<div data-onclick="x" onclick="y()"></div>', // data-onclick ต้องไม่นับ แต่ onclick ต้องนับ
  '<input onfocus="x()" autofocus>',
  '<button onpointerdown="x()">t</button>',
  '<table><tr><td onbeforetoggle="x()"></td></tr></table>', // ต้องมี wrapper ไม่งั้น parse5 ทิ้งแท็ก
  '<img data-src="a" onerror="x()">',
  '<form action="/x" onsubmit="y()"></form>',
];

test('ทุก event handler ที่ parse5 มองเห็น gate ต้องเห็นด้วย (differential)', { skip }, () => {
  for (const shape of MARKUP_SHAPES) {
    const html = `<!doctype html><html><body>${shape}</body></html>`;
    // แหล่งความจริง: parse5 บอกว่า browser เห็น attribute อะไร · กรองด้วยชุดเดียวกับที่กฎใช้
    // เพราะ attribute ชื่อ `onfoo` ที่ไม่ใช่ event จริง browser ไม่ compile เป็นโค้ดตั้งแต่แรก
    const expected = [...attributeNamesFrom(html)].filter((n) => EVENT_HANDLER_ATTRIBUTES.has(n)).sort();

    const { dir, cleanup } = makeDist({ 'index.html': html });
    try {
      const { findings } = auditBundle(dir, POLICY);
      const actual = findings
        .filter((f) => f.rule === 'inline-event-handler')
        .map((f) => f.detail.match(/handler: (on[a-z]+)=/)?.[1])
        .filter(Boolean)
        .sort();
      assert.deepEqual(
        actual,
        expected,
        `${shape}\n  parse5 เห็น: ${JSON.stringify(expected)}\n  gate เห็น: ${JSON.stringify(actual)}`
      );
    } finally {
      cleanup();
    }
  }
});

/**
 * รูปแบบ URL ที่ต้องให้ผลตรงกับ `new URL()`
 *
 * กลุ่ม userinfo คือคลาสที่ปิดไม่หมดมาสองรอบ (review ฉ ปิด `@` ติดกัน · review ซ พบว่า
 * ตัวคั่นที่เพิ่มเข้ามาเพื่อแยก `url(a),url(b)` เปิดช่องเดิมกลับมา) — ที่นี่ไม่ไล่ทีละตัวคั่นแล้ว
 * แต่ให้ URL parser ตอบเองว่า host คืออะไร
 */
const URL_SHAPES = [
  'https://evil.example/x',
  'https://EVIL.example/x',
  'https://evil.example:8443/x',
  'https://evil.example./x',
  'https://fonts.gstatic.com@evil.example/x',
  'https://fonts.gstatic.com,x@evil.example/x',
  'https://fonts.gstatic.com;x@evil.example/x',
  'https://fonts.gstatic.com(x@evil.example/x',
  'https://fonts.googleapis.com{x@evil.example/x',
  'https://user:pass@evil.example/x',
  'https://fonts.googleapis.com_evil.example/x',
  'http://[2001:db8::1]/x',
  'http://[::1]:9000/x',
  'https://sub.evil.example/a/b?c=d',
];

test('ทุก origin ที่ new URL() ตัดสิน gate ต้องเห็นตรงกัน (differential)', { skip }, () => {
  for (const raw of URL_SHAPES) {
    const expected = new URL(raw).origin.toLowerCase(); // แหล่งความจริงเดียวกับที่ browser ใช้
    const { dir, cleanup } = makeDist({
      'index.html': '<!doctype html><html><body>x</body></html>',
      'assets/probe.js': `const u = "${raw}";`,
    });
    try {
      const { findings } = auditBundle(dir, POLICY);
      const reported = findings.map((f) => f.detail);
      assert.ok(
        reported.some((d) => d.includes(expected)),
        `${raw}\n  new URL() บอก origin: ${expected}\n  gate รายงาน: ${JSON.stringify(reported)}`
      );
    } finally {
      cleanup();
    }
  }
});

test('URL ที่ policy อนุญาตจริงต้องไม่ถูกฟ้อง (differential — ฝั่งกันแก้เกิน)', { skip }, () => {
  // คู่ตรงข้ามของเทสบน: ถ้า `new URL()` บอกว่า origin คือตัวที่ policy อนุญาต gate ต้องเงียบ
  // ไม่งั้นการปิดช่องด้านบนจะกลายเป็นการฟ้องทุกอย่าง ซึ่งทำให้คนเลิกเชื่อ gate เหมือนกัน
  for (const raw of [
    'https://fonts.googleapis.com/css2?family=Inter',
    'https://fonts.gstatic.com/s/inter/v13/x.woff2',
    'https://FONTS.googleapis.com/css2',
  ]) {
    assert.ok(
      ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'].includes(new URL(raw).origin.toLowerCase()),
      `fixture ผิด: ${raw} ไม่ได้ชี้ไป origin ที่ policy อนุญาต`
    );
    const { dir, cleanup } = makeDist({
      'index.html': '<!doctype html><html><body>x</body></html>',
      'assets/ok.js': `const u = "${raw}";`,
    });
    try {
      const { findings } = auditBundle(dir, POLICY);
      assert.deepEqual(findings, [], `${raw}: ${JSON.stringify(findings)}`);
    } finally {
      cleanup();
    }
  }
});

test('เมื่อ parse5 ไม่มี เทสต้องข้ามพร้อมเหตุผลที่บอกวิธีแก้ ไม่ใช่เงียบ', () => {
  // "ไม่รู้" ต้องไม่กลายเป็น "สะอาด" — การข้ามที่ยอมรับได้ต้องอธิบายตัวเองได้เสมอ
  // (เทสนี้รันได้ทุกสภาพแวดล้อมโดยตั้งใจ จึงเป็นตัวเดียวในไฟล์ที่ไม่มี skip)
  if (skip === false) {
    assert.ok(parse5, 'มี parse5 แล้วต้องไม่ตั้งค่า skip');
    return;
  }
  assert.match(skip, /npm ci/, 'ข้อความ skip ต้องบอกวิธีทำให้เทสรันได้');
  assert.match(skip, /parse5/, 'ข้อความ skip ต้องบอกว่าขาดอะไร');
});
