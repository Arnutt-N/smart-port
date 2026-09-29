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
 * docker-compose init mounts, CI init mounts, or tidb-init (all include through 36).
 * Fresh volumes must not re-run non-idempotent files such as 22, 30 or 32
 * (Issue #129: baseline เดิมตัดที่ 25 ทำให้ fresh volume โดน re-apply 30
 *  ซึ่งเป็น ALTER TABLE ADD COLUMN ล้วน ๆ → Duplicate column แล้ว runner พัง;
 *  32 เป็น RENAME ที่ rerun ไม่ได้เช่นกัน — init mounts รันมันแล้ว)
 * 33 จบด้วย DROP ... IF EXISTS (rerun ได้) แต่ baseline ต้องขยับตามอยู่ดี —
 * 35 เป็น ADD CONSTRAINT ล้วน (rerun ไม่ได้ถ้า constraint มีแล้ว),
 * 36 เป็น ALTER ADD COLUMN + UPDATE (rerun ไม่ได้) — baseline ผ่าน 36
 * INV-5 ใน gate บังคับ (กันลืมแบบ #129)
 */
const MIGRATION_BASELINE_THROUGH = '36-remember-me-session-ttl.sql';

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
    // rtrim: test harness mount backend/ ที่ /app → dirname(__DIR__, 2) คืน '/'
    // ไม่ตัดจะได้ '//database' ซึ่งทำให้ assert path แบบ exact-match ในเทสพัง
    $candidates = [
        '/var/www/database',
        rtrim(dirname(__DIR__, 2), '/\\') . '/database',
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

/**
 * ตรวจว่า statement ขึ้นต้นด้วยคำสั่ง SELECT หรือไม่ (case-insensitive)
 * โดย strip leading line comments (-- และ #) และ block comment ก่อน
 */
function sqlStatementSelects(string $sql): bool
{
    $s = ltrim($sql);
    // strip leading line comments (-- และ #) ทีละบรรทัด
    while (true) {
        $s = ltrim($s);
        if (str_starts_with($s, '--') || str_starts_with($s, '#')) {
            $nl = strpos($s, "\n");
            $s = $nl === false ? '' : substr($s, $nl + 1);
            continue;
        }
        // strip leading block comment /* ... */
        if (str_starts_with($s, '/*')) {
            $end = strpos($s, '*/');
            $s = $end === false ? '' : ltrim(substr($s, $end + 2));
            continue;
        }
        break;
    }
    return strncasecmp($s, 'select', 6) === 0;
}

/**
 * รันคำสั่ง migration: ถ้าเป็น SELECT ให้ query และ drain result set เพื่อป้องกัน
 * PDO 2014 Cannot execute queries while other unbuffered queries are active
 * พร้อม log ผล pre-check (soft_link + orphans)
 */
function executeMigrationStatement(\PDO $pdo, string $sql): void
{
    if (sqlStatementSelects($sql)) {
        // SELECT คืน result set — ต้อง drain มิฉะนั้น statement ถัดไปล้ม PDO 2014
        $stmt = $pdo->query($sql);
        if ($stmt === false) {
            // fail-visible: ห้ามเงียบ — ถึง DDL จะ fail ทีหลังด้วย 1452 แต่เสีย count ของ log
            // (ภายใต้ ERRMODE_EXCEPTION query() จะ throw เสมอ แต่เก็บกิ่งนี้ไว้สำหรับกรณี mock / non-throwing driver)
            fwrite(STDERR, '  pre-check: query failed (no result) — ' . substr($sql, 0, 60) . PHP_EOL);
        }
        if ($stmt !== false) {
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC); // explicit — ไม่พึ่ง ATTR_DEFAULT_FETCH_MODE
            $stmt->closeCursor();
            // log ผล pre-check (soft_link + orphans) ตามเจตนาใน 35-fk-retrofit.sql:26-27
            // ใช้ key ชัดเจน ไม่ใช่ implode/reset/end (FETCH_ASSOC ลำดับ value ขึ้นกับ column order)
            foreach ($rows as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $link = $row['soft_link'] ?? '(unknown)';
                $orphans = $row['orphans'] ?? '?';
                // echo (ไม่ใช่ fwrite(STDOUT)) — PHPUnit จับได้ด้วย expectOutputString; fwrite(STDOUT) bypass output buffering
                // (ตั้งใจ: runner รอบข้างใช้ fwrite แต่จุดนี้ต้องเป็น echo เท่านั้น — ห้ามเปลี่ยนกลับ)
                echo "  pre-check: {$link} orphans={$orphans}" . PHP_EOL;
            }
        }
        return;
    }
    $pdo->exec($sql);
}

/**
 * D6: migration 36 (ALTER ADD COLUMN + UPDATE cutover) ห้ามถูกมาร์ก baseline
 * แบบไม่รัน DDL — seedBaselineIfNeeded INSERT IGNORE ได้เสมอ ดังนั้น DB เก่าที่ยัง
 * ไม่มี remember_me จะถูกมาร์ก applied ผิด ๆ แล้วโค้ดใหม่ยิง INSERT/SELECT คอลัมน์
 * ที่ไม่มี = login/refresh 500 ทั้งระบบ · คอลัมน์ยังไม่มี → ข้ามการมาร์ก
 * เพื่อให้ pending-selection ของ runner apply DDL จริงเอง
 * (T6 preflight ยังบังคับ verify ด้วยมือก่อน deploy — ตัวนี้คือ fail-closed ของ path อัตโนมัติ)
 *
 * @param \PDO $pdo
 * @param string $name ชื่อไฟล์ baseline
 * @return bool true = ห้าม baseline ไฟล์นี้ตอนนี้
 */
function baselineRequiresRealApply(\PDO $pdo, string $name): bool
{
    // 35: 8 FK pairs ต้องครบ — ขาดเดียว = ห้าม baseline (mirror D6 guard ของ 36)
    if (basename($name) === '35-fk-retrofit.sql') {
        try {
            $required = [
                'fk_awards_personnel', 'fk_decorations_personnel', 'fk_photos_personnel',
                'fk_proposals_personnel', 'fk_proposals_evaluator', 'fk_qualcalc_personnel',
                'fk_refresh_tokens_user', 'fk_personnel_prefix',
            ];
            $stmt = $pdo->query(
                'SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
                 WHERE constraint_schema = DATABASE()'
            );
            $existing = $stmt !== false ? $stmt->fetchAll(\PDO::FETCH_COLUMN) : [];
            foreach ($required as $fk) {
                if (!in_array($fk, $existing, true)) {
                    return true; // ขาด → ห้าม baseline ให้ runner apply จริง
                }
            }
            return false;
        } catch (\PDOException) {
            return true; // fail-closed
        }
    }

    if (basename($name) !== '36-remember-me-session-ttl.sql') {
        return false;
    }
    // paired-schema (ตาม T6): คอลัมน์ทั้งคู่ต้องครบ — เหลือคอลัมน์เดียว =
    // partial state (เช่น runner ตายหลัง ALTER) ห้ามมาร์ก
    // หมายเหตุ: "ALTER สำเร็จแต่ cutover UPDATE ไม่รัน" แยกจาก "cutover แล้วมี
    // session ใหม่ active" ด้วย signal อัตโนมัติไม่ได้ — กรณีนี้เป็นของ T6
    // preflight (verify ผล revoke ระหว่าง marker ยังไม่มี) เท่านั้น
    try {
        foreach (['remember_me', 'revocation_reason'] as $column) {
            $stmt = $pdo->query("SHOW COLUMNS FROM refresh_tokens LIKE '{$column}'");
            if ($stmt === false || $stmt->fetch() === false) {
                return true;
            }
        }

        return false;
    } catch (\PDOException) {
        return true; // เข้าถึงตารางไม่ได้ → fail-closed ห้ามมาร์ก
    }
}
