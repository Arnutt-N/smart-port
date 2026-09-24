import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { checkBaselineCurrent, checkFilePin, foreignKeyPairs, sha256Normalized, TEST_SEED_MARKER } from '../validate-schema-parity.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('checkBaselineCurrent: baseline ตรง max → null', () => {
  assert.equal(
    checkBaselineCurrent(['30-x.sql', '32-rename-servant-id.sql'], '32-rename-servant-id.sql'),
    null
  );
});

test('checkBaselineCurrent: baseline เก่ากว่า max → string มี INV-5', () => {
  const msg = checkBaselineCurrent(['30-x.sql', '32-rename-servant-id.sql'], '30-x.sql');
  assert.match(msg, /INV-5/);
  assert.match(msg, /MIGRATION_BASELINE_THROUGH/);
});

test('checkBaselineCurrent: seed ชื่อ sort สูงกว่า baseline ต้องถูกกรอง', () => {
  assert.equal(TEST_SEED_MARKER, 'test-seed');
  assert.equal(
    checkBaselineCurrent(['32-y.sql', '33-z-test-seed-q.sql'], '32-y.sql'),
    null
  );
});

test('checkBaselineCurrent: ไม่มี migration เลย → fail-closed', () => {
  assert.match(checkBaselineCurrent([], '32-y.sql'), /INV-5/);
});

test('checkFilePin: hash ตรง → null', () => {
  assert.equal(checkFilePin('x.sql', 'ab', 'ab'), null);
});

test('checkFilePin: hash เบี่ยง → string มี INV-6', () => {
  const msg = checkFilePin('x.sql', 'ab', 'cd');
  assert.match(msg, /INV-6/);
  assert.match(msg, /tidb-init\.sql/);
});

test('sha256Normalized: CRLF กับ LF ได้ hash เดียวกัน', () => {
  const a = sha256Normalized('a\r\nb');
  assert.equal(a, sha256Normalized('a\nb'));
  assert.equal(a.length, 64);
});

test('gate smoke: รันตรง exit 0 บน tree สะอาด', () => {
  const r = spawnSync(
    process.execPath,
    [resolve(ROOT, 'scripts/validate-schema-parity.mjs')],
    { encoding: 'utf8' }
  );
  assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.match(r.stdout, /ไม่พบ schema drift/);
});

test('count-lock: จำนวน FK pairs ฝั่ง migration ตรง pin (T-D4.2)', () => {
  // 42 คู่ถึง migration 34 (41 ตอน findings + password_history 1) + 8 คู่จาก 35 —
  // เพิ่ม/ลด FK ครั้งหน้าต้องอัปเดตเลขนี้พร้อมเหตุผล (กันเงียบ)
  const EXPECTED_FK_PAIRS = 50;
  const files = readdirSync(resolve(ROOT, 'database'))
    .filter((f) => /^\d{2}-.*\.sql$/.test(f) && !f.includes(TEST_SEED_MARKER));
  const pairs = new Set();
  for (const f of files) {
    for (const p of foreignKeyPairs(readFileSync(resolve(ROOT, 'database', f), 'utf8'))) {
      pairs.add(p);
    }
  }
  assert.equal(pairs.size, EXPECTED_FK_PAIRS, [...pairs].sort().join('\n'));
});
