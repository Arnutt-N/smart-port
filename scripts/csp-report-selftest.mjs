#!/usr/bin/env node
// CSP report self-test — issue #113: ยิง marker สดเข้า pipeline report-only
//
// ทำไมต้องมี: เกณฑ์ promote CSP เป็น enforce คือ "ไม่มี violation จากระบบจริง ≥ 7 วัน"
// ซึ่งอ่านจาก Render log — แต่ "log ว่าง" มีสองความหมายที่แยกกันไม่ออกด้วยตาเปล่า
//   (ก) ไม่มี violation จริง = พร้อม enforce
//   (ข) report ไม่เคยส่งถึง backend เลย = สรุปไม่ได้ ห้าม enforce
// marker ที่ยิงจากสคริปต์นี้คือสิ่งที่แยกสองกรณีออกจากกัน: เจอ marker ใน log = pipeline
// ครบวงจร (ตัด marker ทิ้งแล้วดู violation ที่เหลือได้) / ไม่เจอ marker = ตกกรณี (ข)
//
// **ขอบเขตของสิ่งที่สคริปต์นี้พิสูจน์ได้: จบที่ "handler ตอบ 204"** ไม่ได้พิสูจน์ว่า
// error_log() เขียนลง log stream สำเร็จ (handler ตอบ 204 แม้ body จะแกะไม่ได้ — api.php)
// หลักฐานจริงมีทางเดียวคือเห็น marker ในหน้า log ด้วยตา
//
// marker ผูกวันที่ (UTC) + nonce เพราะ Render retention ของ plan ที่ไม่ใช่ Enterprise ราว
// 7 วัน — marker ของรอบก่อนจะหลุดพอดีตอนถึงจุดตัดสินใจ ต้องยิงใหม่ทุกครั้งก่อนอ่าน log
//
// Usage: node scripts/csp-report-selftest.mjs [--base-url https://smart-port.onrender.com]
//   --base-url  ใช้ตอนเทสกับ mock server (default = production static site)
// Exit 0 = backend ตื่นและรับ report แล้วตอบ 204, Exit 1 = warm up ไม่ติด / ไม่ได้ 204
//
// ยิงผ่าน static site (`/api/*` → rewrite ไป backend) ตั้งใจให้เดินเส้นทางเดียวกับที่
// browser ใช้จริงทุก hop ไม่ใช่ยิงตรงเข้า backend origin — ถ้า rewrite พัง ต้องรู้ตรงนี้

import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE = 'https://smart-port.onrender.com';
const WARMUP_PATH = '/api/readyz';
const REPORT_PATH = '/api/csp-report';
const FETCH_TIMEOUT_MS = 30_000;
// backend เป็น `plan: free` — ตื่นจาก spin down ใช้เวลาได้หลายสิบวินาที (วัดจริง 2026-08-18:
// readyz นัดแรก 23.1s) และ gateway เคย DNS หน่วงเป็นพัก ๆ (handoff 2026-08-16)
// จึงให้โอกาส warm up มากกว่า report
const WARMUP_ATTEMPTS = 3;
const WARMUP_RETRY_DELAY_MS = 2_000;
const REPORT_ATTEMPTS = 2;
const MARKER_DIRECTIVE = 'img-src';

// ต้องตรงกับ error_log() ใน backend/api.php case 'csp-report' — ถ้าฝั่ง PHP เปลี่ยนข้อความ
// คำค้นที่พิมพ์ออกไปจะหาไม่เจอ แล้ว "ไม่เจอ marker" จะถูกตีความผิดเป็น "pipeline พัง"
// เทส `รูปแบบ log ...` ใน scripts/tests/csp-report-selftest.test.mjs กัน drift นี้ไว้
//
// หมายเหตุรูปแบบ payload: render.yaml ใช้ `report-uri` (legacy) อย่างเดียว → body เป็น
// `{"csp-report": {...}}` แบบ kebab-case ตรงกับที่ handler แกะ ถ้าวันไหนย้ายไป Reporting API
// (`Reporting-Endpoints` + `report-to`) shape จะกลายเป็น camelCase (`effectiveDirective`,
// `blockedURL`) ต้องแก้ทั้ง handler และ buildReportBody พร้อมกัน
const LOG_DIRECTIVE_PREFIX = '[csp-report] violation directive=';
const LOG_BLOCKED_PREFIX = ' blocked-host=';

// error_log() ของ handler ออก stderr ของ container backend (Dockerfile ตั้ง
// error_log = /dev/stderr) — เปิด log ของ static site จะเห็นว่างเสมอ
const RENDER_LOG_SERVICE = 'smartport-backend';

const USAGE = `Usage: node scripts/csp-report-selftest.mjs [--base-url <url>]

  --base-url <url>  origin ที่จะยิง (default = ${DEFAULT_BASE})
                    ใช้ชี้ mock server ตอนเทส — ค่าอื่นที่ไม่ใช่ default จะไม่ผ่าน
                    rewrite /api/* ของ static site จึงพิสูจน์ pipeline จริงไม่ได้
  -h, --help        แสดงข้อความนี้

ยิง CSP violation report marker สดเข้า pipeline report-only แล้วบอกบรรทัดที่ต้องไปค้นใน
Render log ของ service ${RENDER_LOG_SERVICE} — รายละเอียดเกณฑ์ enforce อยู่ที่
docs/frontend-security-headers.md §CSP monitoring ก่อน enforce`;

const normalizeBase = (value) => {
  const trimmed = value.trim().replace(/\/+$/, '');
  // ต้องเป็น URL จริงและเป็น http(s) เท่านั้น — กันทั้ง flag ที่พิมพ์ผิดถูกกลืนมาเป็นค่า
  // (แล้วไปรายงานผิดว่า "ปลุก backend ไม่ขึ้น") และ scheme แปลก ๆ อย่าง file:/data:
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`--base-url ไม่ใช่ URL ที่ใช้ได้: "${value}"`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`--base-url ต้องเป็น http/https เท่านั้น (ได้ "${parsed.protocol}")`);
  }
  return trimmed;
};

/**
 * fail-closed กับ argument ที่ไม่รู้จัก — ต่างจาก gate อื่นตรงที่ default ของสคริปต์นี้คือ
 * "ยิง production จริง" ถ้าข้าม flag ที่พิมพ์ผิดไปเงียบ ๆ คนที่ตั้งใจยิง staging จะไปโดน
 * production แทนโดยไม่รู้ตัว และค่าที่ขึ้นต้นด้วย -- ก็ห้ามถูกกลืนเป็นค่าของ --base-url
 */
function parseArgs(argv) {
  const args = { baseUrl: DEFAULT_BASE, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      args.help = true;
      continue;
    }
    if (arg === '--base-url') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error('--base-url ต้องตามด้วย URL (เช่น --base-url https://smart-port.onrender.com)');
      args.baseUrl = normalizeBase(value);
      i++;
      continue;
    }
    if (arg.startsWith('--base-url=')) {
      args.baseUrl = normalizeBase(arg.slice('--base-url='.length));
      continue;
    }
    throw new Error(`อาร์กิวเมนต์ที่ใช้ไม่ได้: "${arg}" — ดู --help`);
  }
  return args;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * marker host ของรอบนี้ — `csp-selftest-YYYYMMDD-<nonce>.invalid`
 * - วันที่เป็น UTC ให้ตรงกับ timestamp ใน Render log (ยิงเช้า SEAST จะได้วันที่ก่อนหน้า
 *   ซึ่งถูกแล้ว สคริปต์พิมพ์ marker ที่ใช้จริงออกมาเสมอ ไม่ให้ผู้ใช้เดาวันที่เอง)
 * - nonce แยก "marker ที่เพิ่งยิง" ออกจาก marker ของรอบอื่นในวันเดียวกัน (รันซ้ำ/รันจาก
 *   เครื่องอื่น) — ไม่งั้น marker เก่าที่ค้างใน log จะถูกนับเป็นหลักฐานของรอบนี้
 * - `.invalid` เป็น TLD สงวนตาม RFC 2606 — resolve ไม่ได้แน่นอน จึงชนกับ host จริงไม่ได้
 */
function buildMarkerHost(now = new Date(), nonce = randomBytes(2).toString('hex')) {
  return `csp-selftest-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${nonce}.invalid`;
}

/**
 * payload ตามรูป CSP report ของ browser — handler อ่าน `$report['csp-report'] ?? $report`
 * แล้วหยิบ effective-directive (fallback violated-directive) + host ของ blocked-uri
 * blocked-uri ต้องเป็น absolute URL ที่มี host ไม่งั้น parse_url คืน false → log เป็น 'self'
 */
function buildReportBody(markerHost, documentUri) {
  return {
    'csp-report': {
      'document-uri': documentUri,
      referrer: '',
      'violated-directive': MARKER_DIRECTIVE,
      'effective-directive': MARKER_DIRECTIVE,
      'original-policy': `img-src 'self' data:; report-uri ${REPORT_PATH}`,
      disposition: 'report',
      'blocked-uri': `https://${markerHost}/probe.png`,
      'status-code': 200,
      'script-sample': '',
    },
  };
}

/**
 * แยก "PHP ตอบเองว่ายังไม่พร้อม" ออกจาก "edge ตอบแทนตอน container ยังไม่ตื่น"
 * readyz ของเรา (backend/routes/readyz.php) คืน JSON ที่มีคีย์ `status` เสมอ —
 * 200 ready / 503 not_ready|migrations_pending ส่วน 502/504 หรือ 5xx ที่ body ไม่ใช่รูปนั้น
 * มาจาก edge ของ Render ระหว่างบูต = **ยังไม่ตื่น ต้อง retry ไม่ใช่นับว่าผ่าน**
 * (ถ้านับว่าผ่านแล้วยิง report ต่อ marker จะหายไปกับ container ที่ยังไม่รับงาน)
 */
function isBackendAwake(status, body) {
  if (status < 500) return true;
  try {
    const parsed = JSON.parse(body);
    return typeof parsed?.status === 'string';
  } catch {
    return false;
  }
}

/**
 * ดึง release SHA จาก body ของ readyz (`RENDER_GIT_COMMIT` หรือ 'dev' — readyz.php:19-23)
 * ใช้ผูก marker เข้ากับ deployment ที่รับ request จริง เวลาต้องสืบว่า marker หายไปกับ
 * deploy ไหน — Render log ก็แสดง commit ของ container ทำให้เทียบกันได้
 */
function readReleaseSha(body) {
  try {
    const release = JSON.parse(body)?.release;
    return typeof release === 'string' && release !== '' ? release : null;
  } catch {
    return null;
  }
}

/**
 * ปลุก backend ก่อนยิง report — CSP report เป็น fire-and-forget ไม่มี retry ฝั่ง browser
 * ถ้ายิงตอน container ยังหลับ marker จะหายเงียบและทำให้ผลรอบนี้ตีความไม่ได้
 */
async function warmUp(baseUrl) {
  let lastDetail = 'ไม่ทราบสาเหตุ';
  for (let attempt = 1; attempt <= WARMUP_ATTEMPTS; attempt++) {
    const started = Date.now();
    try {
      const res = await fetch(baseUrl + WARMUP_PATH, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const body = await res.text().catch(() => '');
      const ms = Date.now() - started;
      if (isBackendAwake(res.status, body)) return { status: res.status, ms, attempts: attempt, release: readReleaseSha(body) };
      lastDetail = `HTTP ${res.status} ที่ไม่ใช่รูป JSON ของ readyz — edge ตอบแทนระหว่าง container บูต`;
    } catch (err) {
      lastDetail = err.message;
    }
    if (attempt < WARMUP_ATTEMPTS) {
      console.error(`  (warm up ครั้งที่ ${attempt}/${WARMUP_ATTEMPTS} ยังไม่ตื่น: ${lastDetail}) — รอ ${WARMUP_RETRY_DELAY_MS / 1000}s แล้วลองใหม่`);
      await sleep(WARMUP_RETRY_DELAY_MS);
    }
  }
  throw new Error(lastDetail);
}

/**
 * ยิง report — retry เฉพาะตอน network error/timeout เท่านั้น
 * (ได้ status กลับมาแล้วถือว่าเป็นคำตอบจริง ไม่ยิงซ้ำ) การ retry หลัง timeout อาจทำให้ได้
 * marker ซ้ำสองบรรทัดใน log ซึ่งไม่เป็นไร — ทั้งคู่เป็นของรอบนี้และถูกตัดทิ้งอยู่แล้ว
 *
 * redirect: 'manual' ตั้งใจ — ถ้าตาม redirect (301/302/303) fetch จะแปลง POST เป็น GET
 * และ **ทิ้ง body** แล้วปลายทางอาจตอบ 204 ทำให้สคริปต์รายงาน PASS ทั้งที่ไม่มี report
 * ถึง handler เลยสักไบต์ (false-PASS) — ต้องเห็น 3xx แล้ว fail พร้อมบอก Location
 */
async function sendReport(baseUrl, body) {
  let lastError;
  for (let attempt = 1; attempt <= REPORT_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(baseUrl + REPORT_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/csp-report' },
        body: JSON.stringify(body),
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      return { status: res.status, attempts: attempt, location: res.headers.get('location'), sentAt: new Date().toISOString() };
    } catch (err) {
      lastError = err;
      if (attempt < REPORT_ATTEMPTS) console.error(`  (retry ${attempt}/${REPORT_ATTEMPTS - 1} หลังจาก: ${err.message})`);
    }
  }
  throw lastError;
}

/** คำอธิบายเพิ่มเติมของ status ที่ไม่ใช่ 204 — แต่ละตัวมีความหมายต่อการอ่าน log คนละแบบ */
function explainStatus(status, location) {
  if (status >= 300 && status < 400) {
    return `มี redirect ระหว่างทาง (Location: ${location ?? 'ไม่ระบุ'}) — POST จะถูกแปลงเป็น GET และ body ถูกทิ้ง report จึงไม่มีทางถึง handler ตรวจ route/rewrite ที่เพิ่งเพิ่มเข้ามา`;
  }
  if (status === 404) {
    return 'rewrite /api/* ของ static site หรือ case csp-report ใน backend/api.php หายไป — report ของ browser จริงก็ตกทางเดียวกัน';
  }
  if (status === 405) {
    return 'handler ไม่รับ POST — เช็ค case csp-report ใน backend/api.php หรือมี hop ที่แปลง POST เป็น GET ระหว่างทาง';
  }
  if (status === 429) {
    return 'ชน rate limit (60 req/นาที ต่อ IP ที่ backend/api.php) — request นี้ถูกทิ้งก่อนถึง handler จึงไม่มี marker ใน log รอสักครู่แล้วยิงใหม่';
  }
  if (status === 502 || status === 503 || status === 504) {
    return `edge ตอบแทน container (HTTP ${status}) — request ไม่ถึง PHP จึงไม่มี stack trace ใน log ให้ดู ลองใหม่หลัง backend ตื่นเต็มที่`;
  }
  if (status >= 500) {
    return `backend error — เปิด log ของ service ${RENDER_LOG_SERVICE} ดู stack trace ก่อน`;
  }
  return 'handler สัญญาว่าจะตอบ 204 เสมอเมื่อรับ report ได้ — status อื่นแปลว่า request ไม่ถึง handler';
}

/** ขั้นตอนที่ automation ทำแทนไม่ได้ (ไม่มีสิทธิ์อ่าน Render log) — ต้องบอกให้ชัดว่าหาอะไรที่ไหน */
function printNextSteps(markerHost) {
  console.log('\n— ขั้นต่อไป (ต้องทำด้วยตา) —');
  console.log(`  1. เปิด Render log ของ service "${RENDER_LOG_SERVICE}" (ไม่ใช่ static site) แล้วค้นหา:`);
  console.log(`\n     ${LOG_DIRECTIVE_PREFIX}${MARKER_DIRECTIVE}${LOG_BLOCKED_PREFIX}${markerHost}\n`);
  // สำรอง: ถ้า log filter ตีความ [ หรือ = เป็น syntax หรือ copy ตกไปตัวหนึ่ง ผลจะกลายเป็น
  // "ไม่เจอ marker" = ห้าม enforce ซึ่งเผาหน้าต่าง 7 วันทิ้งฟรี ๆ — marker มี nonce จึง unique พอ
  console.log(`     (ถ้า filter ไม่รับอักขระพิเศษ ค้นด้วย marker ล้วน ๆ ก็พอ: ${markerHost})\n`);
  console.log('  2. เจอ marker  → pipeline ครบวงจร: ตัดบรรทัด marker ทิ้ง แล้วดู violation ที่เหลือในหน้าต่าง 7 วัน');
  console.log('  3. ไม่เจอ marker → สรุปไม่ได้ ห้าม enforce (log ว่างอาจแปลว่า report ไม่เคยส่งถึง)');
  console.log('\n  เตือน: marker เดียวไม่พอสำหรับตัดสินใจ enforce — ต้องมี traffic จริงในหน้าต่าง 7 วันด้วย');
  console.log('  เกณฑ์เต็มอยู่ที่ docs/frontend-security-headers.md §CSP monitoring ก่อน enforce');
}

async function main() {
  const { baseUrl, help } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(USAGE);
    return;
  }
  const markerHost = buildMarkerHost();

  console.log('CSP report self-test — issue #113');
  console.log(`base URL: ${baseUrl}`);
  console.log(`marker:   ${markerHost}  (directive ${MARKER_DIRECTIVE})`);
  if (baseUrl !== DEFAULT_BASE) {
    console.log(`  [!] ไม่ใช่ production (${DEFAULT_BASE}) — รอบนี้ไม่ได้เดินผ่าน rewrite /api/* ของ static site`);
    console.log('      marker ที่ได้จึงใช้เป็นหลักฐานของ pipeline จริงไม่ได้');
  }

  // 1) warm up — ต้องผ่านก่อนเสมอ ไม่งั้น marker อาจหายไปกับ container ที่ยังหลับ
  console.log(`\n— Warm up (${WARMUP_PATH}) —`);
  let warm;
  try {
    warm = await warmUp(baseUrl);
  } catch (err) {
    console.error(`  [✗] ปลุก backend ไม่ขึ้นหลังลอง ${WARMUP_ATTEMPTS} ครั้ง: ${err.message}`);
    console.error('\n✗ FAIL: ยังไม่ยิง report เพราะพิสูจน์ไม่ได้ว่า backend รับ request อยู่');
    console.error('  (report เป็น fire-and-forget ไม่มี retry — ยิงตอนนี้เสี่ยง marker หายเงียบแล้วอ่าน log ผิด)');
    process.exitCode = 1;
    return;
  }
  const release = warm.release ? `, release=${warm.release.slice(0, 12)}` : '';
  if (warm.status === 200) {
    console.log(`  [✓] backend ตื่นแล้ว (HTTP 200 ใน ${warm.ms}ms, ลอง ${warm.attempts} ครั้ง${release})`);
  } else {
    // ระวังอย่าอ้างเกินที่ตรวจ: isBackendAwake ปล่อยผ่าน status < 500 โดยไม่แตะ body เลย
    // (เช่น 404 ตอน route หาย) จึงพูดได้แค่ว่า "ไม่ใช่ 5xx ของ edge" ไม่ใช่ "readyz ตอบเอง"
    console.log(`  [~] ได้คำตอบที่ไม่ใช่ 5xx ของ edge แต่เป็น HTTP ${warm.status} ใน ${warm.ms}ms (ลอง ${warm.attempts} ครั้ง${release})`);
    console.log('      ยิง report ต่อได้ — มีคนรับงานแล้ว และ handler csp-report ไม่แตะ DB จึง log ได้แม้ readyz จะ not_ready');
  }

  // 2) ยิง marker เข้า pipeline เส้นเดียวกับที่ browser ใช้
  console.log(`\n— Report (${REPORT_PATH}) —`);
  let sent;
  try {
    sent = await sendReport(baseUrl, buildReportBody(markerHost, `${baseUrl}/`));
  } catch (err) {
    console.error(`  [✗] ยิง report ไม่สำเร็จ: ${err.message}`);
    console.error('\n✗ FAIL: ไม่ได้ 204 — ถือว่ายังไม่มี marker สดในรอบนี้');
    process.exitCode = 1;
    return;
  }
  if (sent.status !== 204) {
    console.error(`  [✗] ได้ HTTP ${sent.status} (ต้องเป็น 204)`);
    console.error(`      ${explainStatus(sent.status, sent.location)}`);
    console.error('\n✗ FAIL: ไม่ได้ 204 — ถือว่ายังไม่มี marker สดในรอบนี้');
    process.exitCode = 1;
    return;
  }
  console.log(`  [✓] HTTP 204 ตามสัญญาของ handler (ยิง ${sent.attempts} ครั้ง, ${sent.sentAt})`);

  printNextSteps(markerHost);

  // ระวังการอ่านผลกลับด้าน: exit 0 ไม่เท่ากับ "มี marker ใน log แล้ว" — handler ตอบ 204
  // แม้ body จะแกะไม่ได้ (api.php ตอบ 204 ท้าย case เสมอ) และ error_log() อาจเขียนไม่ลง
  console.log('\n✓ PASS: request ถึงปลายทางและได้ 204 ตามสัญญาของ handler');
  console.log('  แต่ 204 ยังไม่ใช่หลักฐานว่า marker ถูกเขียนลง log — หลักฐานคือขั้นตอนที่ 1 ข้างบนเท่านั้น');
}

export { buildMarkerHost, buildReportBody, isBackendAwake, LOG_DIRECTIVE_PREFIX, LOG_BLOCKED_PREFIX };

// รันเป็น CLI เมื่อถูกเรียกตรง ๆ (ไม่ใช่ถูก import)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`✗ FAIL: ${err.message}`);
    process.exitCode = 1;
  });
}
