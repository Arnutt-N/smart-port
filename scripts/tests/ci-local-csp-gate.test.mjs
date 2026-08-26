import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Issue #113 (review รอบที่ 9, M1) — regression ของ **ตัว wrapper เอง** ซึ่งไม่เคยมีเทสเลย
//
// สิ่งที่ชุดนี้ปกป้อง: บรรทัด `OK  csp bundle audit` ต้องแปลว่า "ตรวจ bundle ของโค้ดปัจจุบัน
// แล้วไม่เจอ" เท่านั้น · ของเดิมผูกบล็อก 1.5 กับ **การมีอยู่ของ dist** อย่างเดียว พอ build ล้ม
// (ถูก catch ไว้แล้วไหลต่อ) dist ของรอบก่อนยังอยู่ audit จึงรันแล้วขึ้น OK — ตรวจของเก่า
// แล้วรายงานว่าปัจจุบันสะอาด ซึ่งคือ failure mode ที่ทั้ง PR นี้มีไว้กันพอดี
//
// เทสรัน wrapper จริงใน workspace จำลอง: npm/npx ถูก shim ด้วย stub (ไม่มี network ไม่มี vite)
// และ audit ถูกแทนด้วย stub ที่บันทึกว่าตัวเองถูกเรียกกี่ครั้ง — เราตรวจ "ถูกเรียกไหม" ไม่ใช่
// "ผลลัพธ์ audit คืออะไร" ซึ่งเป็นหน้าที่ของ audit-bundle-csp.test.mjs

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SH = resolve(ROOT, 'scripts', 'ci-local.sh');
const PS1 = resolve(ROOT, 'scripts', 'ci-local.ps1');

/**
 * bash ที่รัน script ของ repo นี้ได้จริง
 *
 * บน Windows ต้อง **ไม่ใช่ WSL** (`System32\bash.exe`) เพราะ WSL มองไม่เห็น path แบบ `D:\…`
 * ที่ทั้งเทสและ wrapper ใช้ · ไล่ candidate ของ Git for Windows ก่อน แล้วค่อยดู PATH
 * (scoop/winget ติดตั้งไว้คนละที่) — ตรรกะเดียวกับ `Resolve-GitBash` ใน ci-local.ps1
 */
function resolveBash() {
  if (process.platform !== 'win32') return 'bash';
  const candidates = [
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Git', 'bin', 'bash.exe'),
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  ];
  const found = candidates.find((c) => c && existsSync(c));
  if (found) return found;
  const where = spawnSync('where.exe', ['bash'], { encoding: 'utf8' });
  return (
    (where.stdout ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .find((p) => !/\\System32\\bash\.exe$/i.test(p)) ?? null
  );
}

/** PowerShell ที่รันไฟล์ .ps1 ได้ — pwsh (7+) ก่อน แล้วค่อย Windows PowerShell */
function resolvePwsh() {
  for (const exe of ['pwsh', 'powershell']) {
    const probe = spawnSync(exe, ['-NoProfile', '-Command', 'exit 0'], { encoding: 'utf8' });
    if (!probe.error && probe.status === 0) return exe;
  }
  return null;
}

const BASH = resolveBash();
const PWSH = resolvePwsh();

/**
 * ทางเข้าของ wrapper แต่ละตัว — วิธีเรียกและเหตุผลที่ข้ามอยู่ที่เดียวกัน
 *
 * ของเดิมแตกกิ่ง `shell === 'bash'` ไว้สองที่ (ตอนหาเหตุผลข้าม และตอนประกอบคำสั่ง) ซึ่งเพี้ยน
 * ออกจากกันได้เงียบ ๆ · ตารางนี้ทำให้การเพิ่ม wrapper ตัวที่สามเป็นการเติมรายการเดียว
 *
 * `unavailable` = ข้อความบอกเหตุผล (ข้ามเทส) หรือ `false` เมื่อรันได้ — **ข้ามอย่างมีเสียงเสมอ**
 * ci-local.ps1 เป็นทางเข้าฝั่ง Windows โดยตั้งใจ: ทั้งไฟล์ใช้ path แบบ `frontend\dist` และไล่หา
 * Git Bash จาก `LOCALAPPDATA\Programs\Git` · pwsh มีบน ubuntu runner ก็จริง แต่ที่นั่น backslash
 * เป็นตัวอักษรในชื่อไฟล์ ไม่ใช่ตัวคั่น การรันจึงวัดอะไรไม่ได้นอกจากความต่างของ OS — ฝั่งนี้ถูก
 * บังคับรันจริงทุกครั้งที่ pre-push บนเครื่อง Windows ซึ่งเป็นที่เดียวที่มันมีความหมาย
 */
const WRAPPERS = {
  bash: {
    command: BASH,
    unavailable: BASH === null ? 'ไม่พบ bash ที่ใช้ path แบบ Windows ได้ (WSL ใช้ไม่ได้)' : false,
    // path สัมพัทธ์ทั้งสองฝั่ง — resolve จาก `cwd` ที่ตั้งไว้เป็น workspace อยู่แล้ว จึงไม่ต้อง
    // ส่ง `dir` เข้ามา (ของเดิมฝั่ง bash รับไว้แล้วไม่ใช้ = พารามิเตอร์ตายในตารางที่ตั้งใจให้
    // เป็นแหล่งความจริงเดียว) · วัดแล้วว่า `pwsh -File scripts/ci-local.ps1` resolve จาก cwd ได้
    args: (skipFrontend) => [
      'scripts/ci-local.sh',
      '--skip-install',
      '--skip-e2e',
      '--skip-backend',
      '--skip-docker',
      // sandbox มีเฉพาะ scripts/ ไม่มี database/tidb-init.sql — ข้าม step bootstrap
      '--skip-tidb-bootstrap',
      ...(skipFrontend ? ['--skip-frontend'] : []),
    ],
  },
  pwsh: {
    command: PWSH,
    unavailable:
      process.platform !== 'win32'
        ? 'ci-local.ps1 เป็น wrapper ฝั่ง Windows (path แบบ `\\`) — ตรวจบนเครื่อง Windows ผ่าน pre-push แทน'
        : PWSH === null
          ? 'ไม่พบ pwsh/powershell บนเครื่องนี้'
          : false,
    args: (skipFrontend) => [
      '-NoProfile',
      '-File',
      'scripts/ci-local.ps1',
      '-SkipInstall',
      '-SkipE2E',
      '-SkipBackend',
      '-SkipDocker',
      // sandbox มีเฉพาะ scripts/ ไม่มี database/tidb-init.sql — ข้าม step bootstrap
      '-SkipTidbBootstrap',
      ...(skipFrontend ? ['-SkipFrontend'] : []),
    ],
  },
};

/**
 * stub ของ `npm` / `npx` — บันทึกทุกการเรียกลง `cli-calls.log` แล้วจบด้วย exit 0
 * (`npm … build` จบด้วย 1 เมื่อ `FIXTURE_BUILD_FAILS=1` เพื่อจำลอง build ล้ม)
 *
 * `node` **ไม่ถูก shim** — เคยลองแล้ววัดได้ว่าไม่คุ้ม: บน Windows การ spawn shell script
 * ผ่าน MSYS แพงพอ ๆ กับ `node.exe` เอง (ทั้งชุดช้าลงจาก 2m0s เป็น 2m17s) แลกกับการเสีย
 * ความสมจริงไปเปล่า ๆ · shebang เป็น `/bin/sh` ไม่ใช่ `/usr/bin/env bash` เพื่อไม่ต้อง
 * spawn `env` เพิ่มอีกตัวต่อการเรียกหนึ่งครั้ง
 */
const CLI_SHIM = [
  '#!/bin/sh',
  'printf "%s\\n" "$(basename "$0") $*" >> "$(dirname "$0")/../cli-calls.log"',
  'if [ "${FIXTURE_TEST_FAILS:-0}" = "1" ]; then',
  '  case "$(basename "$0") $*" in npx*vitest*) exit 1 ;; esac',
  'fi',
  'if [ "${FIXTURE_BUILD_FAILS:-0}" = "1" ]; then',
  '  case "$(basename "$0") $*" in npm*build*) exit 1 ;; esac',
  'fi',
  'exit 0',
  '',
].join('\n');

/** stub เดียวกันสำหรับ PowerShell ซึ่ง resolve คำสั่งผ่าน PATHEXT (ต้องมีนามสกุล .cmd) */
const CLI_SHIM_CMD = [
  '@echo off',
  '>>"%~dp0..\\cli-calls.log" echo %~n0 %*',
  'if not "%FIXTURE_TEST_FAILS%"=="1" goto :buildcheck',
  'if /i not "%~n0"=="npx" goto :buildcheck',
  'echo %*| findstr /C:"vitest" >nul',
  'if not errorlevel 1 exit /b 1',
  ':buildcheck',
  'if not "%FIXTURE_BUILD_FAILS%"=="1" exit /b 0',
  'if /i not "%~n0"=="npm" exit /b 0',
  'echo %*| findstr /C:"build" >nul',
  'if errorlevel 1 exit /b 0',
  'exit /b 1',
  '',
].join('\r\n');

const SHIMMED_COMMANDS = ['npm', 'npx'];

/**
 * stub ของ audit — บันทึก **argv จริงที่ถูกเรียกด้วย** ไม่ใช่สตริงคงที่
 *
 * ถ้าเขียนค่าตายตัว log จะพิสูจน์ได้แค่ว่า "สคริปต์ถูกรัน" แต่บอกไม่ได้ว่า wrapper เรียกด้วย
 * path อะไร ซึ่งไม่ตรงกับที่ `auditRunCount()` โฆษณาว่านับจากคำสั่งที่ถูกเรียก
 */
const AUDIT_STUB = [
  "import { appendFileSync } from 'node:fs';",
  "import { dirname, resolve } from 'node:path';",
  "import { fileURLToPath } from 'node:url';",
  'const here = dirname(fileURLToPath(import.meta.url));',
  "appendFileSync(resolve(here, '..', 'cli-calls.log'), `node ${process.argv.slice(1).join(' ')}\\n`);",
  '',
].join('\n');

/**
 * workspace จำลองที่มีเฉพาะสิ่งที่ wrapper แตะจริง
 *
 * `ROOT` ของ wrapper ผูกกับตำแหน่งไฟล์ตัวเอง (`$PSScriptRoot/..`, `BASH_SOURCE/..`) จึง
 * override ด้วย env ไม่ได้ — ต้อง copy ตัว wrapper ไปไว้ในโครงสร้างจำลองแทน
 */
function makeWorkspace({ dist }) {
  const dir = mkdtempSync(join(tmpdir(), 'ci-local-gate-'));
  mkdirSync(join(dir, 'scripts', 'tests'), { recursive: true });
  mkdirSync(join(dir, 'bin'), { recursive: true });
  mkdirSync(join(dir, 'frontend'), { recursive: true });

  copyFileSync(SH, join(dir, 'scripts', 'ci-local.sh'));
  copyFileSync(PS1, join(dir, 'scripts', 'ci-local.ps1'));
  writeFileSync(join(dir, 'scripts', 'validate-schema-parity.mjs'), '// stub: parity ผ่านเสมอ\n');
  writeFileSync(join(dir, 'scripts', 'audit-bundle-csp.mjs'), AUDIT_STUB);
  writeFileSync(
    join(dir, 'scripts', 'tests', 'stub.test.mjs'),
    "import test from 'node:test';\ntest('stub regression', () => {});\n",
  );

  for (const name of SHIMMED_COMMANDS) {
    const shim = join(dir, 'bin', name);
    writeFileSync(shim, CLI_SHIM);
    // จำเป็นบน POSIX: `writeFileSync` ให้ mode 644 ซึ่ง PATH lookup ข้ามไปเลย แล้ว shell จะ
    // เดินไปเจอ npm/npx **ตัวจริง** แทน — เทสจะไม่พังตรง ๆ แต่ไปยิง registry ในโฟลเดอร์ fixture
    // (วัดบน Linux แล้ว: mode 644 → `command -v npm` หา shim ไม่เจอ) · บน Windows แทบไม่มีผล
    // เพราะ MSYS ถือว่าไฟล์ที่ขึ้นต้นด้วย `#!` เป็น executable อยู่แล้ว ซึ่งคือเหตุที่มันเขียว
    // บนเครื่อง dev แต่จะแดงบน CI — คลาสเดียวกับที่ทั้ง PR นี้มีไว้กัน
    chmodSync(shim, 0o755);
    writeFileSync(join(dir, 'bin', `${name}.cmd`), CLI_SHIM_CMD);
  }
  writeFileSync(join(dir, 'frontend', 'package.json'), '{"name":"fixture","private":true}\n');
  if (dist) {
    mkdirSync(join(dir, 'frontend', 'dist'), { recursive: true });
    writeFileSync(join(dir, 'frontend', 'dist', 'index.html'), '<!doctype html><html></html>\n');
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * จำนวนครั้งที่ wrapper สั่งรัน audit จริง — นับจาก **คำสั่งที่ถูกเรียก** ไม่ใช่ข้อความที่พิมพ์
 * ออกมา เพราะข้อความจะโกหกได้ (นั่นคือบั๊กที่เทสชุดนี้มีไว้จับ) แต่ call log โกหกไม่ได้
 */
function auditRunCount(dir) {
  const log = join(dir, 'cli-calls.log');
  if (!existsSync(log)) return 0;
  return readFileSync(log, 'utf8')
    .split('\n')
    .filter((line) => /^node\b.*audit-bundle-csp\.mjs/.test(line.trim())).length;
}

/**
 * รัน wrapper ตัวใดตัวหนึ่ง — คืน stdout+stderr รวมกันและ exit code
 *
 * เป็น async (ไม่ใช่ `spawnSync`) เพราะเคสทั้งหมดเป็นการ **รอ process** ไม่ใช่งาน CPU
 * — รันขนานกันได้ และ `spawnSync` จะบล็อก event loop จนความขนานที่ตั้งไว้ไม่เกิดขึ้นจริง
 */
function runWrapper(shell, dir, { skipFrontend = false, buildFails = false, testsFail = false } = {}) {
  const binDir = join(dir, 'bin');
  const env = {
    ...process.env,
    PATH: binDir + delimiter + (process.env.PATH ?? ''),
    Path: binDir + delimiter + (process.env.Path ?? process.env.PATH ?? ''),
    FIXTURE_BUILD_FAILS: buildFails ? '1' : '0',
    FIXTURE_TEST_FAILS: testsFail ? '1' : '0',
  };
  // timeout กว้างโดยตั้งใจ: วัดจริงบนเครื่อง dev แล้วเคสหนึ่งใช้ถึง 74s ตอนสี่เคสแย่ง I/O กัน
  // (และตัวเลขรวมแกว่ง 2m0s–2m39s ระหว่างรอบตามภาระเครื่อง) · 180s เดิมเหลือ headroom แค่เท่าตัว
  // ซึ่งไม่พอ — เทสที่แดงแบบสุ่มใน pre-push จะสอนให้คนใช้ `--no-verify` เป็นนิสัย แล้ว gate ก็ตาย
  // แบบเดียวกับที่ทั้ง PR นี้มีไว้กัน · ยังจับ hang ได้อยู่ เพราะเคสปกติไม่เคยแตะครึ่งของ 300s
  const options = { cwd: dir, env, encoding: 'utf8', timeout: 300_000, maxBuffer: 8 * 1024 * 1024 };

  const { command, args } = WRAPPERS[shell];

  return new Promise((resolvePromise, rejectPromise) => {
    execFile(command, args(skipFrontend), options, (error, stdout, stderr) => {
      // exit code ที่ไม่ใช่ 0 มาถึงทาง `error` — เป็นผลลัพธ์ที่เทสหลายเคสรอดูอยู่ ไม่ใช่ความผิดพลาด
      // ส่วนที่ spawn ไม่ติด (ENOENT) หรือ timeout ต้องดังออกมา ไม่ใช่ถูกอ่านว่า "exit 1"
      if (error && typeof error.code !== 'number') {
        rejectPromise(new Error(`รัน ${shell} ไม่สำเร็จ: ${error.message}`));
        return;
      }
      resolvePromise({ out: `${stdout ?? ''}${stderr ?? ''}`, status: error ? error.code : 0 });
    });
  });
}

/**
 * เคสเดียวกันต้องให้ผลเหมือนกันทั้งสอง wrapper — คนละคนใช้คนละตัว ความต่างจึงกลายเป็น
 * "เครื่องฉันเขียว" ได้เงียบ ๆ · marker ที่ตรวจเป็น ASCII ล้วนเพื่อไม่ให้ code page ของ
 * Windows console ทำให้เทสแกว่งไปตามภาษาในข้อความ
 */

// รันขนานกัน: ทุกเคสสร้าง workspace ของตัวเองและไม่แชร์ state — แบบ sequential ใช้เวลา
// ~2m40s ซึ่งแพงเกินไปสำหรับ gate ที่ pre-push บังคับรันทุกครั้ง
describe('ci-local — บล็อก CSP bundle audit', { concurrency: 4 }, () => {
  for (const [shell, wrapper] of Object.entries(WRAPPERS)) {
    const skipReason = wrapper.unavailable;

    test(`[${shell}] build ล้ม + dist เก่ายังอยู่ → ต้องไม่รัน audit และต้อง FAIL`, { skip: skipReason }, async () => {
      const { dir, cleanup } = makeWorkspace({ dist: true });
      try {
        const { out, status } = await runWrapper(shell, dir, { buildFails: true });
        assert.doesNotMatch(out, /OK\s+csp bundle audit/, 'build ล้มแล้วห้ามรายงานว่า audit ผ่าน');
        assert.match(out, /FAIL\s+csp bundle audit/, 'ต้องบอกตรง ๆ ว่า gate นี้ตรวจไม่ได้');
        assert.equal(auditRunCount(dir), 0, 'ห้ามเอา dist ของ build เก่ามาตรวจแทน');
        assert.notEqual(status, 0, 'สรุปรวมต้องแดง');
      } finally {
        cleanup();
      }
    });

    test(`[${shell}] vitest ตกแต่ build ผ่าน → ต้องไม่รายงานว่า audit ผ่าน`, { skip: skipReason }, async () => {
      // ช่องที่เทสชุดแรกมองไม่เห็น: stub ล้มเฉพาะ `npm … build` จึงไม่มีเคสไหนเดินผ่านเส้นทาง
      // "คำสั่งกลาง ๆ ล้มแต่คำสั่งสุดท้ายผ่าน" ซึ่งเป็นเส้นทางที่ `set -e` ใน subshell ของ `if`
      // ไม่ทำงาน — ci-local.sh เคยรายงาน `OK  frontend test + build` ทั้งที่ vitest ตก
      // dist ที่ build จากโค้ดที่เทสไม่ผ่านก็เชื่อไม่ได้เท่ากับ dist ที่ build ไม่ออก
      const { dir, cleanup } = makeWorkspace({ dist: true });
      try {
        const { out, status } = await runWrapper(shell, dir, { testsFail: true });
        assert.doesNotMatch(out, /OK\s+csp bundle audit/, 'เทสตกแล้วห้ามรายงานว่า audit ผ่าน');
        assert.doesNotMatch(out, /OK\s+frontend test \+ build/, 'vitest ตก จะบอกว่าขั้น frontend ผ่านไม่ได้');
        assert.equal(auditRunCount(dir), 0, 'ห้ามตรวจ dist ที่มาจากโค้ดซึ่งเทสไม่ผ่าน');
        assert.notEqual(status, 0, 'สรุปรวมต้องแดง');
      } finally {
        cleanup();
      }
    });

    test(`[${shell}] build สำเร็จ + มี dist → audit ต้องรันและผ่าน`, { skip: skipReason }, async () => {
      const { dir, cleanup } = makeWorkspace({ dist: true });
      try {
        const { out, status } = await runWrapper(shell, dir);
        assert.match(out, /OK\s+csp bundle audit/);
        assert.equal(auditRunCount(dir), 1, 'audit ต้องถูกเรียกครั้งเดียว');
        assert.equal(status, 0, out);
      } finally {
        cleanup();
      }
    });

    test(`[${shell}] สั่งข้าม build + มี dist → audit รันได้ แต่ต้องเตือนว่าเป็น build เก่า`, { skip: skipReason }, async () => {
      const { dir, cleanup } = makeWorkspace({ dist: true });
      try {
        const { out, status } = await runWrapper(shell, dir, { skipFrontend: true });
        assert.equal(auditRunCount(dir), 1, 'มี dist ให้ตรวจก็ควรตรวจ — "ไม่รู้" ไม่ควรกลายเป็น "สะอาด"');
        assert.match(out, /WARN\s+csp bundle audit/, 'ต้องเตือนว่า dist อาจไม่ตรงกับโค้ดปัจจุบัน');
        assert.equal(status, 0, out);
      } finally {
        cleanup();
      }
    });

    test(`[${shell}] สั่งข้าม build + ไม่มี dist → ข้ามอย่างมีเสียง ไม่ใช่ FAIL`, { skip: skipReason }, async () => {
      const { dir, cleanup } = makeWorkspace({ dist: false });
      try {
        const { out, status } = await runWrapper(shell, dir, { skipFrontend: true });
        assert.equal(auditRunCount(dir), 0);
        assert.match(out, /SKIP\s+csp bundle audit/, 'ต้องบอกทั้งสิ่งที่ขาดและวิธีแก้');
        assert.doesNotMatch(out, /OK\s+csp bundle audit/, '"ไม่ได้ตรวจ" ห้ามพิมพ์ว่าผ่าน');
        assert.equal(status, 0, out);
      } finally {
        cleanup();
      }
    });

    test(`[${shell}] build สำเร็จแต่ไม่มี dist → ต้อง FAIL (build ไม่ออกไฟล์)`, { skip: skipReason }, async () => {
      const { dir, cleanup } = makeWorkspace({ dist: false });
      try {
        const { out, status } = await runWrapper(shell, dir);
        assert.match(out, /FAIL\s+csp bundle audit/);
        assert.equal(auditRunCount(dir), 0);
        assert.notEqual(status, 0);
      } finally {
        cleanup();
      }
    });
  }
});
