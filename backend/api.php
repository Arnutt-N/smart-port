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
}, E_WARNING | E_NOTICE | E_DEPRECATED | E_USER_WARNING | E_USER_NOTICE | E_USER_DEPRECATED | E_RECOVERABLE_ERROR);

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
$isPublicRefresh = $path[0] === 'auth' && ($path[1] ?? '') === 'refresh' && $method === 'POST';
$isPublicLogout = $path[0] === 'auth' && ($path[1] ?? '') === 'logout' && $method === 'POST';
$isPasswordChange = $path[0] === 'auth' && ($path[1] ?? '') === 'change-password' && $method === 'POST';

// refresh/logout ใช้ refresh token เป็น credential — เข้าถึงได้แบบ public เหมือน login
// (access JWT อาจหมดอายุแล้ว จึงบังคับ JWT/CSRF ไม่ได้)
$isPublicAuth = $isPublicLogin || $isPublicRefresh || $isPublicLogout;

// Issue #112: asset รูป (GET /uploads/{file}) เป็น public เหมือนตอน Apache เสิร์ฟ static
// (<img> ไม่ส่ง Authorization header) — ชื่อไฟล์ CSPRNG เดาไม่ได้ทำหน้าที่เป็น capability URL
$isPublicPhotoAsset = $path[0] === 'uploads' && $method === 'GET';

// Issue #114: readiness endpoint เปิด public สำหรับ monitoring — คืนเฉพาะตัวเลข/สถานะ
// ไม่มีชื่อตาราง/schema (minimal disclosure)
$isPublicReadyz = $path[0] === 'readyz' && $method === 'GET';

// Issue #113: browser ส่ง CSP violation report เอง — ไม่มี JWT/CSRF แนบมาด้วย
$isPublicCspReport = $path[0] === 'csp-report' && $method === 'POST';

// Issue #113 (R1): endpoint สรุปตัวนับ — ไม่ใช้ JWT เพราะผู้อ่านคือสคริปต์ที่ไม่มีบัญชี
// ยืนยันตัวตนด้วย shared secret ใน handler แทน (ดู routes/csp_summary.php)
$isCspSummary = $path[0] === 'csp-report' && ($path[1] ?? '') === 'summary' && $method === 'GET';

// Issue #122: rate limit เส้นทาง public แบบไม่แตะ DB — กัน unauthenticated
// amplification (readyz ยิง DB ทุกคำขอ, csp-report เขียน log, uploads อ่าน DB ต่อรูป)
if ($isPublicPhotoAsset) {
    checkRateLimitPublic('uploads', 300, 60);
} elseif ($isPublicReadyz) {
    checkRateLimitPublic('readyz', 30, 60);
} elseif ($isPublicCspReport) {
    checkRateLimitPublic('csp-report', 60, 60);
} elseif ($isCspSummary) {
    // เข้มกว่าตัวอื่นเพราะ endpoint นี้มี secret ให้เดา — 10/นาที ทำ brute-force ไม่ไหว
    checkRateLimitPublic('csp-summary', 10, 60);
}

// login/refresh/logout เป็น public; auth endpoint อื่นต้องมี JWT เช่นเดียวกับ API ปกติ
if (!$isPublicAuth && !$isPublicPhotoAsset && !$isPublicReadyz && !$isPublicCspReport && !$isCspSummary && $method !== 'OPTIONS') {
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

if (in_array($method, $statefulMethods, true) && !$isPublicAuth && !$isPublicCspReport) {
    requireCSRFToken();
}

// ผู้ใช้ที่ถูกบังคับเปลี่ยนรหัสผ่านเข้าถึงได้เฉพาะ endpoint เปลี่ยนรหัสผ่าน
if (!$isPublicAuth && !$isPublicPhotoAsset && !$isPublicReadyz && !$isPublicCspReport && !$isPasswordChange && $method !== 'OPTIONS') {
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

    case 'settings':
        $pdo = getDB();
        include __DIR__ . '/routes/settings.php';
        handleSettings($pdo, $method, $path);
        break;

    case 'users':
        $pdo = getDB();
        include __DIR__ . '/routes/users.php';
        handleUsers($pdo, $method, $path);
        break;

    case 'profile':
        $id = $path[1] ?? null;
        if ($method !== 'GET') {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
        }
        requirePermission('read', 'profile');
        $pdo = getDB();
        if ($id) {
            // GET /profile/{id} — ข้อมูลข้าราชการรายบุคคล
            $stmt = $pdo->prepare(
                "SELECT p.personnel_id AS servant_id, p.employee_id, p.first_name, p.last_name,
                        p.birth_date, p.appointment_date, p.retirement_date,
                        p.servant_status, p.is_active,
                        CONCAT(COALESCE(px.prefix_name_th COLLATE utf8mb4_unicode_ci, ''), p.first_name, ' ', p.last_name) AS full_name,
                        csp.file_path AS photo_path
                 FROM personnel p
                 LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id
                 LEFT JOIN civil_servant_photos csp
                     ON p.personnel_id = csp.servant_id AND csp.is_primary = 1
                 WHERE p.personnel_id = ?"
            );
            $stmt->execute([$id]);
            $profile = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$profile) {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
                break;
            }
            // normalize เผื่อแถวรุ่นเก่าที่เก็บ path ของ filesystem ไว้
            $profile['photo_path'] = photoWebPath($profile['photo_path'] ?? null);
            echo json_encode(['success' => true, 'data' => $profile]);
        } else {
            // GET /profile — บัญชีผู้ใช้ของตัวเอง (ไม่มี user↔civil_servant link จึงคืนข้อมูล account)
            $authUser = getAuthenticatedUser();
            $stmt = $pdo->prepare(
                "SELECT user_id, username, full_name, email, role, is_active,
                        must_change_password, last_login_at, created_at
                 FROM users WHERE user_id = ?"
            );
            $stmt->execute([(int) ($authUser['user_id'] ?? 0)]);
            $account = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$account) {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
                break;
            }
            echo json_encode(['success' => true, 'data' => $account]);
        }
        break;

    case 'csp-report':
        // GET /api/csp-report/summary — อ่านสรุปตัวนับ (issue #113)
        if (($path[1] ?? '') === 'summary') {
            include_once __DIR__ . '/routes/csp_summary.php';
            handleCspSummary(tryGetDB(), $method, $_GET);
            break;
        }
        // POST /api/csp-report — รับ violation report จาก browser (report-only phase)
        if ($method !== 'POST') {
            respondMethodNotAllowed();
            break;
        }
        $raw = file_get_contents('php://input', false, null, 0, 10240); // cap 10KB กัน abuse
        $report = json_decode((string) $raw, true);
        $body = is_array($report) ? ($report['csp-report'] ?? $report) : [];
        if (is_array($body)) {
            $directive = (string) ($body['effective-directive'] ?? $body['violated-directive'] ?? 'unknown');
            $blocked = parse_url((string) ($body['blocked-uri'] ?? ''), PHP_URL_HOST) ?: 'self';
            // log เฉพาะ directive + host ของ blocked URI — ไม่มี PII
            // Issue #122: sanitize ก่อนเข้า log — ค่ามาจาก body ที่ attacker คุมได้ (กัน CRLF ปลอม log line)
            $safeDirective = sanitizeLogValue($directive);
            $safeBlocked = sanitizeLogValue($blocked);
            error_log('[csp-report] violation directive=' . $safeDirective . ' blocked-host=' . $safeBlocked);
            // Issue #113 (R1): เก็บตัวนับรายวันเพื่อให้เกณฑ์ enforce query ได้ — ไม่แทน error_log()
            // ข้างบน (หลักฐานสองทาง)
            include_once __DIR__ . '/csp_violations.php';
            try {
                // Issue #113 code review I2: tryGetDB() ถูก evaluate เป็น argument ก่อนเข้า
                // recordCspViolation() จึงอยู่นอก try/catch ภายในฟังก์ชันนั้น — ถ้า
                // buildSslOptions() (config.php) throw RuntimeException ตอนอ่าน MYSQL_SSL_CA
                // ไม่ได้ (MYSQL_SSL=true บน TiDB production) exception จะหลุดไปถึง
                // set_exception_handler กลายเป็น 500 แทน 204 ต้องครอบอีกชั้นตรงนี้เพิ่ม
                //
                // Issue #113 code review I3: การเรียก tryGetDB() ใน public path นี้คือ
                // trade-off ที่รู้ตัวและเลือกแล้ว — backend/middleware/rate_limit.php:162-164
                // เขียนไว้ว่า public path "ไม่แตะ DB เลย" เพื่อกัน amplification vector ตอน DB
                // ล่ม (attemptDbConnection() retry 3 ครั้ง คั่น usleep 200ms = กิน worker
                // ~0.4s ต่อ request) แต่การเก็บตัวนับลง DB คือสิ่งที่ spec ของ issue นี้สั่งไว้
                // ตรง ๆ และ negative cache ข้าม request ต้องพึ่ง APCu ที่ไม่การันตีว่ามีใน
                // image นี้ — ต้นทุนถ้าเลือกผิดคือ endpoint ช้าลงตอน DB ล่ม ไม่ใช่ข้อมูลเสียหาย
                recordCspViolation(tryGetDB(), $safeDirective, $safeBlocked);
            } catch (Throwable $e) {
                error_log('[csp-report] persist skipped: ' . $e->getMessage());
            }
        }
        http_response_code(204);
        break;

    case 'readyz':
        // Issue #114: readiness (DB + migration state) — ต่างจาก `/` ที่เป็น liveness ไม่แตะ DB
        // Issue #124: ใช้ tryGetDB() (ไม่ exit) เพื่อให้ handler คืน documented not_ready shape ได้จริง
        include_once __DIR__ . '/routes/readyz.php';
        handleReadyz(tryGetDB(), $method);
        break;

    case 'uploads':
        // Issue #112: เสิร์ฟรูปจาก DB — แทนที่ static file ที่ Apache เคยเสิร์ฟตรง ๆ
        include_once __DIR__ . '/routes/photos.php';
        handleUploadsAsset(getDB(), $method, $path);
        break;

    case 'photos':
        if ($method == 'POST') {
            requirePermission('create', 'photos');
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

            // Generate safe filename — CSPRNG; uniqid เป็น time+LCG เดาได้ (issue #127)
            $safeFileName = 'photo_' . bin2hex(random_bytes(16)) . '.' . $ext;

            // Issue #112: เก็บ bytes ลงฐานข้อมูล (TiDB persist ข้าม deploy) —
            // ห้ามเขียนลง filesystem ของ container เพราะหายตอน redeploy (ADR-0001/0003)
            $bytes = file_get_contents((string) $file['tmp_name']);
            if ($bytes === false) {
                http_response_code(500);
                echo json_encode(['error' => 'Upload failed']);
                break;
            }

            // เก็บลง DB เป็น path สัมพัทธ์ (uploads/xxx.jpg) เหมือนเดิม
            // เพื่อให้ frontend ประกอบ URL ผ่าน API base ได้ตรง ๆ
            $web_path = photoWebPath($safeFileName);

            try {
                $pdo = getDB();
                include_once __DIR__ . '/routes/photos.php';
                $stored = storePhotoRecord($pdo, $servant_id, $safeFileName, $web_path, $bytes, $mimeType);

                echo json_encode([
                    'success' => true,
                    'photo_id' => $stored['photo_id'],
                    'path' => $web_path,
                ]);
            } catch (Throwable $e) {
                error_log('[photos] store failed: ' . $e->getMessage());
                http_response_code(500);
                echo json_encode(['error' => 'Upload failed']);
            }
        } else {
            respondMethodNotAllowed();
        }
        break;

    case 'civil-servants':
        $pdo = getDB();
        $servantId = isset($path[1]) ? intval($path[1]) : 0;

        if ($method == 'GET') {
            requirePermission('read', 'personnel');
            include_once __DIR__ . '/routes/personnel.php';
            // Fail-closed: ไม่มี role = viewer (redact citizen_id เสมอ)
            $role = (string) (getAuthenticatedUser()['role'] ?? 'viewer');
            $search = $_GET['search'] ?? '';
            $limit = intval($_GET['limit'] ?? 20);
            $offset = intval($_GET['offset'] ?? 0);

            echo json_encode(legacyCivilServantsList($pdo, $role, $search, $limit, $offset));
        } elseif ($method === 'DELETE' && $servantId > 0) {
            // Soft-delete: ปิดใช้งานบุคลากร (ออกจากรายชื่อ candidates ที่กรอง is_active=1)
            requirePermission('delete', 'personnel');
            $stmt = $pdo->prepare(
                'UPDATE personnel SET is_active = 0 WHERE personnel_id = ? AND is_active = 1'
            );
            $stmt->execute([$servantId]);
            if ($stmt->rowCount() === 0) {
                $check = $pdo->prepare('SELECT is_active FROM personnel WHERE personnel_id = ?');
                $check->execute([$servantId]);
                $active = $check->fetchColumn();
                if ($active === false) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Not found']);
                    break;
                }
            }
            echo json_encode(['success' => true]);
        } else {
            respondMethodNotAllowed();
        }
        break;

    case 'dashboard':
        if ($method == 'GET') {
            requirePermission('read', 'dashboard');
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

            // Candidate totals จาก QualificationEngine overview (seam เดียวกับ /candidates/overview)
            $candidateTotals = [];
            $candidateGrandTotal = 0;
            try {
                include_once __DIR__ . '/QualificationEngine.php';
                $overview = (new QualificationEngine($pdo))->computeOverview();
                $byLevel = $overview['by_level'] ?? [];
                foreach ($byLevel as $level => $row) {
                    $candidateTotals[$level] = (int) ($row['total'] ?? 0);
                }
                $candidateGrandTotal = array_sum($candidateTotals);
            } catch (Throwable $e) {
                error_log('[dashboard] QualificationEngine overview failed: ' . $e->getMessage());
            }

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
        } else {
            respondMethodNotAllowed();
        }
        break;

    case 'personnel':
        $pdo = getDB();
        include __DIR__ . '/routes/personnel.php';
        handlePersonnel($pdo, $method, $path);
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

    case 'awards':
        $pdo = getDB();
        include __DIR__ . '/routes/awards.php';
        handleAwards($pdo, $method, $path);
        break;

    case 'royal-decorations':
        $pdo = getDB();
        include __DIR__ . '/routes/decorations.php';
        handleDecorations($pdo, $method, $path);
        break;

    case 'work-results':
        $pdo = getDB();
        include __DIR__ . '/routes/work_results.php';
        handleWorkResults($pdo, $method, $path);
        break;

    case 'analytics':
        $pdo = getDB();
        include __DIR__ . '/routes/analytics.php';
        handleAnalytics($pdo, $method, $path);
        break;

    case 'retirement':
        $pdo = getDB();
        include __DIR__ . '/routes/retirement.php';
        handleRetirement($pdo, $method, $path);
        break;

    case 'ocr':
        $pdo = getDB();
        include __DIR__ . '/routes/ocr.php';
        handleOcr($pdo, $method, $path);
        break;

    case 'sync':
        $pdo = getDB();
        include __DIR__ . '/routes/sync.php';
        handleSync($pdo, $method, $path);
        break;

    default:
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
}

// Explicitly flush the buffer opened by ob_start() above. On fatal errors the
// shutdown handler discards the buffer first, so this only runs on success.
if (ob_get_level() > 0) {
    ob_end_flush();
}
