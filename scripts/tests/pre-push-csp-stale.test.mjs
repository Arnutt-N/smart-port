import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Issue #151 — เมื่อ src ใหม่กว่า frontend/dist pre-push ต้องไม่ audit dist เก่าแล้วขึ้นผ่าน
// ("ไม่รู้" ต้องไม่กลายเป็น "สะอาด") · เลือกทาง skip พร้อมข้อความ "ยังไม่ได้ตรวจ"
// ให้สมมาตรกับเคสไม่มี dist เลย ไม่ใช่ WARN แล้วรัน audit ต่อ

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = resolve(ROOT, '.githooks', 'pre-push');

test('pre-push ข้าม CSP audit เมื่อ src ใหม่กว่า dist — ไม่ audit ของเก่าแล้วขึ้นผ่าน (#151)', () => {
  const hook = readFileSync(HOOK, 'utf8');

  assert.match(
    hook,
    /SKIP\s+csp bundle audit:.*ใหม่กว่า dist/,
    'เมื่อ dist เก่าต้องพิมพ์ SKIP ไม่ใช่ WARN',
  );
  assert.match(
    hook,
    /ยังไม่ได้ตรวจ/,
    'ข้อความ skip ต้องบอกว่ายังไม่ได้ตรวจ bundle ของโค้ดปัจจุบัน',
  );
  assert.doesNotMatch(
    hook,
    /WARN\s+csp bundle audit:.*ใหม่กว่า dist/,
    'ห้าม WARN แล้ว audit dist เก่าต่อ — นั่นคือ false assurance ที่ #151 ถาม',
  );

  const staleIdx = hook.indexOf('STALE_SRC');
  assert.notEqual(staleIdx, -1, 'hook ต้องยังวัดว่า src ใหม่กว่า dist');
  const afterStale = hook.slice(staleIdx);
  const auditCall = afterStale.indexOf('audit-bundle-csp.mjs');
  assert.notEqual(auditCall, -1, 'ยังต้องเรียก audit เมื่อ dist ไม่เก่า');
  const skipIdx = afterStale.indexOf('SKIP  csp bundle audit');
  assert.notEqual(skipIdx, -1);
  assert.ok(
    skipIdx < auditCall,
    'กิ่ง stale ต้อง SKIP ก่อน — ห้ามไหลไปเรียก audit-bundle-csp.mjs',
  );
  assert.match(
    afterStale.slice(skipIdx, auditCall),
    /\belse\b/,
    'audit ต้องอยู่ใน else ของกิ่ง stale ไม่ใช่รันต่อหลัง WARN',
  );
});
