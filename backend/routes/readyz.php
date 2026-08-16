<?php

declare(strict_types=1);

// ============================================================================
// routes/readyz.php
// Issue #114: readiness endpoint (GET /readyz) — ต่างจาก liveness (`/` ใน index.php)
// ที่ตั้งใจไม่แตะ DB: readiness เช็ค DB connectivity + migration state จริง
//
// minimal disclosure: คืนเฉพาะตัวเลข/สถานะ — ไม่บอกชื่อตารางหรือชื่อ migration
// เพราะ endpoint เปิดสาธารณะ (pattern เดียวกับ index.php)
// ============================================================================

require_once __DIR__ . '/../scripts/migration-lib.php';
require_once __DIR__ . '/../helpers.php';

/** release identifier — Render inject RENDER_GIT_COMMIT ตอน runtime (PassEnv ใน Dockerfile) */
function releaseSha(): string
{
    $sha = getenv('RENDER_GIT_COMMIT');
    return is_string($sha) && $sha !== '' ? $sha : 'dev';
}

/**
 * สร้าง readiness report — throw เมื่อต่อ DB ไม่ได้/สั่ง query ไม่ได้
 *
 * @return array{status:string, release:string, db:string, migrations_bundled:int, migrations_pending:int}
 */
function readyzReport(PDO $pdo): array
{
    $pdo->query('SELECT 1')->fetchColumn(); // connectivity probe

    try {
        $bundled = listMigrationFiles(migrationDirectory());
    } catch (Throwable $e) {
        $bundled = []; // image ไม่ได้ bundle database/ ไว้ (ดู render.yaml)
    }

    // นับเฉพาะ migration ที่ runner จะ apply จริง (ข้าม test-seed เว้นแต่เปิด env)
    $allowTestSeed = migrationEnv('APPLY_TEST_SEED_MIGRATIONS', '0') === '1';
    $expected = array_filter(
        $bundled,
        static fn (string $name): bool => $allowTestSeed || !str_contains($name, 'test-seed')
    );

    $applied = [];
    try {
        $applied = array_flip($pdo->query('SELECT migration_name FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN));
    } catch (Throwable $e) {
        // schema_migrations ยังไม่มี = ยังไม่เคยรัน migration → ทุก bundled file ถือว่า pending
    }

    $pending = 0;
    foreach ($expected as $path) {
        if (!isset($applied[basename($path)])) {
            $pending++;
        }
    }

    return [
        'status' => ($pending === 0) ? 'ready' : 'migrations_pending',
        'release' => releaseSha(),
        'db' => 'ok',
        'migrations_bundled' => count($bundled),
        'migrations_pending' => $pending,
    ];
}

/**
 * DB-down response ที่ monitor เห็นจริง (Issue #124): api.php ส่ง tryGetDB()
 * ที่คืน null แทนการ exit แบบ getDB() — shape นี้ต้องตรงกับ
 * docs/render-tidb-production.md
 */
function emitNotReady(): void
{
    http_response_code(503);
    echo json_encode([
        'status' => 'not_ready',
        'release' => releaseSha(),
        'db' => 'unreachable',
    ], JSON_UNESCAPED_UNICODE);
}

/** GET /readyz — 200 เมื่อ DB พร้อมและไม่มี migration ค้าง, มิฉะนั้น 503 */
function handleReadyz(?PDO $pdo, string $method): void
{
    if ($method !== 'GET') {
        respondMethodNotAllowed();
        return;
    }

    if ($pdo === null) {
        emitNotReady();
        return;
    }

    try {
        $report = readyzReport($pdo);
    } catch (Throwable $e) {
        // log เฉพาะข้อความ error ของ DB driver — ไม่มี PII
        error_log('[readyz] db check failed: ' . $e->getMessage());
        emitNotReady();
        return;
    }

    http_response_code($report['status'] === 'ready' ? 200 : 503);
    echo json_encode($report, JSON_UNESCAPED_UNICODE);
}
