<?php
// ============================================================================
// routes/sync.php
// Sync Transform Layer — legacy HR → Smart Port (ADR-0001)
//
// Endpoints:
//   POST /sync/{domain}  — trigger sync for one domain (ต้องมีสิทธิ์ create:sync)
//   POST /sync           — trigger sync all domains (ต้องมีสิทธิ์ create:sync)
//   GET  /sync/status    — last sync timestamps per domain
// ============================================================================

include_once __DIR__ . '/../helpers.php';
include_once __DIR__ . '/../audit.php';
include_once __DIR__ . '/../SyncTransformService.php';
include_once __DIR__ . '/../sync/StagingPdoAdapter.php';
include_once __DIR__ . '/../sync/CsvFileAdapter.php';

/**
 * N23: test hook — integration test ฉีด identity ผ่าน $GLOBALS['__auth_user']
 * แทน JWT+DB (pattern เดียวกับ routes/settings.php) ใช้ array_key_exists
 * เพื่อให้ฉีด null (unauthenticated) ได้ต่างจาก ?? ที่ตกทะลุ getAuthenticatedUser
 */
function resolveSyncUser(): ?array
{
    if (array_key_exists('__auth_user', $GLOBALS)) {
        $u = $GLOBALS['__auth_user'];
        return is_array($u) ? $u : null;
    }
    return getAuthenticatedUser();
}

/**
 * N23: ตรวจ permission แบบไม่ exit (requirePermission exit จะฆ่า PHPUnit)
 * contract เดียวกัน — 401/403/503 พร้อม body เดิมจาก evaluatePermissionAccess
 *
 * @return array{status:int, body:array<string,mixed>}|null null = ผ่าน
 */
function denySyncIfForbidden(PDO $pdo, string $action, ?array $user): ?array
{
    $denied = evaluatePermissionAccess($action, 'sync', $user, $pdo);
    if ($denied !== null) {
        http_response_code($denied['status']);
        echo json_encode($denied['body']);
    }
    return $denied;
}

function handleSync(PDO $pdo, string $method, array $path): void
{
    $user = resolveSyncUser();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $sub = $path[1] ?? '';

    try {
        switch ($method) {
            case 'GET':
                if ($sub === 'status') {
                    // N32: GET ใช้ read:sync ไม่ใช่ create:sync
                    if (denySyncIfForbidden($pdo, 'read', $user) !== null) {
                        return;
                    }
                    handleSyncStatus($pdo);
                } else {
                    http_response_code(404);
                    echo json_encode(['error' => 'Not found']);
                }
                break;

            case 'POST':
                // ใช้ authz matrix เป็นเส้นตัดสิน (fail-closed) — ห้าม hardcode role check
                // เพราะ superadmin โดน 403 และ override จาก settings ไม่ถูกนับ
                if (denySyncIfForbidden($pdo, 'create', $user) !== null) {
                    return;
                }
                handleSyncTrigger($pdo, $sub, null, $user);
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

/**
 * @param array<string,mixed>|null $input บอดี้ที่ฉีดจาก test (null = อ่าน php://input)
 * @param array{user_id?:int|string}|null $authUser ผู้เรียก (null = resolve เอง)
 */
function handleSyncTrigger(PDO $pdo, string $domain, ?array $input = null, ?array $authUser = null): void
{
    $body = $input ?? (json_decode(file_get_contents('php://input'), true) ?? []);
    $sourceType = $body['source'] ?? 'staging';
    $full = (bool) ($body['full'] ?? false);
    // N23: ของเดิมอ้าง $user ที่ไม่มีใน scope นี้ (ประกาศใน handleSync) —
    // ส่งผู้เรียกเข้ามาตรง ๆ แทน (fallback resolve เองเพื่อคงพฤติกรรมเดิม)
    $triggerUser = $authUser ?? resolveSyncUser();
    $triggerUserId = (int) ($triggerUser['user_id'] ?? 0);

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

        $stagingOptions = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];

        // N20: staging connection ต้องเข้มเท่า connection หลัก — เปิด SSL เมื่อ staging เป็น TiDB/remote
        // (SYNC_STAGING_SSL=true → ใช้ CA เดียวกับ MYSQL_SSL_CA หรือ CA เฉพาะ staging)
        $stagingSsl = getenv('SYNC_STAGING_SSL') ?: '';
        if ($stagingSsl === 'true' || $stagingSsl === '1') {
            $caPath = getenv('SYNC_STAGING_SSL_CA') ?: (getenv('MYSQL_SSL_CA') ?: '');
            if ($caPath === '' || !is_readable($caPath)) {
                http_response_code(503);
                echo json_encode(['error' => 'SYNC_STAGING_SSL เปิดอยู่แต่ CA ไม่ได้ตั้งค่าหรืออ่านไม่ได้ (SYNC_STAGING_SSL_CA / MYSQL_SSL_CA)'], JSON_UNESCAPED_UNICODE);
                return;
            }
            $stagingOptions[PDO::MYSQL_ATTR_SSL_CA] = $caPath;
            $stagingOptions[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = true;
        }

        $stagingPdo = new PDO($dsn, $user, $pass, $stagingOptions);

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

    logAudit($pdo, $triggerUserId, 'sync', 'external_ref', null, null, ['domain' => $domain ?: 'all', 'source' => $sourceType, 'full' => $full]);
}
