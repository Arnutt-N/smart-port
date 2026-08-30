import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Review ของ PR #160 (2026-08-30, Important #2): บล็อก tidb ใน ci-local sandbox ถูกข้ามด้วย
// --skip-tidb-bootstrap และ smoke จริงต้องใช้ Docker — จึงไม่มีอะไรกัน "mirror กลับไป inline
// assert SQL", "ชี้ไฟล์ assert ผิด/ลืมอ้าง", หรือ "รายชื่อตารางใน assert SQL เพี้ยนจาก ADR"
// เทสนี้เช็ค invariant เหล่านั้นจากไฟล์ล้วน ๆ (ไม่ยิง Docker) ราคาถูกพอจะอยู่ใน glob
// `node --test scripts/tests/*.test.mjs` เดียวกันทุกทางเข้า (ci-local + pre-push + ci.yml)

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSERT_SQL = resolve(ROOT, 'scripts', 'sql', 'tidb-init-smoke-assert.sql');
const CALLERS = {
  'ci.yml': resolve(ROOT, '.github', 'workflows', 'ci.yml'),
  'ci-local.sh': resolve(ROOT, 'scripts', 'ci-local.sh'),
  'ci-local.ps1': resolve(ROOT, 'scripts', 'ci-local.ps1'),
};
const TIDB_INIT = resolve(ROOT, 'database', 'tidb-init.sql');

// รายชื่อตาราง seed — จาก ADR-0002 ภาคต่อ 2026-08-26 (แหล่งความจริงของขอบเขต assert)
const SEED_TABLES = [
  'personnel',
  'users',
  'organization',
  'position',
  'promotion_criteria',
  'probation_program',
];

// checkout บางส่วน (เช่น workspace จำลอง) ไม่มีไฟล์เหล่านี้ — ข้ามอย่างมีเสียง
const MISSING = Object.values(CALLERS)
  .concat(ASSERT_SQL, TIDB_INIT)
  .filter((p) => !existsSync(p));
const SKIP_REASON =
  MISSING.length > 0
    ? `checkout ไม่ครบ (ไม่มี: ${MISSING.map((p) => resolve(p).split(/[\\/]/).pop()).join(', ')}) — เทสนี้เช็คไฟล์จริงของ repo เท่านั้น`
    : false;

test('ทั้งสาม mirror อ้าง assert SQL ไฟล์เดียว — ห้ามกลับไป inline', { skip: SKIP_REASON }, () => {
  for (const [name, path] of Object.entries(CALLERS)) {
    const text = readFileSync(path, 'utf8');
    assert.ok(
      text.includes('scripts/sql/tidb-init-smoke-assert.sql'),
      `${name} ต้องอ้าง scripts/sql/tidb-init-smoke-assert.sql (ตาม ADR-0002: ไฟล์เดียวใช้ร่วม)`
    );
    assert.ok(
      !text.includes('UNION ALL'),
      `${name} ห้ามมี assert SQL inline (UNION ALL) — แก้ที่ scripts/sql/tidb-init-smoke-assert.sql ไฟล์เดียว`
    );
  }
  // touchpoint ที่ประกาศไว้ในหัว tidb-init.sql ต้องยังชี้มาที่ assert SQL
  assert.ok(
    readFileSync(TIDB_INIT, 'utf8').includes('tidb-init-smoke-assert.sql'),
    'tidb-init.sql ต้องมี NOTE ชี้ touchpoint ไปที่ scripts/sql/tidb-init-smoke-assert.sql'
  );
});

test('assert SQL ครอบตาราง seed ครบ 6 ตารางตาม ADR-0002 — ไม่ขาดไม่เกิน', { skip: SKIP_REASON }, () => {
  const text = readFileSync(ASSERT_SQL, 'utf8');
  for (const table of SEED_TABLES) {
    assert.ok(new RegExp(`FROM ${table}\\b`).test(text), `assert SQL ต้องครอบตาราง ${table}`);
  }
  // บล็อก SUM ต้องมีเครื่องหมาย (COUNT(*) = 0) ครบจำนวนตารางพอดี — เพิ่มตารางใหม่ต้องมาที่นี่ด้วย
  const marks = text.match(/\(COUNT\(\*\) = 0\)/g) ?? [];
  assert.equal(
    marks.length,
    SEED_TABLES.length,
    `บล็อก SUM ต้องมี (COUNT(*) = 0) ครบ ${SEED_TABLES.length} ตาราง (ได้ ${marks.length}) — รายชื่อในไฟล์กับ SEED_TABLES เพี้ยนกัน`
  );
});
