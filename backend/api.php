<?php
// Smart Port Management System - Enhanced API Gateway
header('Content-Type: application/json');
$allowedOrigins = ['https://smart-port.onrender.com', 'https://smartport-backend.onrender.com', 'http://localhost:5174', 'http://localhost:8081'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header("Access-Control-Allow-Origin: $origin");
} else {
    header('Access-Control-Allow-Origin: https://smart-port.onrender.com');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include 'config.php';
include 'auth.php';
include_once 'helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = explode('/', trim($uri, '/'));

// Remove 'api' from path if present
if ($path[0] === 'api') {
    array_shift($path);
}

$token = getAuthHeader();

// Skip authentication for login and options
if (!in_array($path[0], ['login', 'auth']) && $method !== 'OPTIONS') {
    if (!$token || !validateJWT($token)) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
}

switch ($path[0]) {
    case 'auth':
        if ($path[1] === 'login' && $method == 'POST') {
            $data = json_decode(file_get_contents('php://input'), true);

            // รองรับทั้ง email/password และ username/password
            $email = $data['email'] ?? $data['username'] ?? '';
            $password = $data['password'] ?? '';

            // Simple validation (ควรเช็คกับ database จริง)
            if (($email == 'admin@smartport.gov.th' || $email == 'admin') && $password == 'admin123') {
                $token = generateJWT(1); // user_id = 1
                echo json_encode([
                    'token' => $token,
                    'user' => [
                        'id' => 1,
                        'email' => 'admin@smartport.gov.th',
                        'name' => 'Administrator'
                    ]
                ]);
            } else {
                http_response_code(401);
                echo json_encode(['error' => 'Invalid credentials']);
            }
        }
        break;

    case 'login':
        if ($method == 'POST') {
            $data = json_decode(file_get_contents('php://input'), true);

            // รองรับทั้ง email/password และ username/password
            $email = $data['email'] ?? $data['username'] ?? '';
            $password = $data['password'] ?? '';

            // Simple validation (ควรเช็คกับ database จริง)
            if (($email == 'admin@smartport.gov.th' || $email == 'admin') && $password == 'admin123') {
                $token = generateJWT(1); // user_id = 1
                echo json_encode([
                    'token' => $token,
                    'user' => [
                        'id' => 1,
                        'email' => 'admin@smartport.gov.th',
                        'name' => 'Administrator'
                    ]
                ]);
            } else {
                http_response_code(401);
                echo json_encode(['error' => 'Invalid credentials']);
            }
        }
        break;

    case 'profile':
        $id = $path[1] ?? null;
        if ($method == 'GET' && $id) {
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

            $file_name = basename($file['name'] ?? '');
            if ($file_name === '') {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid file name']);
                break;
            }

            if (!is_dir(UPLOAD_DIR)) {
                mkdir(UPLOAD_DIR, 0775, true);
            }

            $file_path = UPLOAD_DIR . $file_name;
            if (!move_uploaded_file($file['tmp_name'], $file_path)) {
                http_response_code(500);
                echo json_encode(['error' => 'Upload failed']);
                break;
            }

            try {
                $pdo->beginTransaction();

                $stmt = $pdo->prepare(
                    "INSERT INTO civil_servant_photos (servant_id, file_name, file_path) VALUES (?, ?, ?)"
                );
                $stmt->execute([$servant_id, $file_name, $file_path]);

                $photo_id = (int) $pdo->lastInsertId();
                $versions = createPhotoVersions($pdo, $photo_id, $file_name);

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
            callProcedureIfExists($pdo, 'sp_calculate_promotion_eligibility');
            $stmt = $pdo->query("SELECT * FROM advance_notifications");
            $forecasts = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode($forecasts);
        }
        break;

    case 'civil-servants':
        if ($method == 'GET') {
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
                LIMIT {$limit} OFFSET {$offset}
            ";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
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
            // จำนวนบุคลากรทั้งหมด (จาก personnel table)
            $stmt = $pdo->query("SELECT COUNT(*) as total FROM personnel WHERE is_active = 1");
            $totalPersonnel = (int) $stmt->fetch(PDO::FETCH_ASSOC)['total'];

            // สรุปพ้นทดลอง
            $stmt = $pdo->query("SELECT COUNT(*) as total FROM probation_enrollment");
            $probationTotal = (int) $stmt->fetch(PDO::FETCH_ASSOC)['total'];

            $stmt = $pdo->query("SELECT COUNT(*) as c FROM vw_probation_dashboard WHERE remaining_days BETWEEN 1 AND 30");
            $probationNear = (int) $stmt->fetch(PDO::FETCH_ASSOC)['c'];

            $stmt = $pdo->query("SELECT COUNT(*) as c FROM vw_probation_dashboard WHERE remaining_days < 0");
            $probationOverdue = (int) $stmt->fetch(PDO::FETCH_ASSOC)['c'];

            // จำนวนการนับเวลาเพิ่มเติม
            $stmt = $pdo->query("SELECT COUNT(*) as c FROM supportive_experience");
            $supportiveCount = (int) $stmt->fetch(PDO::FETCH_ASSOC)['c'];

            $stmt = $pdo->query("SELECT COUNT(*) as c FROM diverse_experience");
            $diverseCount = (int) $stmt->fetch(PDO::FETCH_ASSOC)['c'];

            $stmt = $pdo->query("SELECT COUNT(*) as c FROM position_equivalence");
            $equivalenceCount = (int) $stmt->fetch(PDO::FETCH_ASSOC)['c'];

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
            ]);
        }
        break;

    case 'candidates':
        include __DIR__ . '/routes/candidates.php';
        handleCandidates($pdo, $method, $path);
        break;

    case 'probation':
        include __DIR__ . '/routes/probation.php';
        handleProbation($pdo, $method, $path);
        break;

    case 'supportive':
        include __DIR__ . '/routes/supportive.php';
        handleSupportive($pdo, $method, $path);
        break;

    case 'diverse':
        include __DIR__ . '/routes/diverse.php';
        handleDiverse($pdo, $method, $path);
        break;

    case 'equivalence':
        include __DIR__ . '/routes/equivalence.php';
        handleEquivalence($pdo, $method, $path);
        break;

    default:
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
}
