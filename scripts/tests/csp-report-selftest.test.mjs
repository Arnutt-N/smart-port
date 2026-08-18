import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildMarkerHost,
  buildReportBody,
  isBackendAwake,
  LOG_DIRECTIVE_PREFIX,
  LOG_BLOCKED_PREFIX,
} from '../csp-report-selftest.mjs';

// Issue #113 — regression ของ CSP report self-test
// เทสผ่าน CLI จริงแต่ชี้ --base-url ไปที่ mock origin บน 127.0.0.1 (แบบเดียวกับ
// verify-live-headers.test.mjs) — CI ไม่ต้องพึ่งเครือข่าย/production
//
// สิ่งที่เทสชุดนี้ปกป้องคือ "ความหมายของผลลัพธ์" ไม่ใช่แค่ exit code:
// self-test นี้เป็นตัวแยก "log ว่างเพราะไม่มี violation" ออกจาก "log ว่างเพราะ report
// ไม่เคยส่งถึง" — ถ้าสคริปต์รายงาน PASS ทั้งที่ report ไม่ได้ถึง handler จริง
// decision rule ของวัน enforce จะพังเงียบ ๆ

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'csp-report-selftest.mjs');
const MARKER_RE = /csp-selftest-\d{8}-[0-9a-f]{4}\.invalid/;

function run(baseUrl, extraArgs = []) {
  return runArgs(['--base-url', baseUrl, ...extraArgs]);
}

function runArgs(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd: ROOT });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const timer = setTimeout(() => {
      child.kill();
      rejectRun(new Error('csp-report-selftest.mjs ไม่จบภายใน 60s'));
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

/** mock origin: routes คีย์เป็น "METHOD path" — บันทึกทุก request ที่เข้ามาไว้ตรวจ */
function startServer(routes) {
  const received = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, headers: req.headers, body });
      const handler = routes[`${req.method} ${req.url}`];
      if (!handler) {
        res.statusCode = 404;
        res.end('no route');
        return;
      }
      handler(req, res, received);
    });
  });
  return new Promise((ready) => {
    server.listen(0, '127.0.0.1', () => {
      ready({ server, received, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

const ok204 = (req, res) => {
  res.statusCode = 204;
  res.end();
};

const readyzOk = (req, res) => {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ status: 'ready' }));
};

test('happy path: warm up แล้วยิง marker ผูกวันที่ ได้ 204 → exit 0 พร้อมบอกคำค้นใน log', async () => {
  const { server, baseUrl, received } = await startServer({
    'GET /api/readyz': readyzOk,
    'POST /api/csp-report': ok204,
  });
  try {
    const { status, output } = await run(baseUrl);
    assert.equal(status, 0, output);
    assert.match(output, /PASS/);

    // marker ของรอบนี้มี nonce จึงเดาล่วงหน้าไม่ได้ — ต้องอ่านจาก output แล้วเทียบว่า
    // marker ที่ยิงจริงกับ marker ในคำค้นเป็นตัวเดียวกัน (ถ้าหลุดจากกัน คนจะค้น log ไม่เจอ)
    const marker = MARKER_RE.exec(output)?.[0];
    assert.ok(marker, `output ต้องมี marker:\n${output}`);
    assert.ok(
      output.includes(`${LOG_DIRECTIVE_PREFIX}img-src${LOG_BLOCKED_PREFIX}${marker}`),
      `output ต้องมีบรรทัด log ที่ต้องไปค้นหา:\n${output}`
    );
    const post = received.find((r) => r.url === '/api/csp-report');
    assert.equal(new URL(JSON.parse(post.body)['csp-report']['blocked-uri']).hostname, marker);

    // กับดักที่เคยทำให้ "log ว่าง" ตีความผิด: log อยู่ที่ service backend ไม่ใช่ static site
    assert.ok(output.includes('smartport-backend'), `output ต้องบอกว่าให้เปิด log ของ service ไหน:\n${output}`);
    // 204 ไม่ใช่หลักฐานว่า error_log() ทำงาน — ห้ามให้ PASS ชวนอ่านกลับด้าน
    assert.match(output, /ยังไม่ใช่หลักฐาน/, `PASS ต้องระบุขอบเขตของสิ่งที่พิสูจน์ได้:\n${output}`);

    // warm up ต้องมาก่อน report เสมอ (backend plan free spin down ได้ — report เป็น fire-and-forget)
    assert.equal(received.length, 2, JSON.stringify(received.map((r) => `${r.method} ${r.url}`)));
    assert.equal(received[0].url, '/api/readyz');
    assert.equal(received[1].url, '/api/csp-report');
  } finally {
    server.close();
  }
});

test('payload ต้องเป็น CSP report shape ที่ handler จริงแกะได้ และ marker เป็นวันที่ UTC วันนี้', async () => {
  const { server, baseUrl, received } = await startServer({
    'GET /api/readyz': readyzOk,
    'POST /api/csp-report': ok204,
  });
  try {
    const { status, output } = await run(baseUrl);
    assert.equal(status, 0, output);

    const post = received.find((r) => r.url === '/api/csp-report');
    // handler อ่าน php://input แล้ว json_decode → ต้องเป็น JSON ที่ห่อด้วยคีย์ 'csp-report'
    // (api.php: $report['csp-report'] ?? $report) และ content-type ตามที่ browser ส่งจริง
    assert.equal(post.headers['content-type'], 'application/csp-report');
    const body = JSON.parse(post.body);
    const inner = body['csp-report'];
    assert.ok(inner, `body ต้องห่อด้วยคีย์ csp-report: ${post.body}`);
    assert.equal(inner['effective-directive'], 'img-src');
    // handler ใช้ parse_url(blocked-uri, PHP_URL_HOST) → ต้องเป็น absolute URL ที่มี host
    const blockedHost = new URL(inner['blocked-uri']).hostname;
    assert.match(blockedHost, MARKER_RE);
    assert.ok(blockedHost.startsWith(`csp-selftest-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-`), blockedHost);
    // cap 10KB ของ handler (api.php: file_get_contents ... 10240) — payload ต้องไม่ชนเพดาน
    assert.ok(Buffer.byteLength(post.body) < 10240, `payload ยาวเกิน cap 10KB ของ handler: ${post.body.length}`);
  } finally {
    server.close();
  }
});

test('redirect ระหว่างทางต้อง fail — ตาม redirect = POST กลายเป็น GET และ body หายทั้งก้อน', async () => {
  // false-PASS ที่แพงที่สุด: ถ้าใช้ redirect: 'follow' ปลายทางจะตอบ 204 ให้ GET ที่ไม่มี body
  // แล้วสคริปต์รายงาน PASS ทั้งที่ไม่มี report ถึง handler เลยสักไบต์
  const { server, baseUrl, received } = await startServer({
    'GET /api/readyz': readyzOk,
    'POST /api/csp-report': (req, res) => {
      res.statusCode = 302;
      res.setHeader('location', '/api/csp-report-final');
      res.end();
    },
    'GET /api/csp-report-final': ok204,
    'POST /api/csp-report-final': ok204,
  });
  try {
    const { status, output } = await run(baseUrl);
    assert.equal(status, 1, output);
    assert.match(output, /ได้ HTTP 302/, output);
    assert.doesNotMatch(output, /PASS/, output);
    assert.equal(received.filter((r) => r.url === '/api/csp-report-final').length, 0, 'ห้ามเดินตาม redirect ต่อ');
  } finally {
    server.close();
  }
});

test('ไม่ได้ 204 (404 = rewrite/handler หาย) → exit 1 ไม่ใช่ PASS', async () => {
  const { server, baseUrl } = await startServer({
    'GET /api/readyz': readyzOk,
    // ไม่ประกาศ POST /api/csp-report → mock ตอบ 404 เหมือนตอน rewrite ผิดทาง
  });
  try {
    const { status, output } = await run(baseUrl);
    assert.equal(status, 1, output);
    assert.match(output, /FAIL/);
    // ห้าม assert แค่ includes('404') — ephemeral port ของ mock มีเลข 404 ได้เอง
    assert.match(output, /ได้ HTTP 404/, output);
  } finally {
    server.close();
  }
});

test('429 (ชน rate limit 60/นาที) → exit 1 และบอกชัดว่า marker ไม่ได้ถูก log', async () => {
  const { server, baseUrl } = await startServer({
    'GET /api/readyz': readyzOk,
    'POST /api/csp-report': (req, res) => {
      res.statusCode = 429;
      res.end('rate limited');
    },
  });
  try {
    const { status, output } = await run(baseUrl);
    assert.equal(status, 1, output);
    assert.match(output, /ได้ HTTP 429/, output);
    assert.match(output, /rate limit/i);
  } finally {
    server.close();
  }
});

test('warm up ไม่ติดเลย → exit 1 และต้องไม่ยิง report (กัน marker หายเงียบ)', async () => {
  const { server, baseUrl, received } = await startServer({
    // ตัด socket ทิ้งเลียนแบบตอน backend หลับ/gateway ตาย — fetch จะ reject ไม่ใช่ได้ status
    'GET /api/readyz': (req, res) => res.socket.destroy(),
    'POST /api/csp-report': ok204,
  });
  try {
    const { status, output } = await run(baseUrl);
    assert.equal(status, 1, output);
    assert.equal(
      received.filter((r) => r.url === '/api/csp-report').length,
      0,
      'ห้ามยิง report ทั้งที่ยังไม่รู้ว่า backend ตื่น — report เป็น fire-and-forget ไม่มี retry'
    );
  } finally {
    server.close();
  }
});

test('502 จาก edge ระหว่าง container บูต = ยังไม่ตื่น ต้อง retry แล้ว fail ไม่ใช่ยิง report ต่อ', async () => {
  // cold start ของ plan free คือสถานการณ์ที่ warm up ถูกออกแบบมารับพอดี — ถ้านับ 502
  // ว่า "ตื่นแล้ว" report จะถูกยิงเข้า container ที่ยังไม่รับงาน แล้ว marker หายเงียบ
  const { server, baseUrl, received } = await startServer({
    'GET /api/readyz': (req, res) => {
      res.statusCode = 502;
      res.end('<html>Bad Gateway</html>');
    },
    'POST /api/csp-report': ok204,
  });
  try {
    const { status, output } = await run(baseUrl);
    assert.equal(status, 1, output);
    assert.match(output, /HTTP 502/, output);
    assert.equal(received.filter((r) => r.url === '/api/readyz').length, 3, 'ต้อง retry ครบ 3 ครั้งก่อนยอมแพ้');
    assert.equal(received.filter((r) => r.url === '/api/csp-report').length, 0);
  } finally {
    server.close();
  }
});

test('warm up ล้มครั้งแรกแล้วติดครั้งที่สอง → ยิง report ต่อได้ (retry ต้องทำงานจริง)', async () => {
  let warmupHits = 0;
  const { server, baseUrl, received } = await startServer({
    'GET /api/readyz': (req, res) => {
      warmupHits++;
      if (warmupHits === 1) return res.socket.destroy();
      return readyzOk(req, res);
    },
    'POST /api/csp-report': ok204,
  });
  try {
    const { status, output } = await run(baseUrl);
    assert.equal(status, 0, output);
    assert.match(output, /ลอง 2 ครั้ง/, output);
    assert.equal(received.filter((r) => r.url === '/api/csp-report').length, 1);
  } finally {
    server.close();
  }
});

test('report เจอ network error ครั้งแรกแล้วสำเร็จครั้งที่สอง → exit 0', async () => {
  let reportHits = 0;
  const { server, baseUrl } = await startServer({
    'GET /api/readyz': readyzOk,
    'POST /api/csp-report': (req, res) => {
      reportHits++;
      if (reportHits === 1) return res.socket.destroy();
      return ok204(req, res);
    },
  });
  try {
    const { status, output } = await run(baseUrl);
    assert.equal(status, 0, output);
    assert.match(output, /retry 1\/1/, output);
    assert.equal(reportHits, 2);
  } finally {
    server.close();
  }
});

test('readyz ตอบ 503 not_ready → ถือว่า PHP รับงานแล้ว ยิงต่อได้ (handler ไม่แตะ DB)', async () => {
  const { server, baseUrl, received } = await startServer({
    'GET /api/readyz': (req, res) => {
      res.statusCode = 503;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ status: 'not_ready' }));
    },
    'POST /api/csp-report': ok204,
  });
  try {
    const { status, output } = await run(baseUrl);
    assert.equal(status, 0, output);
    assert.match(output, /HTTP 503/, `ต้องเตือนว่า readyz ไม่ 200 แต่ไม่บล็อก:\n${output}`);
    assert.equal(received.filter((r) => r.url === '/api/csp-report').length, 1);
  } finally {
    server.close();
  }
});

test('argument ที่ไม่รู้จักต้อง fail ก่อนแตะเครือข่าย ไม่ใช่ falls back ไปยิง production', async () => {
  const { server, baseUrl, received } = await startServer({
    'GET /api/readyz': readyzOk,
    'POST /api/csp-report': ok204,
  });
  try {
    const { status, output } = await run(baseUrl, ['--verbose']);
    assert.equal(status, 1, output);
    assert.ok(output.includes('--verbose'), output);
    assert.equal(received.length, 0, 'ต้องไม่ยิงอะไรเลยเมื่อ argument ผิด');

    // --base-url ที่ไม่มีค่าตามหลัง / มี flag ตามหลัง ต้องไม่กลืนแล้วไปยิง default (production)
    // assert ว่าไม่เข้าเฟส network เลย — ถ้าวันหนึ่งมีคนแก้ให้ fallback ไป DEFAULT_BASE
    // เทสชุดนี้จะยิง production จริงจากทุกเครื่องที่รัน ci-local และปลูก marker ปลอมลง log
    for (const args of [['--base-url'], ['--base-url', '--verbose'], ['--base-url=ftp://x']]) {
      const bad = await runArgs(args);
      assert.equal(bad.status, 1, `${args.join(' ')} → ${bad.output}`);
      assert.doesNotMatch(bad.output, /Warm up/, `ห้ามเข้าเฟส network เมื่อ argument ผิด: ${args.join(' ')}`);
    }
  } finally {
    server.close();
  }
});

test('รองรับรูป --base-url=<url> ด้วย (พิมพ์แบบนี้แล้วต้องไม่ถูกมองข้าม)', async () => {
  const { server, baseUrl, received } = await startServer({
    'GET /api/readyz': readyzOk,
    'POST /api/csp-report': ok204,
  });
  try {
    const { status, output } = await runArgs([`--base-url=${baseUrl}/`]);
    assert.equal(status, 0, output);
    assert.equal(received.filter((r) => r.url === '/api/csp-report').length, 1);
    // base URL ที่ไม่ใช่ production ต้องเตือนว่า marker นี้ไม่ได้ผ่าน rewrite จริง
    assert.match(output, /ไม่ใช่ production/, output);
  } finally {
    server.close();
  }
});

test('--help ต้อง exit 0 พร้อม usage ไม่ใช่ error', async () => {
  const { status, output } = await runArgs(['--help']);
  assert.equal(status, 0, output);
  assert.match(output, /Usage:/, output);
  assert.doesNotMatch(output, /Warm up/, 'ห้ามยิงอะไรตอนขอ help');
});

test('buildMarkerHost ผูกกับวันที่ UTC + nonce และปลอดภัยต่อ parse_url + sanitizeLogValue', () => {
  // ใช้ UTC เพราะ timestamp ใน Render log เป็น UTC — ยิงตอนเช้า SEAST อาจได้วันที่ก่อนหน้า
  // ซึ่งถูกต้องแล้ว สคริปต์จึงพิมพ์ marker ที่ใช้จริงออกมาเสมอ ไม่ให้ผู้ใช้เดาเอง
  assert.equal(buildMarkerHost(new Date('2026-08-24T00:30:00Z'), 'a3f9'), 'csp-selftest-20260824-a3f9.invalid');
  assert.equal(buildMarkerHost(new Date('2026-08-23T23:00:00Z'), 'a3f9'), 'csp-selftest-20260823-a3f9.invalid');
  // nonce ต้องสุ่มจริงต่อรอบ ไม่งั้น marker เก่าที่ค้างใน log จะถูกนับเป็นหลักฐานของรอบใหม่
  assert.notEqual(buildMarkerHost(), buildMarkerHost());

  const host = buildMarkerHost(new Date('2026-08-24T00:30:00Z'));
  assert.match(host, MARKER_RE);
  // ต้องเป็น hostname ที่ parse ได้จริง ไม่งั้น parse_url ฝั่ง PHP จะคืน false → log เป็น 'self'
  assert.equal(new URL(`https://${host}/probe.png`).hostname, host);
  // sanitizeLogValue ตัดที่ 100 ตัวอักษรและลบ control char — marker ต้องรอดครบทั้งเส้น
  assert.ok(host.length < 100, `marker ยาวเกินจนถูก sanitizeLogValue ตัด: ${host.length}`);
  assert.doesNotMatch(host, /[\x00-\x1F\x7F]/);
  // .invalid = TLD สงวนตาม RFC 2606 — resolve ไม่ได้แน่นอน จึงชนกับ host จริงไม่ได้
  assert.match(host, /\.invalid$/);
});

test('isBackendAwake แยก 503 ของ PHP ออกจาก 5xx ของ edge ได้', () => {
  // readyz จริง (backend/routes/readyz.php) คืน JSON ที่มีคีย์ status เสมอ
  assert.equal(isBackendAwake(200, JSON.stringify({ status: 'ready' })), true);
  assert.equal(isBackendAwake(503, JSON.stringify({ status: 'not_ready' })), true);
  assert.equal(isBackendAwake(503, JSON.stringify({ status: 'migrations_pending' })), true);
  // edge ของ Render ตอบแทนตอน container ยังไม่ตื่น — ไม่มีทางเป็น JSON ของ readyz
  assert.equal(isBackendAwake(502, '<html>Bad Gateway</html>'), false);
  assert.equal(isBackendAwake(504, ''), false);
  assert.equal(isBackendAwake(500, '<html>PHP fatal</html>'), false);
  // status ต่ำกว่า 500 แปลว่ามีคนรับงานแล้ว (เช่น 404 จาก route ที่หาย) — คนละปัญหากับ "ยังไม่ตื่น"
  assert.equal(isBackendAwake(404, 'not found'), true);
});

test('รูปแบบ log ที่สคริปต์บอกให้ค้นหา ต้องตรงกับ error_log จริงใน backend/api.php', () => {
  // anti-drift: ถ้ามีคนแก้ข้อความ error_log ฝั่ง PHP คำค้นที่สคริปต์พิมพ์จะหาไม่เจอ
  // แล้ว "ไม่เจอ marker" จะถูกตีความผิดเป็น "pipeline พัง" ทั้งที่แค่ข้อความเปลี่ยน
  const php = readFileSync(resolve(ROOT, 'backend', 'api.php'), 'utf8');
  assert.ok(
    php.includes(`'${LOG_DIRECTIVE_PREFIX}'`),
    `backend/api.php ไม่มี literal "${LOG_DIRECTIVE_PREFIX}" แล้ว — อัปเดต LOG_DIRECTIVE_PREFIX ใน csp-report-selftest.mjs`
  );
  assert.ok(
    php.includes(`'${LOG_BLOCKED_PREFIX}'`),
    `backend/api.php ไม่มี literal "${LOG_BLOCKED_PREFIX}" แล้ว — อัปเดต LOG_BLOCKED_PREFIX ใน csp-report-selftest.mjs`
  );
});

test('buildReportBody สร้าง body ที่ handler แกะ directive/host ได้ตรงตามที่ตั้งใจ', () => {
  const body = buildReportBody('csp-selftest-20260824-a3f9.invalid', 'https://smart-port.onrender.com/');
  const inner = body['csp-report'];
  // api.php อ่าน effective-directive ก่อน แล้ว fallback ไป violated-directive — ใส่ทั้งคู่ให้ตรงกัน
  assert.equal(inner['effective-directive'], 'img-src');
  assert.equal(inner['violated-directive'], 'img-src');
  assert.equal(new URL(inner['blocked-uri']).hostname, 'csp-selftest-20260824-a3f9.invalid');
  assert.equal(inner['document-uri'], 'https://smart-port.onrender.com/');
  // disposition ต้องเป็น report — ยืนยันในตัว log ว่ามาจาก report-only phase
  assert.equal(inner.disposition, 'report');
});
