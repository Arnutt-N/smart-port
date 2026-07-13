#!/usr/bin/env php
<?php
/**
 * Apply ordered SQL migrations from database/ and record them in schema_migrations.
 *
 * Safety for existing TiDB/prod:
 * - If schema_migrations is empty but core tables already exist, seed a baseline
 *   for migrations through 14-* (already applied manually / via init scripts)
 *   and only execute newer files (e.g. 15-api-rate-limit-hits.sql).
 * - DDL is not wrapped in a multi-statement transaction (TiDB/MySQL auto-commit DDL).
 * - Uses GET_LOCK when available to reduce multi-instance races.
 *
 * Usage:
 *   docker compose exec backend php scripts/run-migrations.php
 *   php scripts/run-migrations.php
 */

declare(strict_types=1);

/** Last migration assumed already applied on existing production DBs */
const MIGRATION_BASELINE_THROUGH = '14-multiplier-area-admin.sql';

function migrationEnv(string $key, string $default = ''): string
{
    $value = getenv($key);
    if ($value !== false && $value !== '') {
        return $value;
    }

    return $_ENV[$key] ?? $_SERVER[$key] ?? $default;
}

function migrationPdo(): PDO
{
    $host = migrationEnv('MYSQL_HOST', 'db');
    $port = migrationEnv('MYSQL_PORT', '3306');
    $dbname = migrationEnv('MYSQL_DATABASE', 'civil_service_mgmt');
    $username = migrationEnv('MYSQL_USER', 'root');
    $password = migrationEnv('MYSQL_PASSWORD', 'rootpassword');
    $useSSL = migrationEnv('MYSQL_SSL', '');

    $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    if ($useSSL === 'true' || $useSSL === '1') {
        $caPath = migrationEnv('MYSQL_SSL_CA', '');
        if ($caPath === '' || !is_readable($caPath)) {
            throw new RuntimeException('MYSQL_SSL is enabled but MYSQL_SSL_CA is missing or unreadable');
        }
        $options[PDO::MYSQL_ATTR_SSL_CA] = $caPath;
        $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = true;
    }

    return new PDO($dsn, $username, $password, $options);
}

function migrationDirectory(): string
{
    $configured = migrationEnv('MIGRATIONS_DIR', '');
    $candidates = array_filter([
        $configured !== '' ? $configured : null,
        '/var/www/database',
        dirname(__DIR__, 2) . '/database',
        dirname(__DIR__) . '/migrations',
    ]);

    foreach ($candidates as $dir) {
        if (is_dir($dir)) {
            return $dir;
        }
    }

    throw new RuntimeException('No migrations directory found');
}

function ensureMigrationTable(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS schema_migrations (
            migration_name VARCHAR(255) NOT NULL PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

/**
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

function tableExists(PDO $pdo, string $table): bool
{
    $stmt = $pdo->prepare(
        'SELECT 1 FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = ?
         LIMIT 1'
    );
    $stmt->execute([$table]);
    return (bool) $stmt->fetchColumn();
}

function databaseAlreadyProvisioned(PDO $pdo): bool
{
    // Existing local init / TiDB prod already have core tables before schema_migrations existed
    return tableExists($pdo, 'personnel') || tableExists($pdo, 'users');
}

/**
 * Mark historical migrations as applied without re-running non-idempotent SQL.
 *
 * @param list<string> $files
 * @return list<string> baselined names
 */
function seedBaselineIfNeeded(PDO $pdo, array $files): array
{
    $count = (int) $pdo->query('SELECT COUNT(*) FROM schema_migrations')->fetchColumn();
    if ($count > 0 || !databaseAlreadyProvisioned($pdo)) {
        return [];
    }

    $insert = $pdo->prepare(
        'INSERT IGNORE INTO schema_migrations (migration_name) VALUES (?)'
    );
    $seeded = [];
    foreach ($files as $file) {
        $name = basename($file);
        if (strnatcasecmp($name, MIGRATION_BASELINE_THROUGH) > 0) {
            continue;
        }
        $insert->execute([$name]);
        $seeded[] = $name;
    }

    return $seeded;
}

function splitSqlStatements(string $sql): array
{
    $statements = [];
    $buffer = '';
    $inSingleQuote = false;
    $inDoubleQuote = false;
    $length = strlen($sql);

    for ($i = 0; $i < $length; $i++) {
        $char = $sql[$i];
        $prev = $i > 0 ? $sql[$i - 1] : '';

        if ($char === "'" && !$inDoubleQuote && $prev !== '\\') {
            $inSingleQuote = !$inSingleQuote;
        } elseif ($char === '"' && !$inSingleQuote && $prev !== '\\') {
            $inDoubleQuote = !$inDoubleQuote;
        }

        if ($char === ';' && !$inSingleQuote && !$inDoubleQuote) {
            $statement = trim($buffer);
            if ($statement !== '') {
                $statements[] = $statement;
            }
            $buffer = '';
            continue;
        }

        $buffer .= $char;
    }

    $tail = trim($buffer);
    if ($tail !== '') {
        $statements[] = $tail;
    }

    return $statements;
}

function applyMigration(PDO $pdo, string $file): void
{
    $name = basename($file);
    $sql = file_get_contents($file);
    if ($sql === false) {
        throw new RuntimeException("Cannot read migration file: {$file}");
    }

    // TiDB/MySQL auto-commit DDL — do not wrap the whole file in a transaction
    foreach (splitSqlStatements($sql) as $statement) {
        $pdo->exec($statement);
    }

    $insert = $pdo->prepare('INSERT INTO schema_migrations (migration_name) VALUES (?)');
    $insert->execute([$name]);
}

function acquireMigrationLock(PDO $pdo): bool
{
    try {
        $stmt = $pdo->query("SELECT GET_LOCK('smartport_migrate', 30)");
        $got = $stmt ? $stmt->fetchColumn() : false;
        return (string) $got === '1';
    } catch (Throwable $e) {
        fwrite(STDERR, '[migrate] GET_LOCK unavailable, continuing without lock: ' . $e->getMessage() . PHP_EOL);
        return true;
    }
}

function releaseMigrationLock(PDO $pdo): void
{
    try {
        $pdo->query("SELECT RELEASE_LOCK('smartport_migrate')");
    } catch (Throwable $e) {
        // ignore
    }
}

try {
    $pdo = migrationPdo();
    ensureMigrationTable($pdo);

    if (!acquireMigrationLock($pdo)) {
        throw new RuntimeException('Could not acquire migration lock (another instance is migrating)');
    }

    try {
        $directory = migrationDirectory();
        $files = listMigrationFiles($directory);

        $seeded = seedBaselineIfNeeded($pdo, $files);
        if ($seeded !== []) {
            fwrite(STDOUT, 'Baselined ' . count($seeded) . ' historical migration(s) through ' . MIGRATION_BASELINE_THROUGH . ".\n");
        }

        $applied = $pdo->query('SELECT migration_name FROM schema_migrations')
            ->fetchAll(PDO::FETCH_COLUMN);
        $appliedMap = array_fill_keys($applied ?: [], true);

        $pending = [];
        foreach ($files as $file) {
            $name = basename($file);
            if (!isset($appliedMap[$name])) {
                $pending[$name] = $file;
            }
        }

        if ($pending === []) {
            fwrite(STDOUT, "No pending migrations.\n");
            exit(0);
        }

        ksort($pending, SORT_NATURAL);
        $skippedTestSeed = [];
        $allowTestSeed = migrationEnv('APPLY_TEST_SEED_MIGRATIONS', '0') === '1';
        foreach ($pending as $name => $file) {
            // กัน TEST_SEED ขึ้น production โดยไม่ตั้งใจ — เปิดด้วย APPLY_TEST_SEED_MIGRATIONS=1 เท่านั้น
            if (!$allowTestSeed && str_contains($name, 'test-seed')) {
                $skippedTestSeed[] = $name;
                fwrite(
                    STDOUT,
                    "Skipping {$name} (TEST_SEED). Set APPLY_TEST_SEED_MIGRATIONS=1 to apply.\n"
                );
                continue;
            }
            fwrite(STDOUT, "Applying {$name}...\n");
            applyMigration($pdo, $file);
            fwrite(STDOUT, "Applied {$name}\n");
        }

        $appliedCount = count($pending) - count($skippedTestSeed);
        if ($appliedCount === 0 && $skippedTestSeed !== []) {
            fwrite(STDOUT, "No migrations applied ({$skippedTestSeed[0]} skipped as TEST_SEED).\n");
            exit(0);
        }

        fwrite(STDOUT, $appliedCount . " migration(s) applied.\n");
        exit(0);
    } finally {
        releaseMigrationLock($pdo);
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'Migration runner failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
