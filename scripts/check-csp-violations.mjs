#!/usr/bin/env node
// CSP violation gate — issue #113 (R1)
//
// ถามสรุปตัวนับจาก backend แล้วตัดสินด้วย exit code แทนการเปิด Render log เพ่งด้วยตา
// exit 0 = ข้อมูลพร้อม + ไม่มี violation จากระบบจริงในหน้าต่างที่ขอ (+ เจอ marker ถ้าระบุ)
//
// **"ไม่มีข้อมูล" ไม่เท่ากับ "ไม่มี violation"** — storage: unavailable และ overflow_hits > 0
// ถือเป็น fail ทั้งคู่ เป็นบทเรียนเดียวกับ "log ว่าง ≠ ปลอดภัย"
//
// Usage: node scripts/check-csp-violations.mjs [--base-url <url>] [--days 7] [--require-marker <host>]
//   token อ่านจาก env CSP_SUMMARY_TOKEN เท่านั้น (argument โผล่ใน process list และ shell history)

import { pathToFileURL } from 'node:url';

const DEFAULT_BASE = 'https://smart-port.onrender.com';
const SUMMARY_PATH = '/api/csp-report/summary';
const FETCH_TIMEOUT_MS = 30_000;

const USAGE = `Usage: node scripts/check-csp-violations.mjs [--base-url <url>] [--days 7] [--require-marker <host>]

  --base-url <url>        origin ที่จะถาม (default = ${DEFAULT_BASE})
  --days <1-90>           ขนาดหน้าต่างที่ต้องสะอาด (default 7 ตามเกณฑ์ enforce)
  --require-marker <host> ต้องเจอ marker นี้ใน selftest ด้วย (ค่าที่ csp-report-selftest.mjs พิมพ์)
  -h, --help              แสดงข้อความนี้

env CSP_SUMMARY_TOKEN ต้องตั้งไว้ — ตรงกับค่าบน Render service smartport-backend`;

const normalizeBase = (value) => {
  const trimmed = value.trim().replace(/\/+$/, '');
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

/** fail-closed แบบเดียวกับ csp-report-selftest.mjs — default ของสคริปต์นี้คือยิง production */
function parseArgs(argv) {
  const args = { baseUrl: DEFAULT_BASE, days: 7, requireMarker: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '-h' || arg === '--help') {
      args.help = true;
      continue;
    }
    if (arg === '--base-url' && next && !next.startsWith('--')) {
      args.baseUrl = normalizeBase(next);
      i++;
      continue;
    }
    if (arg.startsWith('--base-url=')) {
      args.baseUrl = normalizeBase(arg.slice('--base-url='.length));
      continue;
    }
    if (arg === '--days' && next && !next.startsWith('--')) {
      args.days = Number(next);
      i++;
      continue;
    }
    if (arg === '--require-marker' && next && !next.startsWith('--')) {
      args.requireMarker = next;
      i++;
      continue;
    }
    throw new Error(`อาร์กิวเมนต์ที่ใช้ไม่ได้: "${arg}" — ดู --help`);
  }
  if (!Number.isInteger(args.days) || args.days < 1 || args.days > 90) {
    throw new Error(`--days ต้องเป็นจำนวนเต็ม 1-90 (ได้ "${args.days}")`);
  }
  return args;
}

/**
 * ตัดสินจาก summary ว่าผ่านเกณฑ์หรือไม่ — แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพื่อให้เทสตรวจ
 * "ความหมายของผลลัพธ์" ได้โดยไม่ต้องมี server
 *
 * code review I1 (round 1): เดิมใช้ `summary.violations?.total ?? 0` — field หายหรือเป็น
 * null (เช่น response ถูก proxy/cache แทรกหรือ backend เปลี่ยนรูปแบบในอนาคต) จะถูกอ่านเป็น
 * 0 แล้ว PASS ทั้งที่จริงคือ "ไม่รู้" ไม่ใช่ "สะอาด" — ขัดกับหลักการเดียวกับที่เช็ค storage
 * แบบ strict (`!== 'ready'`) ด้านบน ต้องเช็ครูปทรงก่อนอ่านค่าเสมอ: รูปทรงผิด = สรุปไม่ได้
 * (fail-closed) ไม่ใช่ตีความเป็น 0 แล้วปล่อยผ่านเงียบ ๆ
 */
function evaluateSummary(summary, { requireMarker = null } = {}) {
  const reasons = [];
  if (summary.storage !== 'ready') {
    reasons.push('backend ยังไม่มีตาราง csp_violation_daily (storage=' + summary.storage + ') → สรุปไม่ได้ ไม่ใช่ "ไม่มี violation"');
  }

  const hasViolationsTotal = typeof summary?.violations?.total === 'number';
  if (!hasViolationsTotal) {
    reasons.push('รูปแบบ response ไม่มี violations.total เป็นตัวเลข → สรุปไม่ได้ ไม่ใช่ "ไม่มี violation"');
  }
  const hasOverflowHits = typeof summary?.overflow_hits === 'number';
  if (!hasOverflowHits) {
    reasons.push('รูปแบบ response ไม่มี overflow_hits เป็นตัวเลข → สรุปไม่ได้ ไม่ใช่ "ไม่มี violation"');
  }

  if (hasViolationsTotal && summary.violations.total > 0) {
    const detail = (summary.violations.top ?? [])
      .slice(0, 5)
      .map((r) => `${r.directive} ← ${r.blocked_host} (${r.hits})`)
      .join(', ');
    reasons.push(`พบ violation จากระบบจริง ${summary.violations.total} ครั้ง: ${detail}`);
  }
  if (hasOverflowHits && summary.overflow_hits > 0) {
    reasons.push(`overflow_hits=${summary.overflow_hits} → ชนเพดาน key ต่อวัน ข้อมูลไม่ครบ ต้องดู Render log ประกอบ`);
  }
  if (requireMarker) {
    if (!Array.isArray(summary?.selftest?.markers)) {
      reasons.push(`รูปแบบ response ไม่มี selftest.markers เป็น array → สรุปไม่ได้ว่าเจอ marker "${requireMarker}" หรือไม่`);
    } else {
      const markers = summary.selftest.markers.map((m) => m.blocked_host);
      if (!markers.includes(requireMarker)) {
        reasons.push(`ไม่เจอ marker "${requireMarker}" ในหน้าต่างนี้ → pipeline ยังพิสูจน์ไม่ได้`);
      }
    }
  }
  return { ok: reasons.length === 0, reasons };
}

async function fetchSummary(baseUrl, days, token) {
  // redirect: 'manual' ตั้งใจ (เหมือน csp-report-selftest.mjs) — ถ้าตาม redirect ไปเงียบ ๆ
  // แล้วปลายทางเป็น origin อื่นที่ตอบ 200 ด้วย JSON ของมันเอง สคริปต์จะเอา JSON ของคนอื่นมา
  // ตัดสิน "สะอาด" โดยไม่รู้ตัว (false-PASS) ต้องเห็น 3xx แล้ว fail ชัด ๆ แทน
  const res = await fetch(`${baseUrl}${SUMMARY_PATH}?days=${days}`, {
    method: 'GET',
    headers: { 'x-csp-summary-token': token },
    redirect: 'manual',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 401) throw new Error('401 — CSP_SUMMARY_TOKEN ไม่ตรงกับค่าบน backend');
  if (res.status === 503) throw new Error('503 — backend ยังไม่ได้ตั้ง env CSP_SUMMARY_TOKEN');
  if (res.status !== 200) throw new Error(`ได้ HTTP ${res.status} (ต้องเป็น 200)`);
  return res.json();
}

async function main() {
  const { baseUrl, days, requireMarker, help } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(USAGE);
    return;
  }
  const token = process.env.CSP_SUMMARY_TOKEN ?? '';
  if (token === '') {
    console.error('✗ FAIL: ไม่ได้ตั้ง env CSP_SUMMARY_TOKEN — ดูค่าจาก Render service smartport-backend');
    process.exitCode = 1;
    return;
  }

  console.log('CSP violation gate — issue #113');
  console.log(`base URL: ${baseUrl}`);
  console.log(`window:   ${days} วัน${requireMarker ? `  marker ที่ต้องเจอ: ${requireMarker}` : ''}`);

  let summary;
  try {
    summary = await fetchSummary(baseUrl, days, token);
  } catch (err) {
    console.error(`\n✗ FAIL: อ่านสรุปไม่ได้ — ${err.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nตั้งแต่ ${summary.since} (storage=${summary.storage})`);
  console.log(`  violation จริง : ${summary.violations?.total ?? 0}`);
  console.log(`  marker ของทีม  : ${summary.selftest?.total ?? 0}`);
  console.log(`  overflow       : ${summary.overflow_hits ?? 0}`);

  const { ok, reasons } = evaluateSummary(summary, { requireMarker });
  if (!ok) {
    console.error('');
    for (const reason of reasons) console.error(`  [✗] ${reason}`);
    console.error('\n✗ FAIL: ยังไม่ผ่านเกณฑ์ ห้าม enforce');
    process.exitCode = 1;
    return;
  }
  console.log(`\n✓ PASS: ไม่มี violation จากระบบจริงในหน้าต่าง ${days} วัน`);
  console.log('  เตือน: เกณฑ์นี้มีความหมายก็ต่อเมื่อมีคนใช้งานจริงในหน้าต่างนั้นด้วย');
  console.log('  ดู docs/frontend-security-headers.md §CSP monitoring ก่อน enforce');
}

export { evaluateSummary, parseArgs };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`✗ FAIL: ${err.message}`);
    process.exitCode = 1;
  });
}
