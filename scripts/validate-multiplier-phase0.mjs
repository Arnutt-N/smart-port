#!/usr/bin/env node
// Phase 0 data-quality gate สำหรับ master data การนับทวีคูณ (GitHub issue #18)
// ตรวจ docs/multiplier_phase0_master_data_template.csv และ
// docs/multiplier_phase0_uat_cases_template.csv ตาม checklist ใน
// docs/multiplier_phase0_validation_pack.md — รันซ้ำได้ทุกครั้งที่ HR ส่งข้อมูลกลับ
//
// Usage: node scripts/validate-multiplier-phase0.mjs
// Exit 0 = ผ่านทุก check, Exit 1 = มี check ไม่ผ่าน (รายละเอียดใน output)

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MASTER_CSV = resolve(ROOT, 'docs/multiplier_phase0_master_data_template.csv');
const UAT_CSV = resolve(ROOT, 'docs/multiplier_phase0_uat_cases_template.csv');

const MULTIPLIER_PERCENT = 200;
const MIN_UAT_CASES = 10;
const SATUN_REQUIRED_DISTRICT_ROWS = 4;
const DAYS_PER_YEAR = 360;
const DAYS_PER_MONTH = 30;

function parseCsv(path) {
  const lines = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  const header = lines[0].split(',');
  return lines.slice(1).map((line, i) => {
    const cells = line.split(',');
    const row = { _line: i + 2 };
    header.forEach((key, idx) => (row[key] = (cells[idx] ?? '').trim()));
    return row;
  });
}

const isTodo = (v) => v === '' || /^TODO/i.test(v);
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const toUtc = (v) => Date.parse(`${v}T00:00:00Z`);
const inclusiveDays = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000) + 1;

function netBreakdown(effectiveDays) {
  const years = Math.floor(effectiveDays / DAYS_PER_YEAR);
  const months = Math.floor((effectiveDays % DAYS_PER_YEAR) / DAYS_PER_MONTH);
  const days = effectiveDays % DAYS_PER_MONTH;
  return { years, months, days };
}

const results = [];
function check(name, failures, pendingReason = null) {
  const status = pendingReason ? 'PENDING' : failures.length === 0 ? 'PASS' : 'FAIL';
  results.push({ name, status, details: pendingReason ? [pendingReason] : failures });
}

const master = parseCsv(MASTER_CSV);
const uat = parseCsv(UAT_CSV);

// --- Check 1: no whole-province Satun row ---
check(
  'No whole-province Satun row',
  master
    .filter((r) => r.province === 'สตูล' && (r.district === '' || r.whole_province === 'yes'))
    .map((r) => `${r.row_id}: สตูลต้องเป็นระดับอำเภอเท่านั้น`)
);

// --- Check 2: Satun has exactly 4 named district rows ---
const satunRows = master.filter((r) => r.province === 'สตูล');
const satunNamed = satunRows.filter((r) => !isTodo(r.district));
check(
  `Satun has exactly ${SATUN_REQUIRED_DISTRICT_ROWS} named districts`,
  satunNamed.length === SATUN_REQUIRED_DISTRICT_ROWS && satunRows.length === SATUN_REQUIRED_DISTRICT_ROWS
    ? []
    : [`พบ ${satunNamed.length}/${satunRows.length} แถวที่ระบุชื่ออำเภอจริง (ต้องการ ${SATUN_REQUIRED_DISTRICT_ROWS})`]
);

// --- Check 3/4: legal & source references present on every row ---
check(
  'No missing legal reference',
  master.filter((r) => isTodo(r.legal_reference)).map((r) => `${r.row_id}: legal_reference ยังเป็น TODO`)
);
check(
  'No missing source reference',
  master.filter((r) => isTodo(r.source_reference)).map((r) => `${r.row_id}: source_reference ยังเป็น TODO`)
);

// --- Check 5: effective dates valid and ordered ---
check(
  'Effective dates valid (start <= end)',
  master.flatMap((r) => {
    const errs = [];
    if (!isDate(r.effective_start_date)) errs.push(`${r.row_id}: effective_start_date ไม่ใช่วันที่ (${r.effective_start_date})`);
    // effective_end_date ว่าง/NULL = open-ended ตามกติกาใน validation pack
    const endIsOpen = r.effective_end_date === '' || /^NULL$/i.test(r.effective_end_date);
    if (!endIsOpen && !isDate(r.effective_end_date)) errs.push(`${r.row_id}: effective_end_date ไม่ใช่วันที่ (${r.effective_end_date})`);
    if (isDate(r.effective_start_date) && isDate(r.effective_end_date) && toUtc(r.effective_start_date) > toUtc(r.effective_end_date))
      errs.push(`${r.row_id}: start > end`);
    return errs;
  })
);

// --- Check 6: duplicate exact periods per province+district+basis ---
const periodKey = (r) => [r.province, r.district, r.basis_type, r.effective_start_date, r.effective_end_date].join('|');
const seenPeriods = new Map();
const dupes = [];
for (const r of master) {
  const k = periodKey(r);
  if (seenPeriods.has(k)) dupes.push(`${r.row_id} ซ้ำกับ ${seenPeriods.get(k)}`);
  else seenPeriods.set(k, r.row_id);
}
check('No duplicate exact periods', dupes);

// --- Check 7: ambiguous overlapping periods per province+district+basis ---
const overlapErrs = [];
const byArea = new Map();
for (const r of master) {
  const k = [r.province, r.district, r.basis_type].join('|');
  if (!byArea.has(k)) byArea.set(k, []);
  byArea.get(k).push(r);
}
for (const rows of byArea.values()) {
  const dated = rows.filter((r) => isDate(r.effective_start_date));
  for (let i = 0; i < dated.length; i++) {
    for (let j = i + 1; j < dated.length; j++) {
      const a = dated[i], b = dated[j];
      const aEnd = isDate(a.effective_end_date) ? toUtc(a.effective_end_date) : Infinity;
      const bEnd = isDate(b.effective_end_date) ? toUtc(b.effective_end_date) : Infinity;
      if (toUtc(a.effective_start_date) <= bEnd && toUtc(b.effective_start_date) <= aEnd)
        overlapErrs.push(`${a.row_id} ซ้อนช่วงกับ ${b.row_id}`);
    }
  }
}
check('No ambiguous active overlap', overlapErrs);

// --- Check 8: emergency decree coverage has real dates ---
const decreeRows = master.filter((r) => r.basis_type === 'EMERGENCY_DECREE');
check(
  'Emergency decree coverage dated',
  decreeRows.length === 0
    ? ['ไม่มีแถว EMERGENCY_DECREE เลย — ถ้าไม่ใช้ต้องระบุเหตุผลใน validation pack']
    : decreeRows.filter((r) => !isDate(r.effective_start_date)).map((r) => `${r.row_id}: effective_start_date ยังเป็น TODO`)
);

// --- Check 9: UAT cases >= 10 with real data ---
const realCases = uat.filter((r) => !isTodo(r.province) && isDate(r.service_start_date) && isDate(r.service_end_date));
check(
  `UAT cases complete (>= ${MIN_UAT_CASES} real cases)`,
  realCases.length >= MIN_UAT_CASES ? [] : [`มี real case ${realCases.length}/${MIN_UAT_CASES}`]
);

// --- Check 10: boundary cases present (clamp start + clamp end) ---
const clampStart = realCases.some((r) => toUtc(r.service_start_date) < toUtc(r.expected_eligible_start_date));
const clampEnd = realCases.some((r) => toUtc(r.service_end_date) > toUtc(r.expected_eligible_end_date));
check('Boundary UAT cases present', [
  ...(clampStart ? [] : ['ไม่มี case ที่เริ่มงานก่อนวันเริ่มประกาศ (clamp start)']),
  ...(clampEnd ? [] : ['ไม่มี case ที่สิ้นสุดงานหลังวันสิ้นสุดประกาศ (clamp end)']),
]);

// --- Check 11: recompute expected values for every real UAT case ---
const calcErrs = [];
for (const r of realCases) {
  const caseErr = (msg) => calcErrs.push(`${r.case_id}: ${msg}`);
  const serviceDays = inclusiveDays(r.service_start_date, r.service_end_date);
  if (serviceDays !== Number(r.expected_service_days))
    caseErr(`service_days คำนวณได้ ${serviceDays} แต่ expected ${r.expected_service_days}`);

  // หา master row ที่ครอบพื้นที่และช่วงเวลา (district-level ก่อน province-level)
  const candidates = master
    .filter((m) => m.province === r.province && isDate(m.effective_start_date))
    .filter((m) => (r.district !== '' ? m.district === r.district : m.district === ''))
    .filter((m) => {
      const mEnd = isDate(m.effective_end_date) ? toUtc(m.effective_end_date) : Infinity;
      return toUtc(r.service_start_date) <= mEnd && toUtc(m.effective_start_date) <= toUtc(r.service_end_date);
    });
  if (candidates.length !== 1) {
    caseErr(`หา master row ที่ match ได้ ${candidates.length} แถว (ต้องได้ 1 แถวเพื่อให้ deterministic)`);
    continue;
  }
  const m = candidates[0];
  const eligibleStart = toUtc(r.service_start_date) > toUtc(m.effective_start_date) ? r.service_start_date : m.effective_start_date;
  const mEndDate = isDate(m.effective_end_date) ? m.effective_end_date : r.service_end_date;
  const eligibleEnd = toUtc(r.service_end_date) < toUtc(mEndDate) ? r.service_end_date : mEndDate;
  if (eligibleStart !== r.expected_eligible_start_date) caseErr(`eligible_start คำนวณได้ ${eligibleStart} expected ${r.expected_eligible_start_date}`);
  if (eligibleEnd !== r.expected_eligible_end_date) caseErr(`eligible_end คำนวณได้ ${eligibleEnd} expected ${r.expected_eligible_end_date}`);

  const eligibleDays = inclusiveDays(eligibleStart, eligibleEnd);
  const effectiveDays = (eligibleDays * MULTIPLIER_PERCENT) / 100;
  const bonusDays = (eligibleDays * (MULTIPLIER_PERCENT - 100)) / 100;
  const net = netBreakdown(effectiveDays);
  if (eligibleDays !== Number(r.expected_eligible_days)) caseErr(`eligible_days คำนวณได้ ${eligibleDays} expected ${r.expected_eligible_days}`);
  if (effectiveDays !== Number(r.expected_effective_days)) caseErr(`effective_days คำนวณได้ ${effectiveDays} expected ${r.expected_effective_days}`);
  if (bonusDays !== Number(r.expected_bonus_days)) caseErr(`bonus_days คำนวณได้ ${bonusDays} expected ${r.expected_bonus_days}`);
  if (net.years !== Number(r.expected_net_years) || net.months !== Number(r.expected_net_months) || net.days !== Number(r.expected_net_days))
    caseErr(`net Y/M/D คำนวณได้ ${net.years}/${net.months}/${net.days} expected ${r.expected_net_years}/${r.expected_net_months}/${r.expected_net_days}`);
}
check('UAT expected values match calculation rules', calcErrs);

// --- Check 12: HR verification fields filled ---
check(
  'All rows verified by HR',
  [
    ...master.filter((r) => isTodo(r.verified_by)).map((r) => `${r.row_id}: verified_by ยังเป็น TODO`),
    ...uat.filter((r) => isTodo(r.verified_by)).map((r) => `${r.case_id}: verified_by ยังเป็น TODO`),
  ]
);

// --- Report ---
console.log('Phase 0 Multiplier Master Data — Validation Report');
console.log(`master rows: ${master.length}, uat rows: ${uat.length} (real: ${realCases.length})`);
console.log('');
let failed = 0;
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'PENDING' ? '⏳' : '❌';
  console.log(`${icon} ${r.status.padEnd(7)} ${r.name}`);
  if (r.status !== 'PASS') {
    failed++;
    for (const d of r.details.slice(0, 5)) console.log(`     - ${d}`);
    if (r.details.length > 5) console.log(`     - ... และอีก ${r.details.length - 5} รายการ`);
  }
}
console.log('');
console.log(failed === 0 ? 'ALL CHECKS PASSED — พร้อมสร้าง database/13-multiplier-time-counting.sql' : `${failed}/${results.length} checks ไม่ผ่าน — ยังห้ามสร้าง migration seed`);
process.exit(failed === 0 ? 0 : 1);
