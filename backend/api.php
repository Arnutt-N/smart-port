<?php
// Smart Port Management System - Enhanced API Gateway
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: https://smart-port.onrender.com');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

include 'config.php';
include 'auth.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = explode('/', trim($_SERVER['REQUEST_URI'], '/'));

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
            $servant_id = $_POST['servant_id'];
            $file = $_FILES['photo'];
            $file_name = basename($file['name']);
            $file_path = UPLOAD_DIR . $file_name;
            if (move_uploaded_file($file['tmp_name'], $file_path)) {
                $stmt = $pdo->prepare("INSERT INTO civil_servant_photos (servant_id, file_name, file_path) VALUES (?, ?, ?)");
                $stmt->execute([$servant_id, $file_name, $file_path]);
                $photo_id = $pdo->lastInsertId();
                // Call procedure
                $pdo->query("CALL sp_generate_photo_versions($photo_id)");
                echo json_encode(['success' => true, 'path' => $file_path]);
            } else {
                echo json_encode(['error' => 'Upload failed']);
            }
        }
        break;

    case 'forecast':
        if ($method == 'GET') {
            $pdo->query("CALL sp_calculate_promotion_eligibility()");
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
            // Dashboard analytics and statistics
            $stats = [];

            // Total civil servants
            $stmt = $pdo->query("SELECT COUNT(*) as total FROM civil_servants WHERE is_active = 1");
            $stats['total_servants'] = $stmt->fetch(PDO::FETCH_ASSOC)['total'];

            // Upcoming retirements (next 2 years)
            $stmt = $pdo->query("
                SELECT COUNT(*) as count 
                FROM civil_servants 
                WHERE retirement_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 2 YEAR)
                AND is_active = 1
            ");
            $stats['upcoming_retirements'] = $stmt->fetch(PDO::FETCH_ASSOC)['count'];

            // Pending notifications
            $stmt = $pdo->query("SELECT COUNT(*) as count FROM advance_notifications WHERE status = 'pending'");
            $stats['pending_notifications'] = $stmt->fetch(PDO::FETCH_ASSOC)['count'];

            // Recent performance proposals
            $stmt = $pdo->query("
                SELECT COUNT(*) as count 
                FROM performance_proposals 
                WHERE submission_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            ");
            $stats['recent_proposals'] = $stmt->fetch(PDO::FETCH_ASSOC)['count'];

            echo json_encode([
                'success' => true,
                'total_civil_servants' => $stats['total_servants'],
                'upcoming_retirements' => $stats['upcoming_retirements'],
                'pending_notifications' => $stats['pending_notifications'],
                'recent_proposals' => $stats['recent_proposals']
            ]);
        }
        break;

    case 'candidates':
        if ($method == 'GET') {
            // Get candidate lists or search candidates
            $search = $_GET['search'] ?? '';
            $limit = intval($_GET['limit'] ?? 20);
            $offset = intval($_GET['offset'] ?? 0);

            if ($search) {
                // Search for candidates
                $stmt = $pdo->prepare("
                    SELECT cs.*, p.prefix_name_th, csp.file_path as photo_path
                    FROM civil_servants cs
                    LEFT JOIN prefixes p ON cs.prefix_id = p.prefix_id
                    LEFT JOIN civil_servant_photos csp ON cs.servant_id = csp.servant_id AND csp.is_primary = TRUE
                    WHERE (cs.first_name LIKE ? OR cs.last_name LIKE ? OR cs.employee_id LIKE ?)
                    AND cs.is_active = 1
                    ORDER BY cs.last_name, cs.first_name
                    LIMIT ? OFFSET ?
                ");
                $searchTerm = "%$search%";
                $stmt->execute([$searchTerm, $searchTerm, $searchTerm, $limit, $offset]);
            } else {
                // Get all candidates
                $stmt = $pdo->prepare("
                    SELECT cs.*, p.prefix_name_th, csp.file_path as photo_path
                    FROM civil_servants cs
                    LEFT JOIN prefixes p ON cs.prefix_id = p.prefix_id
                    LEFT JOIN civil_servant_photos csp ON cs.servant_id = csp.servant_id AND csp.is_primary = TRUE
                    WHERE cs.is_active = 1
                    ORDER BY cs.last_name, cs.first_name
                    LIMIT ? OFFSET ?
                ");
                $stmt->execute([$limit, $offset]);
            }

            $candidates = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode([
                'success' => true,
                'data' => $candidates
            ]);
        }
        break;

    default:
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
}
