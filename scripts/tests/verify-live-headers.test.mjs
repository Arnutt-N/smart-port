import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseRenderHeaders, buildExpectations } from '../verify-live-headers.mjs';

// Issue #131 Part 2 — regression ของ live header smoke check
// เทสแบบ end-to-end ผ่าน CLI (เหมือน validate-multiplier) แต่ชี้ --base-url
// ไปที่ mock origin บน 127.0.0.1 — CI ไม่ต้องพึ่งเครือข่าย/production
//
// หมายเหตุ: ต้องใช้ spawn แบบ async ไม่ใช่ spawnSync เพราะ mock server อยู่ใน
// process นี้ — spawnSync จะบล็อก event loop จน server รับ request ไม่ได้เลย

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'verify-live-headers.mjs');

// render.yaml คือ expected set ของทุกเทสในไฟล์นี้ — อ่าน/parse ที่เดียว (เดิม derive ซ้ำ 5 จุด)
function renderHeaderEntries() {
  return parseRenderHeaders(readFileSync(resolve(ROOT, 'render.yaml'), 'utf8'));
}
const ASSET = '/assets/index-TEST1234.js';
const SHELL_HTML = `<!doctype html><html><head><script type="module" src="${ASSET}"></script></head><body>ok</body></html>`;

function run(baseUrl) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [SCRIPT, '--base-url', baseUrl], { cwd: ROOT });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const timer = setTimeout(() => {
      child.kill();
      rejectRun(new Error('verify-live-headers.mjs ไม่จบภายใน 60s'));
    }, 60_000);
    child.on('error', (err) => {
      clearTimeout(timer);
      rejectRun(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveRun({ status: code, output });
    });
  });
}

function startServer({ shell, asset, onAssetRequest }) {
  let assetHits = 0;
  const server = createServer((req, res) => {
    // จับด้วย pathname ไม่ใช่ URL เต็ม — gate เติม cache-buster (?probe=...) ต่อนัด
    // ทำให้ URL เต็มไม่ซ้ำกัน (issue #155) ถ้าจับแบบตรง ๆ ทุกนัดจะกลายเป็น 404
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (pathname === ASSET) {
      assetHits += 1;
      if (onAssetRequest) onAssetRequest(req.url, assetHits);
    }
    // asset ให้เป็น object (ค่าเดียวทุกนัด) หรือ function ของเลขนัด (เลียนแบบค่าที่แกว่ง)
    const assetHeaders = typeof asset === 'function' ? asset(assetHits) : asset;
    const headers = pathname === '/' ? shell : pathname === ASSET ? assetHeaders : null;
    if (!headers) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    res.end(req.method === 'HEAD' ? undefined : SHELL_HTML);
  });
  return new Promise((ready) => {
    server.listen(0, '127.0.0.1', () => {
      ready({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

test('ผ่านเมื่อ origin ส่ง header ครบตามที่ render.yaml ประกาศ', async () => {
  // mock origin ที่ "ถูกต้อง" = ส่งทุก header ตาม entries ที่ parse ได้จาก render.yaml จริง
  // (กฎเดียว /* ครอบทั้ง site — asset จึงได้ชุดเดียวกับ shell ตาม fallback ของ buildExpectations)
  const entries = renderHeaderEntries();
  const headers = { shell: {}, asset: {} };
  for (const e of entries) {
    headers.shell[e.name] = e.value;
  }
  headers.asset = { ...headers.shell };
  const { server, baseUrl } = await startServer(headers);
  try {
    const { status, output } = await run(baseUrl);
    assert.equal(status, 0, output);
    assert.match(output, /PASS/);
  } finally {
    server.close();
  }
});

test('parser แกะได้เฉพาะ block headers: ของ static site (ไม่ชบักไป service อื่น)', () => {
  const entries = renderHeaderEntries();
  const shellNames = entries.filter((e) => e.path === '/*').map((e) => e.name).sort();
  // CSP มีได้ชื่อเดียวแล้วแต่เฟส: enforce = Content-Security-Policy · report-only = ...-Report-Only
  const cspName = shellNames.find((n) => n.startsWith('Content-Security-Policy'));
  assert.ok(cspName, 'render.yaml ต้องประกาศ CSP header หนึ่งตัว');
  assert.deepEqual(shellNames, [
    'Cache-Control',
    cspName,
    'Permissions-Policy',
    'Referrer-Policy',
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
  ]);
  // 2026-08-17: ตัดกฎ /assets/* (immutable) ออก — Render จัดกฎ Cache-Control ซ้อนทับ
  // แบบ non-deterministic เหลือกฎเดียว no-cache ทั้ง site ถ้ามี /assets/* โผล่มาอีก
  // = มีคนกลับไปใช้กฎซ้อนทับ ซึ่ง gate จะเริ่มตรวจไม่ deterministic อีก — ต้องรู้ตัว
  assert.equal(entries.filter((e) => e.path === '/assets/*').length, 0);
  const cacheControl = entries.find((e) => e.name === 'Cache-Control');
  assert.equal(cacheControl.value, 'no-cache');
});

test('buildExpectations ต้อง fail-closed เมื่อเจอ path group ที่ยังไม่รองรับ (review follow-up)', () => {
  // ถ้าข้ามเงียบ ๆ path group ใหม่ใน render.yaml จะผ่าน gate โดยไม่ถูกตรวจ = false-pass
  assert.throws(
    () =>
      buildExpectations([
        { path: '/*', name: 'X-Frame-Options', value: 'DENY' },
        { path: '/img/*', name: 'Cache-Control', value: 'public, max-age=86400' },
      ]),
    /ไม่รองรับ.*\/img\/\*/
  );
  // ชุดที่รองรับทั้งหมดต้องไม่ throw
  const ok = buildExpectations([
    { path: '/*', name: 'X-Frame-Options', value: 'DENY' },
    { path: '/assets/*', name: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
  ]);
  assert.equal(ok.shell.length, 1);
  assert.equal(ok.asset.length, 1);
  // 2026-08-17: เมื่อไม่มีกฎ /assets/* เลย (โครงสร้างปัจจุบัน) ให้ asset ตรวจด้วยชุดของ /*
  const single = buildExpectations([{ path: '/*', name: 'X-Frame-Options', value: 'DENY' }]);
  assert.equal(single.shell.length, 1);
  assert.equal(single.asset.length, 1);
  assert.equal(single.asset[0].name, 'X-Frame-Options');
});

test('CSP ถูกผ่อนหรือ HSTS อ่อนกว่าต้อง fail แม้จะมี header ครบทุกตัว', async () => {
  // reviewer round: substring-match จะมองไม่เห็น directive ที่ถูกเติม source อ่อนกว่า
  // และ HSTS warn-only ต้องยอมเฉพาะค่าที่แรงกว่า — เคสนี้ต้อง fail ทั้งคู่
  const entries = renderHeaderEntries();
  const headers = { shell: {}, asset: {} };
  for (const e of entries) {
    headers.shell[e.name] = e.value;
  }
  headers.asset = { ...headers.shell };
  // ค้นชื่อจริงจาก render.yaml — เฟส enforce/report-only ต่างกันที่ชื่อ ไม่ใช่ค่า
  const cspKey = Object.keys(headers.shell).find((k) => k.startsWith('Content-Security-Policy'));
  headers.shell[cspKey] = headers.shell[cspKey].replace(
    "script-src 'self'",
    "script-src 'self' 'unsafe-eval'"
  );
  headers.shell['Strict-Transport-Security'] = 'max-age=100';
  headers.asset['Strict-Transport-Security'] = 'max-age=100';

  const { server, baseUrl } = await startServer(headers);
  try {
    const { status, output } = await run(baseUrl);
    assert.equal(status, 1, output);
    // CSP ที่ถูกแก้ต้องถูกจับ (directive ที่ผ่อนแล้วไม่ match อีก)
    assert.ok(output.includes("script-src 'self'"), output);
    // HSTS อ่อนกว่าต้องเป็น ✗ ไม่ใช่ warning [~]
    assert.match(output, /✗\] Strict-Transport-Security/);
    assert.doesNotMatch(output, /~\] Strict-Transport-Security/);
  } finally {
    server.close();
  }
});

test('ต้อง fail เมื่อเจอ Render/Cloudflare defaults (drift ที่เป็นต้นเหตุของ issue #131)', async () => {
  // fixture จาก live probe จริง 2026-08-16 ~18:04 UTC ของ smart-port.onrender.com
  const defaults = {
    shell: {
      'Cache-Control': 'public, max-age=0, s-maxage=300',
      'Strict-Transport-Security': 'max-age=315360000; includeSubdomains; preload',
      'X-Content-Type-Options': 'nosniff',
    },
    asset: {
      'Cache-Control': 'public, max-age=0, s-maxage=300',
      'Strict-Transport-Security': 'max-age=315360000; includeSubdomains; preload',
      'X-Content-Type-Options': 'nosniff',
    },
  };
  const { server, baseUrl } = await startServer(defaults);
  try {
    const { status, output } = await run(baseUrl);
    assert.equal(status, 1, output);
    assert.match(output, /FAIL/);
    // header ที่ drift จริงใน production ต้องถูกจับและระบุชื่อครบ
    for (const name of [
      'Cache-Control',
      // substring ครอบทั้งสองเฟส: enforce "Content-Security-Policy" · report-only "...-Report-Only"
      'Content-Security-Policy',
      'X-Frame-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ]) {
      assert.ok(output.includes(name), `output ต้องระบุ ${name}:\n${output}`);
    }
    // X-Content-Type-Options มีค่าถูกอยู่แล้วจึงผ่าน — และ HSTS ค่าที่แรงกว่า (preload)
    // ต้องเป็นแค่ warning [~] ไม่ใช่สาเหตุของการ fail
    assert.match(output, /~\] Strict-Transport-Security/);
  } finally {
    server.close();
  }
});

test('asset ที่แกว่งค่าระหว่างนัด (บางนัด immutable) ต้อง fail — โหมด production จริง 26 ส.ค. (#155)', async () => {
  // เหตุการณ์จริง: กฎ immutable เก่าค้างระดับ service บน Render ทำให้ asset ตอบสลับ
  // immutable/no-cache ต่อ request (probe จริง 8 นัด = 6 immutable / 2 no-cache) —
  // gate รุ่นยิง-1-นัดเคย PASS โดยบังเอิญเพราะสุ่มโดน no-cache พอดี รุ่น multi-probe ต้องจับได้
  const entries = renderHeaderEntries();
  const good = {};
  for (const e of entries) good[e.name] = e.value;
  const flapping = { ...good, 'Cache-Control': 'public, max-age=31536000, immutable' };
  // นัดที่ 3 ของ 5 ตอบผิด — เสียงข้างมากยังถูกอยู่ แต่ gate ต้อง fail (นัดเดียวผิด = fail)
  const asset = (hit) => (hit === 3 ? flapping : good);
  const { server, baseUrl } = await startServer({ shell: good, asset });
  try {
    const { status, output } = await run(baseUrl);
    assert.equal(status, 1, output);
    assert.match(output, /probe 3\/5/);
    assert.match(output, /✗\] Cache-Control/);
    // ต้องชี้ชื่อโรค: คำว่า immutable + การอ้าง issue #155 อยู่ในข้อความ fail
    assert.ok(output.includes('immutable'), `output ต้องระบุ immutable:\n${output}`);
    assert.ok(output.includes('#155'), `output ต้องอ้าง issue #155:\n${output}`);
  } finally {
    server.close();
  }
});

test('ยิง asset ครบทุกนัดด้วย cache-buster เฉพาะตัว — URL ไม่ซ้ำกัน และทุกนัดสะอาดต้อง PASS', async () => {
  const entries = renderHeaderEntries();
  const headers = { shell: {}, asset: {} };
  for (const e of entries) {
    headers.shell[e.name] = e.value;
  }
  headers.asset = { ...headers.shell };
  const seenUrls = [];
  const { server, baseUrl } = await startServer({
    ...headers,
    onAssetRequest: (url) => seenUrls.push(url),
  });
  try {
    const { status, output } = await run(baseUrl);
    assert.equal(status, 0, output);
    assert.match(output, /PASS/);
    assert.match(output, /probe 5\/5/);
    // ครบ 5 นัด และ buster ต้องไม่ซ้ำกันแม้แต่คู่เดียว (ซ้ำ = CDN/origin อาจตอบของเก่าได้)
    assert.equal(seenUrls.length, 5, `ต้องยิง asset 5 นัด ได้ยิง ${seenUrls.length} นัด`);
    assert.equal(new Set(seenUrls).size, 5, `cache-buster ต้องไม่ซ้ำกัน: ${seenUrls.join(', ')}`);
    for (const url of seenUrls) {
      assert.match(
        url,
        /^\/assets\/index-TEST1234\.js\?probe=\d+-[0-9a-f-]{36}$/,
        `รูปแบบ buster ผิด: ${url}`
      );
    }
  } finally {
    server.close();
  }
});
