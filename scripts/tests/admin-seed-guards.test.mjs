import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Guard แบบ static ของ seed admin — คู่กับเทสพฤติกรรมใน
// backend/tests/Integration/AdminSeedUpsertTest.php
//
// ทำไมอยู่ที่นี่ ไม่ใช่ใน PHPUnit: เทสชุดนี้อ่านไฟล์ทั่ว repo (รวม docs/) ซึ่งไม่ได้
// ถูก mount เข้า container ของ backend/tests/run.sh (mount แค่ /app กับ /database)
// และที่สำคัญกว่านั้น — ใน PHPUnit เทสทั้งคลาสถูก skip เมื่อต่อ MySQL ไม่ได้
// ทำให้ guard หายเงียบบนเครื่องที่ไม่มี Docker ซึ่งคือรูปแบบที่โปรเจกต์นี้ห้าม:
// สภาพ "ไม่ได้ตรวจ" ต้องไม่แสดงผลเป็น "ผ่าน"
//
// ที่นี่ไม่ต้องพึ่ง DB เลย จึงรันได้เสมอทั้งใน pre-push, ci-local และ CI

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION_FILE = resolve(ROOT, 'database', '09-auth-users.sql');
const TIDB_INIT_FILE = resolve(ROOT, 'database', 'tidb-init.sql');
const DOCS_DIR = resolve(ROOT, 'docs');

// host ของ backend production — ใช้คัดว่าเอกสารไหน "ชี้ไปที่ระบบจริง"
const PRODUCTION_HOST = 'smartport-backend.onrender.com';

// เอกสารที่รู้แน่ว่าต้องติดตัวกรองเสมอ — ใช้พิสูจน์ว่าตัวกรองยังทำงาน
// (แค่ "เจอมากกว่าศูนย์ไฟล์" ยังหลอกได้ ถ้าเอกสาร production ตัวจริงหลุดจากการสแกน
//  แล้วบังเอิญมีไฟล์เก่าค้าง host ไว้แทน)
const REQUIRED_PRODUCTION_DOC = 'docs/render-tidb-production.md';

// ประกอบสตริงเพื่อไม่ให้ค่าปรากฏเป็นคำเดียวในไฟล์เทสเอง
const BOOTSTRAP_PASSWORD = 'admin' + '123';

const SEED_BLOCK =
  /INSERT INTO users \(username, password_hash.*?VALUES \('admin', '([^']+)'.*?ON DUPLICATE KEY UPDATE(.*?);/s;

// รูปคำสั่งที่ต้องเป็น (เทียบกับ clause ที่ normalize แล้ว — ช่องว่างถูกยุบเหลือช่องเดียว)
//
// ห้ามเช็คด้วย includes() ของชิ้นส่วนเงื่อนไข: ข้อความ
// "users.password_hash IS NULL OR users.password_hash" โผล่บนบรรทัด
// must_change_password ด้วย การเช็คแบบนั้นจึงผ่านทั้งที่บรรทัด password_hash
// กลับไปเขียนทับเสมอแล้ว — เป็น false-clean ที่ mutation test จับได้
const GUARDED_PASSWORD_HASH =
  /password_hash = IF\(users\.password_hash IS NULL OR users\.password_hash = '', VALUES\(password_hash\), users\.password_hash\)/;
const GUARDED_MUST_CHANGE =
  /must_change_password = IF\(users\.password_hash IS NULL OR users\.password_hash = '', VALUES\(must_change_password\), users\.must_change_password\)/;

// รูปที่เป็นบั๊กเดิมตรง ๆ — ถ้าเจอแปลว่ารัน migration ซ้ำจะรีเซ็ตรหัสผ่าน production
const UNGUARDED_PASSWORD_HASH = /password_hash = VALUES\(password_hash\)/;

/** อ่านไฟล์แล้วคืนค่าเป็น LF เสมอ (ไฟล์ในโปรเจกต์เป็น CRLF) */
function readText(path) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

/** ดึง hash และ clause ของ seed admin ออกจากไฟล์ .sql จริง */
function extractSeedBlock(path) {
  const matched = SEED_BLOCK.exec(readText(path));
  assert.ok(matched, `หา seed admin ใน ${relative(ROOT, path)} ไม่เจอ — โครงไฟล์เปลี่ยนไป`);

  return { hash: matched[1], clause: matched[2] };
}

/** ตัดคอมเมนต์ SQL ออกแล้วยุบช่องว่าง เพื่อเทียบเนื้อคำสั่งล้วน ๆ */
function normalizeClause(clause) {
  return clause.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
}

/** ไฟล์ .md ทั้งหมดใต้ docs/ (recursive) */
function listMarkdownFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listMarkdownFiles(full));
    } else if (extname(entry) === '.md') {
      found.push(full);
    }
  }

  return found;
}

test('seed clause ของ migration กับ tidb-init ต้องตรงกัน', () => {
  const migration = normalizeClause(extractSeedBlock(MIGRATION_FILE).clause);
  const tidbInit = normalizeClause(extractSeedBlock(TIDB_INIT_FILE).clause);

  // tidb-init.sql คือ bootstrap ตัวจริงของ production (prod ตั้ง RUN_MIGRATIONS=0)
  // ถ้า clause ไม่ตรงกัน แปลว่าแก้ migration ไปแล้วไม่มีผลกับ production
  assert.equal(tidbInit, migration, 'clause ใน tidb-init.sql ไม่ตรงกับ 09-auth-users.sql');
});

test('password_hash ต้องถูก guard ไม่ใช่เขียนทับเสมอ', () => {
  for (const path of [MIGRATION_FILE, TIDB_INIT_FILE]) {
    const rel = relative(ROOT, path);
    const clause = normalizeClause(extractSeedBlock(path).clause);

    assert.ok(
      !UNGUARDED_PASSWORD_HASH.test(clause),
      `${rel}: password_hash กลับไปเขียนทับเสมอแล้ว — รัน migration ซ้ำจะรีเซ็ตรหัสผ่าน production`
    );
    assert.match(clause, GUARDED_PASSWORD_HASH, `${rel}: password_hash ไม่ได้อยู่ในรูปที่ guard ไว้`);
    assert.match(clause, GUARDED_MUST_CHANGE, `${rel}: must_change_password ไม่ได้อยู่ในรูปที่ guard ไว้`);
  }
});

test('must_change_password ต้องถูกประเมินก่อน password_hash', () => {
  // MySQL/TiDB ประเมิน assignment เรียงซ้ายไปขวา ถ้า password_hash มาก่อน
  // เงื่อนไขของ must_change_password จะอ่านค่าที่เขียนทับไปแล้วและเป็นเท็จเสมอ
  for (const path of [MIGRATION_FILE, TIDB_INIT_FILE]) {
    const rel = relative(ROOT, path);
    const clause = normalizeClause(extractSeedBlock(path).clause);
    const flagAt = clause.search(GUARDED_MUST_CHANGE);
    const hashAt = clause.search(GUARDED_PASSWORD_HASH);

    assert.ok(flagAt >= 0 && hashAt >= 0, `${rel}: หา assignment ที่ guard ไว้ไม่เจอ`);
    assert.ok(
      flagAt < hashAt,
      `${rel}: ลำดับสลับ — must_change_password ต้องอยู่ก่อน password_hash`
    );
  }
});

test('hash ของ seed ต้องตรงกันทั้งสองไฟล์', () => {
  // ถ้ามีคนแก้ค่าใน VALUES ของไฟล์เดียว local กับ production จะได้คนละรหัส
  assert.equal(
    extractSeedBlock(TIDB_INIT_FILE).hash,
    extractSeedBlock(MIGRATION_FILE).hash,
    'seed hash ใน tidb-init.sql ไม่ตรงกับ 09-auth-users.sql'
  );
});

test('ไฟล์ที่ bootstrap production และเอกสารที่ชี้ไประบบจริง ต้องไม่มีรหัสผ่าน plaintext', () => {
  // ขอบเขตโดยตั้งใจ: ไฟล์ที่ bootstrap production + เอกสารใน docs/ ที่อ้าง host production
  //
  // สิ่งที่เทสนี้ "ไม่" รับประกัน — พูดให้ชัดเพื่อไม่ให้ใครอ่านแล้วเข้าใจว่า repo สะอาด:
  //   - เอกสารใต้ docs/ ที่ไม่มี host production ยังมีรหัสผ่านนี้เป็น plaintext อยู่จริง
  //     (แผนงานย้อนหลังใต้ docs/superpowers/plans/) เทสนี้จงใจไม่แตะ
  //   - fixture ของ dev/e2e (frontend/e2e/helpers/auth.js, backend/tests/verify-executive.sh),
  //     สคริปต์ UAT ที่ default ชี้ localhost, บันทึกใน project-log-md/ และ .claude/
  //   - git history ซึ่งลบไม่ได้อยู่แล้ว
  //
  // เส้นที่ต้องกันคือ "อย่าแจกรหัสที่ใช้กับ production ได้" ไม่ใช่ "ห้ามมีคำนี้ใน repo"
  // ซึ่งเป็นไปไม่ได้ — dev credential ที่รู้กันทั้งทีมเป็นเรื่องปกติ
  const scanned = listMarkdownFiles(DOCS_DIR)
    .map((path) => ({ path, text: readText(path) }))
    .filter((doc) => doc.text.includes(PRODUCTION_HOST));

  // fail-closed: ยึดกับเอกสารที่รู้ว่าต้องเจอ ไม่ใช่แค่ "เจอมากกว่าศูนย์"
  const relativePaths = scanned.map((doc) => relative(ROOT, doc.path).replace(/\\/g, '/'));
  assert.ok(
    relativePaths.includes(REQUIRED_PRODUCTION_DOC),
    `ตัวกรองไม่เจอ ${REQUIRED_PRODUCTION_DOC} — สแกนได้ ${relativePaths.length} ไฟล์: ` +
      `${relativePaths.join(', ') || '(ไม่มีเลย)'} · ถือว่าตัวกรองพัง ไม่ใช่ "สะอาด"`
  );

  const bootstrapFiles = [MIGRATION_FILE, TIDB_INIT_FILE].map((path) => ({
    path,
    text: readText(path),
  }));
  for (const { path, text } of [...bootstrapFiles, ...scanned]) {
    assert.ok(
      !text.includes(BOOTSTRAP_PASSWORD),
      `${relative(ROOT, path)}: มีรหัสผ่าน bootstrap เป็น plaintext อยู่ในไฟล์ที่เกี่ยวกับ production`
    );
  }
});
