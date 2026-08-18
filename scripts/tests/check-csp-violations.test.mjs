import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateSummary } from '../check-csp-violations.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'check-csp-violations.mjs');

// helper `runArgs`/`startServer` คัดลอกรูปแบบมาจาก scripts/tests/csp-report-selftest.test.mjs
// นี่คือที่ที่สองแล้ว — ถ้ามีที่สามเมื่อไรให้ยกออกเป็น scripts/tests/helpers/mock-origin.mjs
function runArgs(args, env = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd: ROOT, env: { ...process.env, ...env } });
    let output = '';
    child.stdout.on('data', (c) => (output += c));
    child.stderr.on('data', (c) => (output += c));
    const timer = setTimeout(() => {
      child.kill();
      rejectRun(new Error('check-csp-violations.mjs ไม่จบภายใน 60s'));
    }, 60_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveRun({ status: code, output });
    });
  });
}

function startServer(handler) {
  const received = [];
  const server = createServer((req, res) => {
    received.push({ url: req.url, headers: req.headers });
    handler(req, res);
  });
  return new Promise((ready) => {
    server.listen(0, '127.0.0.1', () => ready({ server, received, baseUrl: `http://127.0.0.1:${server.address().port}` }));
  });
}

const clean = {
  window_days: 7,
  since: '2026-08-12',
  storage: 'ready',
  violations: { total: 0, top: [] },
  selftest: { total: 1, markers: [{ blocked_host: 'csp-selftest-20260824-a3f9.invalid', hits: 1, last_seen: '2026-08-24 05:10:38' }] },
  overflow_hits: 0,
};

test('ข้อมูลพร้อมและไม่มี violation → ผ่าน', () => {
  assert.equal(evaluateSummary(clean, {}).ok, true);
});

test('storage unavailable ต้องไม่ผ่าน — "ไม่มีข้อมูล" ไม่เท่ากับ "ไม่มี violation"', () => {
  const result = evaluateSummary({ ...clean, storage: 'unavailable' }, {});
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /ยังไม่มีตาราง|สรุปไม่ได้/);
});

test('มี violation จริงต้องไม่ผ่าน และบอกว่า host ไหน', () => {
  const result = evaluateSummary(
    { ...clean, violations: { total: 3, top: [{ directive: 'img-src', blocked_host: 'evil.example', hits: 3, last_seen: '2026-08-24 01:00:00' }] } },
    {}
  );
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /evil\.example/);
});

test('overflow > 0 ต้องไม่ผ่าน เพราะข้อมูลไม่ครบ', () => {
  const result = evaluateSummary({ ...clean, overflow_hits: 5 }, {});
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /overflow/i);
});

test('--require-marker ที่ไม่เจอต้องไม่ผ่าน', () => {
  const result = evaluateSummary(clean, { requireMarker: 'csp-selftest-20260824-ffff.invalid' });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /marker/i);
});

test('--require-marker ที่เจอแล้วต้องผ่าน', () => {
  assert.equal(evaluateSummary(clean, { requireMarker: 'csp-selftest-20260824-a3f9.invalid' }).ok, true);
});

// code review I1 (round 1): storage:'ready' แต่ field อื่นหาย/รูปทรงผิด (proxy/cache แทรก,
// backend เปลี่ยนสัญญาในอนาคต ฯลฯ) ต้อง "สรุปไม่ได้" (fail) ไม่ใช่ถูกอ่านเป็น 0 ด้วย `?? 0`
// แล้ว PASS อย่างเงียบ ๆ — "ไม่รู้" ต้องไม่กลายเป็น "สะอาด"
test('storage:ready แต่ไม่มี key violations เลย ต้องไม่ผ่าน (รูปทรงผิด ≠ สะอาด)', () => {
  const malformed = { ...clean };
  delete malformed.violations;
  const result = evaluateSummary(malformed, {});
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /สรุปไม่ได้/);
});

test('storage:ready แต่ไม่มี key overflow_hits ต้องไม่ผ่าน (รูปทรงผิด ≠ สะอาด)', () => {
  const malformed = { ...clean };
  delete malformed.overflow_hits;
  const result = evaluateSummary(malformed, {});
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /สรุปไม่ได้/);
});

test('--require-marker ระบุแล้วแต่ selftest หาย ต้องไม่ผ่าน (รูปทรงผิด ≠ ไม่เจอ marker)', () => {
  const malformed = { ...clean };
  delete malformed.selftest;
  const result = evaluateSummary(malformed, { requireMarker: 'csp-selftest-20260824-a3f9.invalid' });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /สรุปไม่ได้/);
});

test('ส่ง token ผ่าน header และผ่านเมื่อสะอาด', async () => {
  const { server, baseUrl, received } = await startServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(clean));
  });
  try {
    const { status, output } = await runArgs(['--base-url', baseUrl], { CSP_SUMMARY_TOKEN: 'secret123' });
    assert.equal(status, 0, output);
    assert.equal(received[0].headers['x-csp-summary-token'], 'secret123');
    assert.match(received[0].url, /\/api\/csp-report\/summary\?days=7/);
  } finally {
    server.close();
  }
});

test('ไม่ได้ตั้ง CSP_SUMMARY_TOKEN → exit 1 ก่อนแตะเครือข่าย', async () => {
  const { server, baseUrl, received } = await startServer((req, res) => res.end('{}'));
  try {
    const { status, output } = await runArgs(['--base-url', baseUrl], { CSP_SUMMARY_TOKEN: '' });
    assert.equal(status, 1, output);
    assert.equal(received.length, 0);
  } finally {
    server.close();
  }
});

test('backend ตอบ 503 (ยังไม่ตั้ง env) → exit 1 พร้อมบอกสาเหตุ', async () => {
  const { server, baseUrl } = await startServer((req, res) => {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: 'summary endpoint not configured' }));
  });
  try {
    const { status, output } = await runArgs(['--base-url', baseUrl], { CSP_SUMMARY_TOKEN: 'x' });
    assert.equal(status, 1, output);
    assert.match(output, /503/);
  } finally {
    server.close();
  }
});

test('backend ตอบ 401 (token ไม่ตรง) → exit 1 พร้อมบอกสาเหตุ', async () => {
  const { server, baseUrl } = await startServer((req, res) => {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'Unauthorized' }));
  });
  try {
    const { status, output } = await runArgs(['--base-url', baseUrl], { CSP_SUMMARY_TOKEN: 'wrong-token' });
    assert.equal(status, 1, output);
    assert.match(output, /401/);
  } finally {
    server.close();
  }
});

test('backend ตอบ 500 (generic, ไม่ใช่ 401/503) → exit 1 พร้อมบอก HTTP status', async () => {
  const { server, baseUrl } = await startServer((req, res) => {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'internal error' }));
  });
  try {
    const { status, output } = await runArgs(['--base-url', baseUrl], { CSP_SUMMARY_TOKEN: 'x' });
    assert.equal(status, 1, output);
    assert.match(output, /500/);
  } finally {
    server.close();
  }
});

test('argument ผิด → exit 1 ก่อนแตะเครือข่าย', async () => {
  const { server, baseUrl, received } = await startServer((req, res) => res.end('{}'));
  try {
    const { status } = await runArgs(['--base-url', baseUrl, '--verbose'], { CSP_SUMMARY_TOKEN: 'x' });
    assert.equal(status, 1);
    assert.equal(received.length, 0);
  } finally {
    server.close();
  }
});
