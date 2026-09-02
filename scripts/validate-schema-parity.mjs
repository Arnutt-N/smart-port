#!/usr/bin/env node
// Schema parity gate — กัน schema drift ระหว่างไฟล์ migration กับไฟล์ bootstrap/init ต่าง ๆ
//
// ตรวจ 3 invariant:
//   INV-1  ทุกตาราง/view ที่ migration สร้าง ต้องมีใน database/tidb-init.sql ด้วย
//          (tidb-init.sql คือไฟล์ที่ runbook ใช้ bootstrap TiDB ใหม่ และ production ตั้ง
//           RUN_MIGRATIONS=0 จึงไม่มีกลไกอัตโนมัติมาเติมทีหลัง)
//   INV-2  ทุก migration ต้องถูก mount ใน .github/workflows/ci.yml
//   INV-3  ทุก migration ต้องถูก mount ใน docker-compose.yaml
//          (นักพัฒนาที่รันแค่ `docker compose up -d db` ตามคู่มือ backend/tests/run.sh
//           จะไม่มี backend container มารัน run-migrations.php ให้)
//   INV-4  FK pairs ของตารางที่ยังมีอยู่ต้องตรงกันทั้งสองฝั่ง (migration final state
//          เทียบกับ tidb-init.sql) — FK ของตารางที่ถูก drop พร้อมตาราง (เช่นโดย
//          migration 24) ไม่เทียบ เพราะฝั่ง migration ไม่มี CREATE ของตารางนั้นให้ extract
//
// ไฟล์ที่ชื่อมี test-seed ถูกยกเว้นโดยตั้งใจ — ควบคุมด้วย APPLY_TEST_SEED_MIGRATIONS ผ่าน runner
//
// Usage: node scripts/validate-schema-parity.mjs
// Exit 0 = ไม่มี drift, Exit 1 = พบ drift (รายละเอียดใน output)

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TIDB_INIT = 'database/tidb-init.sql';
const CI_WORKFLOW = '.github/workflows/ci.yml';
const COMPOSE = 'docker-compose.yaml';
const TEST_SEED_MARKER = 'test-seed';

const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

/**
 * แตกเป็นบรรทัดโดยตัดคอมเมนต์ออก — คอมเมนต์ภาษาไทยมักมีคำว่า CREATE TABLE อยู่
 * สแกนทีละบรรทัดแทนทั้งไฟล์ เพื่อเลี่ยง catastrophic backtracking บนไฟล์ขนาดใหญ่
 */
function sqlLines(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/(--|#).*$/, '').trim())
    .filter(Boolean);
}

/**
 * identifier ที่ ALTER TABLE เพิ่มเข้าไป (คอลัมน์ / key / constraint ที่ตั้งชื่อไว้)
 * ใช้เป็นสัญญาณ drift แบบหยาบ — เช็คแค่ว่าชื่อโผล่ใน tidb-init.sql หรือไม่
 * ครอบเคสสำคัญอย่าง org_name_hash ที่ ImportService พึ่ง unique key ในการ upsert
 */
function identifiersAddedByAlter(sql) {
  const found = new Set();
  const patterns = [
    /\bALTER\s+TABLE\s+`?\w+`?\s+ADD\s+COLUMN\s+`?(\w+)`?/i,
    /\bADD\s+(?:UNIQUE\s+)?(?:KEY|INDEX)\s+`?(\w+)`?\s*\(/i,
    /\bADD\s+CONSTRAINT\s+`?(\w+)`?/i,
    /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+`?(\w+)`?/i,
  ];
  for (const line of sqlLines(sql)) {
    for (const re of patterns) {
      const m = re.exec(line);
      if (m) found.add(m[1].toLowerCase());
    }
  }
  return found;
}

/** @returns {{tables: Set<string>, views: Set<string>}} */
function objectsCreatedBy(sql) {
  const tables = new Set();
  const views = new Set();

  const tableRe = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/i;
  const viewRe = /\bVIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/i;

  for (const line of sqlLines(sql)) {
    if (!/\bCREATE\b/i.test(line)) continue;
    const t = tableRe.exec(line);
    if (t) {
      tables.add(t[1].toLowerCase());
      continue;
    }
    // CREATE [OR REPLACE] [ALGORITHM=..] [DEFINER=..] [SQL SECURITY ..] VIEW name
    const v = viewRe.exec(line);
    if (v) views.add(v[1].toLowerCase());
  }

  return { tables, views };
}

/**
 * FK pairs ทั้งหมดในไฟล์ SQL — Set ของ "table|columns|ref_table" (lowercase ทั้งหมด)
 *
 * ต้อง parse ทั้ง FK แบบ inline ใน CREATE TABLE **และ** แบบ
 * `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` — เช่น FK ของ import_log มาจาก
 * 12-import-log-fk.sql (ALTER) ถ้า parse เฉพาะ CREATE TABLE gate จะ false-drift
 *
 * `ALTER TABLE ... DROP FOREIGN KEY <ชื่อ>` ไม่ออกจาก extractor นี้ (ไม่มี REFERENCES
 * ให้จับ) — การ drop ของ migration 22 สะท้อนผ่าน final state: tidb-init.sql ต้อง
 * ไม่มี FK คู่นั้นอีก (INV-4 ฝั่ง init ที่ฝั่ง migration ไม่มี = fail)
 */
function foreignKeyPairs(sql) {
  const fks = new Set();
  const createRe = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/i;
  const alterRe = /\bALTER\s+TABLE\s+`?(\w+)`?/i;
  const fkRe = /\bFOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+`?(\w+)`?/gi;

  // แตก statement ด้วย ';' — INSERT ที่มี ';' ใน string literal อาจแตกผิดชิ้น แต่ชิ้นที่เสีย
  // ไม่มีทั้ง CREATE/ALTER TABLE จึงไม่มีทางถูกนับเป็น FK pair
  for (const stmt of sqlLines(sql).join('\n').split(';')) {
    if (!/\bFOREIGN\s+KEY\b/i.test(stmt)) continue;
    const owner = createRe.exec(stmt) ?? alterRe.exec(stmt);
    if (!owner) continue;
    const table = owner[1].toLowerCase();
    let m;
    fkRe.lastIndex = 0;
    while ((m = fkRe.exec(stmt))) {
      const cols = m[1]
        .split(',')
        .map((c) => c.replace(/[`\s]/g, ''))
        .filter(Boolean)
        .join(',');
      fks.add(`${table}|${cols}|${m[2].toLowerCase()}`);
    }
  }
  return fks;
}

/**
 * ไฟล์ migration ทั้งหมดที่ประกอบกันเป็น schema จริง (repo-relative)
 *
 * อยู่ใน database/ ที่เดียวโดยตั้งใจ — เป็นโฟลเดอร์ที่ image copy ไปเป็น MIGRATIONS_DIR
 * ถ้ามี migration แอบไปอยู่ที่อื่น runner จะไม่เห็นและไม่มีวัน apply (เคยเกิดกับ audit-log)
 */
function migrationFiles() {
  return readdirSync(resolve(ROOT, 'database'))
    .filter((f) => /^\d{2}-.*\.sql$/.test(f))
    .sort()
    .map((f) => `database/${f}`);
}

const failures = [];
const notes = [];

// ---- INV-1: tidb-init.sql ต้องครอบคลุมทุกอ็อบเจกต์ที่ migration สร้าง ------
const migrations = migrationFiles();
const applied = migrations.filter((f) => !basename(f).includes(TEST_SEED_MARKER));

const expected = { tables: new Map(), views: new Map(), altered: new Map() }; // name -> ไฟล์ต้นทาง
for (const rel of applied) {
  const sql = read(rel);
  const { tables, views } = objectsCreatedBy(sql);
  for (const t of tables) if (!expected.tables.has(t)) expected.tables.set(t, rel);
  for (const v of views) if (!expected.views.has(v)) expected.views.set(v, rel);
  for (const id of identifiersAddedByAlter(sql)) if (!expected.altered.has(id)) expected.altered.set(id, rel);
}

const initSql = read(TIDB_INIT);
const initObjects = objectsCreatedBy(initSql);
const initLower = initSql.toLowerCase();

for (const [name, src] of expected.tables) {
  if (!initObjects.tables.has(name)) failures.push(`INV-1 ${TIDB_INIT} ขาดตาราง \`${name}\` (สร้างโดย ${src})`);
}
for (const [name, src] of expected.views) {
  if (!initObjects.views.has(name)) failures.push(`INV-1 ${TIDB_INIT} ขาด view \`${name}\` (สร้างโดย ${src})`);
}
for (const [name, src] of expected.altered) {
  if (!initLower.includes(name)) failures.push(`INV-1b ${TIDB_INIT} ขาด column/key \`${name}\` (เพิ่มโดย ${src})`);
}

// ---- INV-4: FK parity — FK pairs ของตารางที่ยังมีอยู่ต้องตรงกันทั้งสองฝั่ง ----
// ขอบเขตคือ FK คู่ของตารางที่ "ยังมีอยู่" เท่านั้น — ข้าม FK ที่ referencing table
// ไม่มีอยู่ในอีกฝั่ง (dropped-table semantics) เช่น advance_notifications/task_assignments
// ที่ migration 24 drop พร้อมตาราง หรือตาราง root schema (mysql_database_design.sql)
// ที่ไม่ได้อยู่ในชุดสแกน migration
const initFks = foreignKeyPairs(initSql);
const migFks = new Set();
for (const rel of applied) {
  for (const fk of foreignKeyPairs(read(rel))) migFks.add(fk);
}

const relevantMigFks = [...migFks].filter((fk) => initObjects.tables.has(fk.split('|')[0]));
const relevantInitFks = [...initFks].filter((fk) => expected.tables.has(fk.split('|')[0]));

for (const fk of relevantMigFks) {
  if (!initFks.has(fk)) {
    failures.push(`INV-4 ${TIDB_INIT} ขาด FOREIGN KEY ${fk} (ฝั่ง migration มี)`);
  }
}
for (const fk of relevantInitFks) {
  if (!migFks.has(fk)) {
    failures.push(`INV-4 ${TIDB_INIT} มี FOREIGN KEY ${fk} ที่ฝั่ง migration ไม่มี (ถูก drop ไปแล้ว — ลบออกจาก ${TIDB_INIT})`);
  }
}

// ---- INV-2/INV-3: migration ต้องถูก mount ในทั้ง CI และ docker-compose ----
const ci = read(CI_WORKFLOW);
const compose = read(COMPOSE);

for (const rel of applied) {
  const name = basename(rel);
  if (!ci.includes(rel)) failures.push(`INV-2 ${CI_WORKFLOW} ไม่ได้ mount ${rel}`);
  if (!compose.includes(rel)) failures.push(`INV-3 ${COMPOSE} ไม่ได้ mount ${rel}`);
  void name;
}

const seedOnly = migrations.filter((f) => basename(f).includes(TEST_SEED_MARKER));
if (seedOnly.length) {
  notes.push(`ข้าม test-seed migration ${seedOnly.length} ไฟล์ (ควบคุมด้วย APPLY_TEST_SEED_MIGRATIONS): ${seedOnly.join(', ')}`);
}

// ---- รายงานผล --------------------------------------------------------------
console.log(
  `schema parity gate — migration ${applied.length} ไฟล์, ${expected.tables.size} ตาราง, ${expected.views.size} view, ${relevantMigFks.length}/${migFks.size} FK pair (ที่เทียบได้/ทั้งหมดฝั่ง migration)`
);
for (const n of notes) console.log(`  note: ${n}`);

if (failures.length === 0) {
  console.log('OK  ไม่พบ schema drift');
  process.exit(0);
}

console.error(`\nพบ drift ${failures.length} รายการ:`);
for (const f of failures) console.error(`  FAIL  ${f}`);
console.error('\nวิธีแก้: เติม DDL ที่ขาดลง database/tidb-init.sql และ/หรือ เพิ่ม mount ใน ci.yml / docker-compose.yaml');
process.exit(1);
