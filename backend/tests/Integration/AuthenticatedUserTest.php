<?php

declare(strict_types=1);

namespace Tests\Integration;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

putenv('JWT_SECRET=integration-test-secret');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../auth.php';
require_once __DIR__ . '/../../audit.php';

final class AuthenticatedUserTest extends TestCase
{
    #[Test]
    public function authenticated_user_is_resolved_from_a_valid_jwt(): void
    {
        $pdo = testPdo();
        if (!$pdo) {
            self::markTestSkipped('MySQL integration database is unavailable');
        }

        $username = 'auth-flow-' . bin2hex(random_bytes(6));
        $stmt = $pdo->prepare(
            "INSERT INTO users
                (username, password_hash, full_name, role, is_active, must_change_password)
             VALUES (?, ?, 'Auth Flow Test', 'admin', 1, 0)"
        );
        $stmt->execute([$username, password_hash('test-only', PASSWORD_BCRYPT)]);
        $userId = (int) $pdo->lastInsertId();

        try {
            $jwt = generateJWT($userId, 'admin');
            $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $jwt['token'];

            $user = getAuthenticatedUser();

            self::assertNotNull($user);
            self::assertSame($userId, (int) $user['user_id']);
            self::assertSame('admin', $user['role']);
        } finally {
            unset($_SERVER['HTTP_AUTHORIZATION']);
            $pdo->prepare('DELETE FROM users WHERE user_id = ?')->execute([$userId]);
        }
    }
}
