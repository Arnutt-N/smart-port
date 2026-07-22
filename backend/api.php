<?php
// Smart Port Management System - Enhanced API Gateway
// Production-safe error handling: prevent PHP warnings/notices from leaking
// as HTML into JSON responses (the "Unexpected token '<'" bug)
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('html_errors', '0');

// Convert uncaught exceptions to JSON instead of HTML
set_exception_handler(static function (\Throwable $e): void {
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=UTF-8');
    }
    error_log('[api] Uncaught ' . get_class($e) . ': ' . $e->getMessage() . "\n" . $e->getTraceAsString());
    echo json_encode(['error' => 'Internal server error', 'code' => 'INTERNAL_ERROR']);
});

// Convert fatal errors to JSON
register_shutdown_function(static function (): void {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=UTF-8');
        }
        error_log('[api] Fatal: ' . $err['message'] . ' at ' . $err['file'] . ':' . $err['line']);
        echo json_encode(['error' => 'Internal server error', 'code' => 'INTERNAL_ERROR']);
    }
});

// Catch warnings/notices before they leak as HTML
set_error_handler(static function (int $errno, string $errstr, string $errfile = '', int $errline = 0): bool {
    if (!(error_reporting() & $errno)) {
        return false;
    }
    error_log("[api] PHP $errno: $errstr at $errfile:$errline");
    throw new \ErrorException($errstr, 0, $errno, $errfile, $errline);
}, E_WARNING | E_NOTICE | E_DEPRECATED | E_USER_WARNING | E_USER_NOTICE | E_USER_DEPRECATED);

// Output buffer to prevent HTML leaking before JSON
ob_start();
header('Content-Type: application/json; charset=UTF-8');

// CORS Configuration - อ่านจาก environment variable
$allowedOriginsEnv = getenv('ALLOWED_ORIGINS') ?: 'https://smart-port.onrender.com';
$allowedOrigins = array_map('trim', explode(',', $allowedOriginsEnv));

// Development fallback - เพิ่ม localhost ใน development mode
if (getenv('APP_ENV') === 'development') {
    $allowedOrigins = array_merge($allowedOrigins, [
        'http://localhost:5174',
        'http://localhost:8081'
    ]);
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin");
} else {
    // Fallback to first allowed origin
    header('Access-Control-Allow-Origin: ' . $allowedOrigins[0]);
}

header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include 'config.php';
include 'auth.php';
include_once 'helpers.php';
include_once 'audit.php';
include_once 'middleware/csrf.php';
include_once 'middleware/rate_limit.php';

$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = explode('/', trim($uri, '/'));

// Remove 'api' from path if present
if ($path[0] === 'api') {
    array_shift($path);
}

$token = getAuthHeader();
$isPublicLogin = $path[0] === 'auth' && ($path[1] ?? '') === 'login' && $method === 'POST';
$isPasswordChange = $path[0] === 'auth' && ($path[1] ?? '') === 'change-password' && $method === 'POST';

// เฉพาะ login เท่านั้นที่เป็น public; auth endpoint อื่นต้องมี JWT เช่นเดียวกับ API ปกติ
if (!$isPublicLogin && $method !== 'OPTIONS') {
    if (!$token || !validateJWT($token)) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    // Global rate limiting (หลัง JWT validation)
    rateLimitGlobal();
}

// CSRF Protection for state-changing requests
$statefulMethods = ['POST', 'PUT', 'DELETE'];

if (in_array($method, $statefulMethods, true) && !$isPublicLogin) {
    requireCSRFToken();
}

// ผู้ใช้ที่ถูกบังคับเปลี่ยนรหัสผ่านเข้าถึงได้เฉพาะ endpoint เปลี่ยนรหัสผ่าน
if (!$isPublicLogin && !$isPasswordChange && $method !== 'OPTIONS') {
    $authenticatedUser = getAuthenticatedUser();
    if ((int) ($authenticatedUser['must_change_password'] ?? 0) === 1) {
        http_response_code(403);
        echo json_encode([
            'error' => 'Password change required',
            'code' => 'PASSWORD_CHANGE_REQUIRED',
        ]);
        exit;
    }
}

switch ($path[0]) {
    case 'auth':
        $pdo = getDB();
        include __DIR__ . '/routes/auth.php';
        handleAuth($pdo, $method, $path);
        break;

    case 'users':
        $pdo = getDB();
        include __DIR__ . '/routes/users.php';
        handleUsers($pdo, $method, $path);
        break;

    case 'profile':
        $id = $path[1] ?? null;
        if ($method == 'GET' && $id) {
            $pdo = getDB();
            $stmt = $pdo->prepare("SELECT * FROM v_civil_servants_current WHERE servant_id = ?");
            $stmt->execute([$id]);
            $profile = $stmt->fetch(PDO::FETCH_ASSOC);
            echo json_encode($profile ?: ['error' => 'Not found']);
        }
        break;

    case 'photos':
        if ($method == 'POST') {
            $servant_id = intval($_POST['servant_id'] ?? 0);
            $file = $_FILES['photo'] ?? null;

            if ($servant_id <= 0 || !is_array($file)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid upload request']);
                break;
            }

            if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                http_response_code(400);
                echo json_encode(['error' => 'Upload failed']);
                break;
            }

            // ✅ Validate file extension
            $fileName = basename($file['name'] ?? '');
            $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
            $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif'];

            if (!in_array($ext, $allowedExtensions, true)) {
                http_response_code(415);
                echo json_encode(['error' => 'Invalid file type. Allowed: jpg, jpeg, png, gif']);
                break;
            }

            // ✅ Validate MIME type
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mimeType = finfo_file($finfo, $file['tmp_name']);
            finfo_close($finfo);

            $allowedMimes = ['image/jpeg', 'image/png', 'image/gif'];
            if (!in_array($mimeType, $allowedMimes, true)) {
                http_response_code(415);
                echo json_encode(['error' => 'Invalid file MIME type']);
                break;
            }

            // ✅ Validate image content
            if (!getimagesize($file['tmp_name'])) {
                http_response_code(415);
                echo json_encode(['error' => 'File is not a valid image']);
                break;
            }

            // ✅ Size limit: 5MB
            if (filesize($file['tmp_name']) > 5 * 1024 * 1024) {
                http_response_code(413);
                echo json_encode(['error' => 'File too large. Max 5MB']);
                break;
            }

            // Generate safe filename
            $safeFileName = uniqid('photo_', true) . '.' . $ext;

            if (!is_dir(UPLOAD_DIR)) {
                mkdir(UPLOAD_DIR, 0775, true);
            }

            $file_path = UPLOAD_DIR . $safeFileName;
            if (!move_uploaded_file($file['tmp_name'], $file_path)) {
                http_response_code(500);
                echo json_encode(['error' => 'Upload failed']);
                break;
            }

            try {
                $pdo = getDB();
                $pdo->beginTransaction();

                $stmt = $pdo->prepare(
                    "INSERT INTO civil_servant_photos (servant_id, file_name, file_path) VALUES (?, ?, ?)"
                );
                $stmt->execute([$servant_id, $safeFileName, $file_path]);

                $photo_id = (int) $pdo->lastInsertId();
                $versions = createPhotoVersions($pdo, $photo_id, $safeFileName);

                $pdo->commit();

                echo json_encode([
                    'success' => true,
                    'photo_id' => $photo_id,
                    'path' => $file_path,
                    'versions' => $versions,
                ]);
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }

                if (is_file($file_path)) {
                    @unlink($file_path);
                }

                http_response_code(500);
                echo json_encode(['error' => 'Upload failed']);
            }
        }
        break;

    case 'forecast':
        if ($method == 'GET') {
            $pdo = getDB();
            callProcedureIfExists($pdo, 'sp_calculate_promotion_eligibility');
            $stmt = $pdo->query("SELECT * FROM advance_notifications");
            $forecasts = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode($forecasts);
        }
        break;

    case 'civil-servants':
        if ($method == 'GET') {
            $pdo = getDB();
            $search = $_GET['search'] ?? '';
            $limit = intval($_GET['limit'] ?? 20);
            $offset = intval($_GET['offset'] ?? 0);

            // Build search query
            $searchQuery = '';
            $params = [];

            if (!empty($search)) {
                $searchQuery = " WHERE (cs.first_name LIKE ? OR cs.last_name LIKE ? OR cs.employee_id LIKE ?)";
                $searchTerm = "%{$search}%";
                $params = [$searchTerm, $searchTerm, $searchTerm];
            } else {
                $searchQuery = " WHERE 1=1";
            }

            $sql = "
                SELECT
                    cs.servant_id,
                    cs.employee_id,
                    cs.citizen_id,
                    CONCAT(p.prefix_name_th, cs.first_name, ' ', cs.last_name) as full_name,
                    cs.first_name,
                    cs.last_name,
                    cs.birth_date,
                    cs.appointment_date,
                    cs.retirement_date,
                    cs.servant_status
                FROM civil_servants cs
                LEFT JOIN prefixes p ON cs.prefix_id = p.prefix_id
                {$searchQuery}
                AND cs.is_active = 1
                ORDER BY cs.first_name, cs.last_name
                LIMIT ? OFFSET ?
            ";

            $stmt = $pdo->prepare($sql);
            $stmt->execute(array_merge($params, [$limit, $offset]));
            $servants = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Get total count for pagination
            $countSql = "SELECT COUNT(*) as total FROM civil_servants cs {$searchQuery}";
            $countStmt = $pdo->prepare($countSql);
            $countStmt->execute($params);
            $total = $countStmt->fetch(PDO::FETCH_ASSOC)['total'];

            echo json_encode([
                'success' => true,
                'data' => $servants,
                'pagination' => [
                    'total' => $total,
                    'limit' => $limit,
                    'offset' => $offset,
                    'has_more' => ($offset + $limit) < $total
                ]
            ]);
        }
        break;

    case 'dashboard':
        if ($method == 'GET') {
            $pdo = getDB();

            // จำนวนบุคลากรทั้งหมด (จาก personnel table)
            $stmt = $pdo->query("SELECT COUNT(*) as total FROM personnel WHERE is_active = 1");
            $totalPersonnel = (int) $stmt->fetch(PDO::FETCH_ASSOC)['total'];

            // สรุปพ้นทดลอง
            $stmt = $pdo->query("SELECT COUNT(*) as total FROM probation_enrollment");
            $probationTotal = (int) $stmt->fetch(PDO::FETCH_ASSOC)['total'];

            // vw_probation_dashboard อาจพังบน TiDB (definer issue) — ใช้ try-catch
            $probationNear = 0;
            $probationOverdue = 0;
            try {
                $stmt = $pdo->query("SELECT COUNT(*) as c FROM vw_probation_dashboard WHERE remaining_days BETWEEN 1 AND 30");
                $probationNear = (int) $stmt->fetch(PDO::FETCH_ASSOC)['c'];

                $stmt = $pdo->query("SELECT COUNT(*) as c FROM vw_probation_dashboard WHERE remaining_days < 0");
                $probationOverdue = (int) $stmt->fetch(PDO::FETCH_ASSOC)['c'];
            } catch (PDOException $e) {
                // View ไม่สามารถใช้งานได้ — fallback คำนวณจาก base tables
                try {
                    $stmt = $pdo->query("
                        SELECT COUNT(*) as c FROM probation_enrollment
                        WHERE overall_status = 'IN_PROGRESS'
                        AND DATEDIFF(end_date, CURDATE()) BETWEEN 1 AND 30
                    ");
                    $probationNear = (int) $stmt->fetch(PDO::FETCH_ASSOC)['c'];

                    $stmt = $pdo->query("
                        SELECT COUNT(*) as c FROM probation_enrollment
                        WHERE overall_status = 'IN_PROGRESS'
                        AND DATEDIFF(end_date, CURDATE()) < 0
                    ");
                    $probationOverdue = (int) $stmt->fetch(PDO::FETCH_ASSOC)['c'];
                } catch (PDOException $e2) {
                    // ถ้ายัง fail อีก ใช้ค่า 0
                }
            }

            // จำนวนการนับเวลาเพิ่มเติม
            $stmt = $pdo->query("SELECT COUNT(*) as c FROM supportive_experience");
            $supportiveCount = (int) $stmt->fetch(PDO::FETCH_ASSOC)['c'];

            $stmt = $pdo->query("SELECT COUNT(*) as c FROM diverse_experience");
            $diverseCount = (int) $stmt->fetch(PDO::FETCH_ASSOC)['c'];

            $stmt = $pdo->query("SELECT COUNT(*) as c FROM position_equivalence");
            $equivalenceCount = (int) $stmt->fetch(PDO::FETCH_ASSOC)['c'];

            // Candidate totals ต่อระดับ (ลด fan-out จาก 5 requests เหลือ 1 query)
            $candidateTotals = [];
            try {
                $stmt = $pdo->query("
                    SELECT current_level_code, COUNT(*) AS cnt
                    FROM personnel
                    WHERE is_active = 1 AND current_level_code IS NOT NULL
                    GROUP BY current_level_code
                ");
                $levelCounts = $stmt->fetchAll(PDO::FETCH_ASSOC);

                // Map source levels → target levels
                $levelMap = ['K1' => 'K2', 'K2' => 'K3', 'K3' => 'K4', 'O1' => 'O2', 'O2' => 'O3'];
                foreach ($levelCounts as $row) {
                    $source = $row['current_level_code'];
                    if (isset($levelMap[$source])) {
                        $target = $levelMap[$source];
                        $candidateTotals[$target] = ($candidateTotals[$target] ?? 0) + (int) $row['cnt'];
                    }
                }
            } catch (PDOException $e) {
                // ถ้า query fail ส่งค่าว่าง — frontend จะ fallback ยิง candidates endpoints เอง
            }

            $candidateGrandTotal = array_sum($candidateTotals);

            // Multiplier summary (รวมสถิติการนับทวีคูณ)
            $multiplierStats = [
                'total_records' => 0,
                'distinct_personnel' => 0,
                'total_bonus_days' => 0,
                'total_bonus_years' => 0,
            ];
            try {
                $stmt = $pdo->query("
                    SELECT
                        COUNT(*) AS total_records,
                        COUNT(DISTINCT personnel_id) AS distinct_personnel,
                        COALESCE(SUM(bonus_days), 0) AS total_bonus_days
                    FROM multiplier_experience
                ");
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    $multiplierStats['total_records'] = (int) $row['total_records'];
                    $multiplierStats['distinct_personnel'] = (int) $row['distinct_personnel'];
                    $multiplierStats['total_bonus_days'] = (float) $row['total_bonus_days'];
                    $multiplierStats['total_bonus_years'] = round($multiplierStats['total_bonus_days'] / 365, 1);
                }
            } catch (PDOException $e) {
                // ถ้า query fail ส่งค่า default
            }

            echo json_encode([
                'success' => true,
                'total_personnel' => $totalPersonnel,
                'probation' => [
                    'total' => $probationTotal,
                    'near_deadline' => $probationNear,
                    'overdue' => $probationOverdue,
                ],
                'time_counting' => [
                    'supportive' => $supportiveCount,
                    'diverse' => $diverseCount,
                    'equivalence' => $equivalenceCount,
                    'total' => $supportiveCount + $diverseCount + $equivalenceCount,
                ],
                'multiplier' => $multiplierStats,
                'candidates' => [
                    'total' => $candidateGrandTotal,
                    'by_level' => $candidateTotals,
                ],
            ]);
        }
        break;

    case 'personnel':
        if ($method == 'GET') {
            $pdo = getDB();
            $search = $_GET['search'] ?? '';
            $limit = intval($_GET['limit'] ?? 10);

            if (empty($search)) {
                echo json_encode(['success' => true, 'data' => []]);
                break;
            }

            $searchTerm = "%{$search}%";
            $stmt = $pdo->prepare("
                SELECT p.personnel_id, p.citizen_id,
                       CONCAT(p.first_name, ' ', p.last_name) AS full_name,
                       p.first_name, p.last_name,
                       pos.position_name AS current_position,
                       o.org_name AS department
                FROM personnel p
                LEFT JOIN `position` pos ON p.current_position_id = pos.position_id
                LEFT JOIN organization o ON p.current_org_id = o.org_id
                WHERE p.is_active = 1
                  AND (p.first_name LIKE ? OR p.last_name LIKE ? OR p.citizen_id LIKE ?)
                ORDER BY p.first_name, p.last_name
                LIMIT ?
            ");
            $stmt->execute([$searchTerm, $searchTerm, $searchTerm, $limit]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode(['success' => true, 'data' => $rows]);
        }
        break;

    case 'candidates':
        $pdo = getDB();
        include __DIR__ . '/routes/candidates.php';
        handleCandidates($pdo, $method, $path);
        break;

    case 'probation':
        $pdo = getDB();
        include __DIR__ . '/routes/probation.php';
        handleProbation($pdo, $method, $path);
        break;

    case 'supportive':
        $pdo = getDB();
        include __DIR__ . '/routes/supportive.php';
        handleSupportive($pdo, $method, $path);
        break;

    case 'multiplier':
        $pdo = getDB();
        include __DIR__ . '/routes/multiplier.php';
        handleMultiplier($pdo, $method, $path);
        break;

    case 'audit':
        $pdo = getDB();
        include __DIR__ . '/routes/audit.php';
        handleAudit($pdo, $method, $path);
        break;

    case 'diverse':
        $pdo = getDB();
        include __DIR__ . '/routes/diverse.php';
        handleDiverse($pdo, $method, $path);
        break;

    case 'equivalence':
        $pdo = getDB();
        include __DIR__ . '/routes/equivalence.php';
        handleEquivalence($pdo, $method, $path);
        break;

    case 'import':
        $pdo = getDB();
        include __DIR__ . '/routes/import.php';
        handleImport($pdo, $method, $path);
        break;

    default:
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
}
