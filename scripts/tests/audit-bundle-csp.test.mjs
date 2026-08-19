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

test('bundle สะอาดต้องไม่มี finding และต้องรายงานว่าตรวจกี่ไฟล์', () => {
  const { dir, cleanup } = makeDist(cleanFiles);
  try {
    const result = auditBundle(dir, POLICY);
    assert.deepEqual(result.findings, [], JSON.stringify(result.findings));
    assert.equal(result.scanned, 3, 'ต้องตรวจครบทุกไฟล์ ไม่ใช่แค่ไฟล์แรก');
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
    assert.ok(rulesOf(findings).includes('external-origin'), JSON.stringify(findings));
    assert.match(findings[0].detail, /cdn\.example\.com/);
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
