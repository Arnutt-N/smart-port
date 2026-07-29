#!/usr/bin/env php
<?php
/**
 * CLI runner for legacy HR → Smart Port sync transform (ADR-0001).
 *
 * Usage:
 *   php scripts/run-sync.php --domain=all --source=staging
 *   php scripts/run-sync.php --domain=D1 --source=csv --csv-dir=/data/export
 *   php scripts/run-sync.php --domain=D2 --full --dry-run
 *
 * Env vars (staging source):
 *   SYNC_STAGING_HOST, SYNC_STAGING_PORT, SYNC_STAGING_DATABASE,
 *   SYNC_STAGING_USER, SYNC_STAGING_PASSWORD
 */

declare(strict_types=1);

require_once __DIR__ . '/../SyncTransformService.php';
require_once __DIR__ . '/../sync/StagingPdoAdapter.php';
require_once __DIR__ . '/../sync/CsvFileAdapter.php';

function syncEnv(string $key, string $default = ''): string
{
    $val = getenv($key);
    if ($val !== false && $val !== '') {
        return $val;
    }
    if (isset($_ENV[$key]) && $_ENV[$key] !== '') {
        return $_ENV[$key];
    }

    return $default;
}

function targetPdo(): PDO
{
    $host = syncEnv('MYSQL_HOST', 'db');
    $port = syncEnv('MYSQL_PORT', '3306');
    $dbname = syncEnv('MYSQL_DATABASE', 'civil_service_mgmt');
    $user = syncEnv('MYSQL_USER', 'root');
    $pass = syncEnv('MYSQL_PASSWORD', 'rootpassword');

    $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";

    return new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}

function stagingPdo(): PDO
{
    $host = syncEnv('SYNC_STAGING_HOST', '');
    $port = syncEnv('SYNC_STAGING_PORT', '3306');
    $dbname = syncEnv('SYNC_STAGING_DATABASE', '');
    $user = syncEnv('SYNC_STAGING_USER', '');
    $pass = syncEnv('SYNC_STAGING_PASSWORD', '');

    if ($host === '' || $dbname === '' || $user === '') {
        fwrite(STDERR, "Error: SYNC_STAGING_HOST, SYNC_STAGING_DATABASE, SYNC_STAGING_USER are required for staging source.\n");
        exit(1);
    }

    $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";

    return new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}

// --- Parse arguments ---
$options = getopt('', ['domain:', 'source:', 'csv-dir:', 'full', 'dry-run', 'help']);

if (isset($options['help'])) {
    fwrite(STDOUT, "Usage: php scripts/run-sync.php [options]\n");
    fwrite(STDOUT, "  --domain=D1|D2|D3|D4|D5|D6|D7|all   (default: all)\n");
    fwrite(STDOUT, "  --source=staging|csv                  (default: staging)\n");
    fwrite(STDOUT, "  --csv-dir=/path/to/csv                (required if source=csv)\n");
    fwrite(STDOUT, "  --full                                (ignore delta, re-sync everything)\n");
    fwrite(STDOUT, "  --dry-run                             (validate only, no writes)\n");
    exit(0);
}

$domain = strtoupper($options['domain'] ?? 'all');
$sourceType = $options['source'] ?? 'staging';
$csvDir = $options['csv-dir'] ?? '';
$full = isset($options['full']);
$dryRun = isset($options['dry-run']);

if ($sourceType === 'csv' && $csvDir === '') {
    fwrite(STDERR, "Error: --csv-dir is required when --source=csv\n");
    exit(1);
}

if ($sourceType === 'csv' && !is_dir($csvDir)) {
    fwrite(STDERR, "Error: CSV directory not found: {$csvDir}\n");
    exit(1);
}

// --- Build source adapter ---
$source = $sourceType === 'csv'
    ? new CsvFileAdapter($csvDir)
    : new StagingPdoAdapter(stagingPdo());

// --- Run ---
try {
    $target = targetPdo();
    $service = new SyncTransformService($target, $source);

    if ($dryRun) {
        fwrite(STDOUT, "[DRY RUN] No writes will be performed.\n\n");
    }

    fwrite(STDOUT, "Sync Transform — source: {$sourceType}, domain: {$domain}, mode: " . ($full ? 'full' : 'delta') . "\n");
    fwrite(STDOUT, str_repeat('-', 60) . "\n");

    if ($domain === 'ALL') {
        $results = $dryRun ? [] : $service->syncAll($full);
        if ($dryRun) {
            foreach (SyncTransformService::domainOrder() as $d) {
                fwrite(STDOUT, "  {$d}: would sync (dry-run)\n");
            }
        }
    } else {
        $results = $dryRun ? [] : [$service->syncDomain($domain, $full)];
        if ($dryRun) {
            fwrite(STDOUT, "  {$domain}: would sync (dry-run)\n");
        }
    }

    if (!$dryRun) {
        $totalCreated = 0;
        $totalUpdated = 0;
        $totalErrors = 0;

        foreach ($results as $r) {
            $errCount = count($r['errors']);
            $totalCreated += $r['created'];
            $totalUpdated += $r['updated'];
            $totalErrors += $errCount;

            fwrite(STDOUT, sprintf(
                "  %s: +%d created, ~%d updated, %d skipped, %d errors\n",
                $r['domain'],
                $r['created'],
                $r['updated'],
                $r['skipped'],
                $errCount
            ));

            foreach (array_slice($r['errors'], 0, 5) as $err) {
                fwrite(STDERR, "    ERROR: {$err}\n");
            }
            if ($errCount > 5) {
                fwrite(STDERR, "    ... and " . ($errCount - 5) . " more errors\n");
            }
        }

        fwrite(STDOUT, str_repeat('-', 60) . "\n");
        fwrite(STDOUT, "Total: +{$totalCreated} created, ~{$totalUpdated} updated, {$totalErrors} errors\n");

        exit($totalErrors > 0 ? 2 : 0);
    }

    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, 'Sync failed: ' . $e->getMessage() . "\n");
    exit(1);
}
