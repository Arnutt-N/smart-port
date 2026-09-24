<?php

// ============================================================================
// routes/profile.php
// Profile Route Handler — ย้าย inline block ออกจาก api.php (T6) ทั้งดุ้น
// contract เดิมคงไว้ทุกประการ (status/body เดียวกับของเดิมใน api.php)
//
// Endpoints:
//   GET /profile      — บัญชีผู้ใช้ของตัวเอง (แถว users, ไม่มี password_hash)
//   GET /profile/{id} — ข้อมูลข้าราชการรายบุคคล + path รูป primary
// ============================================================================

include_once __DIR__ . '/../helpers.php';

/**
 * N23: test hook — pattern เดียวกับ routes/users.php
 * ใช้ array_key_exists เพื่อให้ฉีด null (unauthenticated) ได้
 */
function resolveProfileAuthUser(): ?array
{
    if (array_key_exists('__auth_user', $GLOBALS)) {
        $u = $GLOBALS['__auth_user'];
        return is_array($u) ? $u : null;
    }
    return getAuthenticatedUser();
}

/**
 * ดึงข้อมูลข้าราชการรายบุคคลพร้อม path รูป primary (normalize แล้ว)
 *
 * @param mixed $id personnel_id จาก path segment (string ตัวเลขตามเดิม)
 * @return array<string,mixed>|null แถวข้อมูล หรือ null ถ้าไม่พบ
 */
function fetchPersonnelProfile(PDO $pdo, mixed $id): ?array
{
    $stmt = $pdo->prepare(
        'SELECT p.personnel_id, p.employee_id, p.first_name, p.last_name,
                p.birth_date, p.appointment_date, p.retirement_date,
                p.servant_status, p.is_active,
                ' . sqlPersonnelFullName() . ' AS full_name,
                csp.file_path AS photo_path
         FROM personnel p
         LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id
         LEFT JOIN civil_servant_photos csp
             ON p.personnel_id = csp.personnel_id AND csp.is_primary = 1
         WHERE p.personnel_id = ?'
    );
    $stmt->execute([$id]);
    $profile = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$profile) {
        return null;
    }
    // normalize เผื่อแถวรุ่นเก่าที่เก็บ path ของ filesystem ไว้
    $profile['photo_path'] = photoWebPath($profile['photo_path'] ?? null);
    return $profile;
}

/**
 * ดึงบัญชีผู้ใช้ของตัวเอง — ไม่มี user↔personnel link จึงคืนข้อมูล account
 * คอลัมน์เดียวกับของเดิมใน api.php (ไม่มี password_hash)
 *
 * @return array<string,mixed>|null แถวข้อมูล หรือ null ถ้าไม่พบ
 */
function fetchOwnAccount(PDO $pdo, int $userId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT user_id, username, full_name, email, role, is_active,
                must_change_password, last_login_at, created_at
         FROM users WHERE user_id = ?'
    );
    $stmt->execute([$userId]);
    $account = $stmt->fetch(PDO::FETCH_ASSOC);
    return $account ?: null;
}

/**
 * จัดการ request สำหรับ profile endpoints (GET อย่างเดียว)
 *
 * N23: เดิม requirePermission exit จะฆ่า PHPUnit — ใช้ evaluate + return
 * contract เดิม (401/403/503 + body) คงไว้ทุกประการ
 *
 * @param PDO $pdo Database connection
 * @param string $method HTTP method
 * @param array $path URL path segments
 */
function handleProfile(PDO $pdo, string $method, array $path): void
{
    if ($method !== 'GET') {
        respondMethodNotAllowed();
        return;
    }
    $auth = resolveProfileAuthUser();
    $denied = evaluatePermissionAccess('read', 'profile', $auth, $pdo);
    if ($denied !== null) {
        http_response_code($denied['status']);
        echo json_encode($denied['body']);
        return;
    }

    $id = $path[1] ?? null;
    // NOTE: falsy id ('0'/''/null) ตกไปสาขา own-account ตามของเดิมใน api.php
    // (if ($id)) — ไม่ใช่บั๊กที่ T6 ต้องแก้ คงพฤติกรรมไว้แล้วล็อกด้วยเทส
    if ($id) {
        // GET /profile/{id} — ข้อมูลข้าราชการรายบุคคล
        $profile = fetchPersonnelProfile($pdo, $id);
        if (!$profile) {
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
            return;
        }
        echo json_encode(['success' => true, 'data' => $profile]);
    } else {
        // GET /profile — บัญชีผู้ใช้ของตัวเอง
        $account = fetchOwnAccount($pdo, (int) ($auth['user_id'] ?? 0));
        if (!$account) {
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
            return;
        }
        echo json_encode(['success' => true, 'data' => $account]);
    }
}
