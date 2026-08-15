import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VALIDATOR = resolve(ROOT, 'scripts', 'validate-multiplier-phase0.mjs');

test('TEST_SEED fixtures remain synthetic-only and blocked from production readiness', () => {
  const result = spawnSync(process.execPath, [VALIDATOR], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, output);
  assert.match(output, /TECHNICAL CHECKS PASSED — SYNTHETIC_ONLY/);
  assert.match(output, /ยังห้ามสร้าง migration seed/);
  assert.match(output, /ยังไม่พร้อม director review/);
  assert.doesNotMatch(output, /ALL CHECKS PASSED/);
  assert.doesNotMatch(output, /All rows verified by HR/i);
  assert.doesNotMatch(output, /\breal\s*:\s*\d+/i);
});
