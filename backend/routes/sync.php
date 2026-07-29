<?php
// ============================================================================
// routes/sync.php
// Sync Transform Layer — legacy HR → Smart Port (ADR-0001)
//
// Endpoints:
//   POST /sync/{domain}  — trigger sync for one domain (admin-only)
//   POST /sync           — trigger sync all domains (admin-only)
//   GET  /sync/status    — last sync timestamps per domain
// ============================================================================

include_once __DIR__ . '/../helpers.php';
include_once __DIR__ . '/../audit.php';
include_once __DIR__ . '/../SyncTransformService.php';
include_once __DIR__ . '/../sync/StagingPdoAdapter.php';
include_once __DIR__ . '/../sync/CsvFileAdapter.php';

function handleSync(PDO $pdo, string $method, array $path): void
{
    $user = getAuthenticatedUser();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    if (($user['role'] ?? '') !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถสั่ง sync ได้']);
        return;
    }

    $sub = $path[1] ?? '';

    try {
        switch ($method) {
            case 'GET':
                if ($sub === 'status') {
                    handleSyncStatus($pdo);
                } else {
                    http_response_code(404);
                    echo json_encode(['error' => 'Not found']);
                }
                break;

            case 'POST':
                handleSyncTrigger($pdo, $sub);
                break;

            default:
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
        }
    } catch (PDOException $e) {
        error_log('[sync] DB error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'เกิดข้อผิดพลาดในการเข้าถึงฐานข้อมูล'], JSON_UNESCAPED_UNICODE);
    }
}

function handleSyncStatus(PDO $pdo): void
{
    $dummySource = new class implements SourceAdapterInterface {
        public function fetchRows(string $table, array $columns = [], ?string $sinceColumn = null, ?string $sinceValue = null): iterable { return []; }
        public function fetchLookup(string $table, string $keyColumn, string $valueColumn): array { return []; }
        public function hasTable(string $table): bool { return false; }
    };

    $service = new SyncTransformService($pdo, $dummySource);
    $status = $service->getStatus();

    echo json_encode(['success' => true, 'data' => $status], JSON_UNESCAPED_UNICODE);
}

function handleSyncTrigger(PDO $pdo, string $domain): void
{
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $sourceType = $body['source'] ?? 'staging';
    $full = (bool) ($body['full'] ?? false);

    if ($sourceType === 'staging') {
        $host = getenv('SYNC_STAGING_HOST') ?: '';
        $dbname = getenv('SYNC_STAGING_DATABASE') ?: '';
        $user = getenv('SYNC_STAGING_USER') ?: '';

        if ($host === '' || $dbname === '' || $user === '') {
            http_response_code(503);
            echo json_encode(['error' => 'Staging database not configured (SYNC_STAGING_* env vars missing)'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $port = getenv('SYNC_STAGING_PORT') ?: '3306';
        $pass = getenv('SYNC_STAGING_PASSWORD') ?: '';
        $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";

        $stagingPdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);

        $source = new StagingPdoAdapter($stagingPdo);
    } elseif ($sourceType === 'csv') {
        $csvDir = getenv('SYNC_CSV_DIR') ?: '';
        if ($csvDir === '' || !is_dir($csvDir)) {
            http_response_code(503);
            echo json_encode(['error' => 'CSV directory not configured or not found (SYNC_CSV_DIR)'], JSON_UNESCAPED_UNICODE);
            return;
        }
        $source = new CsvFileAdapter($csvDir);
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'source ต้องเป็น staging หรือ csv เท่านั้น'], JSON_UNESCAPED_UNICODE);
        return;
    }

    $service = new SyncTransformService($pdo, $source);

    if ($domain === '' || $domain === 'all') {
        $results = $service->syncAll($full);
        echo json_encode(['success' => true, 'data' => $results], JSON_UNESCAPED_UNICODE);
    } else {
        $domain = strtoupper($domain);
        $validDomains = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];
        if (!in_array($domain, $validDomains, true)) {
            http_response_code(400);
            echo json_encode(['error' => "domain ไม่ถูกต้อง — ใช้ได้: " . implode(', ', $validDomains) . ', all'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $result = $service->syncDomain($domain, $full);
        $hasErrors = count($result['errors']) > 0;
        echo json_encode(['success' => !$hasErrors, 'data' => $result], JSON_UNESCAPED_UNICODE);
    }

    logAudit($pdo, (int) ($user['user_id'] ?? 0), 'sync', 'external_ref', null, null, ['domain' => $domain ?: 'all', 'source' => $sourceType, 'full' => $full]);
}
