<?php

/**
 * migration-lib.php
 *
 * ฟังก์ชันบริสุทธิ์ที่ run-migrations.php ใช้ — แยกออกมาเพื่อให้ unit test require ได้
 * โดยไม่ไปกระตุ้น main body ของ runner (ซึ่งต่อ database จริงตั้งแต่บรรทัดแรก)
 */

declare(strict_types=1);

/**
 * Last migration assumed already applied when the DB was provisioned by
 * docker-compose init mounts or tidb-init (both include through 25).
 * Fresh volumes must not re-run non-idempotent files such as 22.
 */
const MIGRATION_BASELINE_THROUGH = '25-ensure-multiplier-tables.sql';

function migrationEnv(string $key, string $default = ''): string
{
    $value = getenv($key);
    if ($value !== false && $value !== '') {
        return $value;
    }

    return $_ENV[$key] ?? $_SERVER[$key] ?? $default;
}

/**
 * ไฟล์ migration ในโฟลเดอร์ เรียงตามลำดับธรรมชาติ (01, 02, ... 10, 11)
 * นับเฉพาะไฟล์ที่ขึ้นต้นด้วยเลขสองหลัก และตัด tidb-init.sql (bootstrap ไม่ใช่ migration) ออก
 *
 * @return list<string> absolute paths
 */
function listMigrationFiles(string $directory): array
{
    $files = glob(rtrim($directory, '/\\') . '/*.sql') ?: [];
    $files = array_values(array_filter($files, static function (string $path): bool {
        $name = basename($path);
        return $name !== 'tidb-init.sql'
            && preg_match('/^\d{2}-/', $name) === 1;
    }));

    usort($files, static fn (string $a, string $b): int => strnatcasecmp(basename($a), basename($b)));

    return $files;
}

/**
 * หาโฟลเดอร์ migration ตัวแรกที่ "มีอยู่จริงและมีไฟล์ migration อยู่ข้างใน"
 *
 * เงื่อนไข "มีไฟล์" สำคัญมาก: image ที่ build ด้วย backend/Dockerfile จะสร้าง
 * /var/www/database เป็นโฟลเดอร์เปล่า (ไฟล์ database/ อยู่นอก build context)
 * ถ้าเช็คแค่ is_dir() runner จะเลือกโฟลเดอร์เปล่านั้น เจอ 0 ไฟล์ แล้วรายงาน
 * "No pending migrations." ทั้งที่ schema ไม่ถูกอัปเดตเลย — ตกหล่นแบบเงียบสนิท
 *
 * @throws RuntimeException เมื่อไม่พบโฟลเดอร์ที่มีไฟล์ migration
 */
function migrationDirectory(): string
{
    $misconfigHint = ' — image อาจถูก build โดยไม่ได้ copy database/ เข้ามา'
        . ' (ดู render.yaml: ต้อง build จาก repo root ด้วย ./Dockerfile)';

    // ตั้ง MIGRATIONS_DIR มาแล้ว = เจตนาชัดเจน ห้าม fallback ไปโฟลเดอร์อื่นเงียบ ๆ
    // เพราะการรัน migration จากที่ที่ผู้ดูแลไม่ได้ตั้งใจ อันตรายกว่าการหยุดแล้วบอกให้รู้
    $configured = migrationEnv('MIGRATIONS_DIR', '');
    if ($configured !== '') {
        if (!is_dir($configured)) {
            throw new RuntimeException("MIGRATIONS_DIR does not exist: {$configured}");
        }
        if (listMigrationFiles($configured) === []) {
            throw new RuntimeException(
                "MIGRATIONS_DIR contains no migration files: {$configured}" . $misconfigHint
            );
        }
        return $configured;
    }

    // migration อยู่ใน database/ ที่เดียว (ดู scripts/validate-schema-parity.mjs)
    // ในภาพ production คือ /var/www/database ส่วนตอนรันจาก checkout คือ <repo>/database
    $candidates = [
        '/var/www/database',
        dirname(__DIR__, 2) . '/database',
    ];

    $emptyDirs = [];
    foreach ($candidates as $dir) {
        if (!is_dir($dir)) {
            continue;
        }
        if (listMigrationFiles($dir) !== []) {
            return $dir;
        }
        $emptyDirs[] = $dir;
    }

    if ($emptyDirs !== []) {
        throw new RuntimeException(
            'Migrations directory contains no migration files: ' . implode(', ', $emptyDirs) . $misconfigHint
        );
    }

    throw new RuntimeException('No migrations directory found (tried: ' . implode(', ', $candidates) . ')');
}

/**
 * แยก SQL หลายคำสั่งด้วย ";" โดยไม่ตัดใน string / คอมเมนต์
 *
 * สำคัญ: คอมเมนต์บรรทัด `-- ...` หรือ `# ...` อาจมี ";" อยู่ข้างใน (เช่น อธิบาย FK)
 * ถ้าตัดที่ ";" ในคอมเมนต์ จะได้เศษข้อความไทยไป execute → SQL syntax error
 * (เคยพัง migration 24-drop-dead-tables.sql แล้วทำให้ container รีสตาร์ทวน)
 *
 * @return list<string>
 */
function splitSqlStatements(string $sql): array
{
    $statements = [];
    $buffer = '';
    $inSingleQuote = false;
    $inDoubleQuote = false;
    $inLineComment = false;
    $inBlockComment = false;
    $length = strlen($sql);

    for ($i = 0; $i < $length; $i++) {
        $char = $sql[$i];
        $next = $i + 1 < $length ? $sql[$i + 1] : '';
        $prev = $i > 0 ? $sql[$i - 1] : '';

        if ($inLineComment) {
            $buffer .= $char;
            if ($char === "\n") {
                $inLineComment = false;
            }
            continue;
        }

        if ($inBlockComment) {
            $buffer .= $char;
            if ($char === '*' && $next === '/') {
                $buffer .= $next;
                $i++;
                $inBlockComment = false;
            }
            continue;
        }

        if (!$inSingleQuote && !$inDoubleQuote) {
            if ($char === '-' && $next === '-') {
                $inLineComment = true;
                $buffer .= $char;
                continue;
            }
            if ($char === '#') {
                $inLineComment = true;
                $buffer .= $char;
                continue;
            }
            if ($char === '/' && $next === '*') {
                $inBlockComment = true;
                $buffer .= $char;
                continue;
            }
        }

        if ($char === "'" && !$inDoubleQuote && $prev !== '\\') {
            $inSingleQuote = !$inSingleQuote;
        } elseif ($char === '"' && !$inSingleQuote && $prev !== '\\') {
            $inDoubleQuote = !$inDoubleQuote;
        }

        if ($char === ';' && !$inSingleQuote && !$inDoubleQuote) {
            $statement = trim($buffer);
            // ข้ามชิ้นที่เป็นแค่คอมเมนต์/ว่าง — ไม่ต้องส่งให้ PDO
            if ($statement !== '' && !sqlStatementIsCommentOnly($statement)) {
                $statements[] = $statement;
            }
            $buffer = '';
            continue;
        }

        $buffer .= $char;
    }

    $tail = trim($buffer);
    if ($tail !== '' && !sqlStatementIsCommentOnly($tail)) {
        $statements[] = $tail;
    }

    return $statements;
}

/** true ถ้าข้อความเหลือแต่คอมเมนต์ SQL (ไม่มีคำสั่งจริง) */
function sqlStatementIsCommentOnly(string $sql): bool
{
    $withoutBlock = preg_replace('/\/\*[\s\S]*?\*\//', '', $sql) ?? $sql;
    $lines = preg_split('/\R/', $withoutBlock) ?: [];
    foreach ($lines as $line) {
        $trim = trim($line);
        if ($trim === '' || str_starts_with($trim, '--') || str_starts_with($trim, '#')) {
            continue;
        }
        return false;
    }
    return true;
}
