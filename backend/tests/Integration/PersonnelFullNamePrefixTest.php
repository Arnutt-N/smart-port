<?php
declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use Throwable;

putenv('JWT_SECRET=integration-test-secret');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../routes/supportive.php';

/**
 * Regression: ชื่อบุคลากรต้องรวมคำนำหน้าเมื่อมี prefix_id
 * (รูปแบบเดียวกับ /civil-servants และ GET /personnel)
 */
final class PersonnelFullNamePrefixTest extends TestCase
{
    private static ?PDO $pdo = null;
    private int $personnelId = 0;
    private int $prefixId = 0;
    private string $prefixCode = '';
    private string $firstName = '';
    private string $lastName = '';

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }
        foreach (['personnel', 'prefixes', 'supportive_experience'] as $table) {
            if (!self::$pdo->query("SHOW TABLES LIKE '{$table}'")->fetchColumn()) {
                self::markTestSkipped("ไม่พบตาราง {$table}");
            }
        }

        $suffix = bin2hex(random_bytes(3));
        $this->prefixCode = 'T' . $suffix;
        $this->firstName = 'NamePF' . $suffix;
        $this->lastName = 'LastPF' . $suffix;

        self::$pdo->prepare(
            'INSERT INTO prefixes (prefix_code, prefix_name_th) VALUES (?, ?)'
        )->execute([$this->prefixCode, 'นาย']);
        $this->prefixId = (int) self::$pdo->lastInsertId();

        self::$pdo->prepare(
            'INSERT INTO personnel (first_name, last_name, prefix_id, is_active) VALUES (?, ?, ?, 1)'
        )->execute([$this->firstName, $this->lastName, $this->prefixId]);
        $this->personnelId = (int) self::$pdo->lastInsertId();

        $_GET = [];
        http_response_code(200);
    }

    protected function tearDown(): void
    {
        if (self::$pdo === null) {
            return;
        }
        if ($this->personnelId) {
            self::$pdo->prepare('DELETE FROM supportive_experience WHERE personnel_id = ?')
                ->execute([$this->personnelId]);
            self::$pdo->prepare('DELETE FROM personnel WHERE personnel_id = ?')
                ->execute([$this->personnelId]);
        }
        if ($this->prefixId) {
            self::$pdo->prepare('DELETE FROM prefixes WHERE prefix_id = ?')
                ->execute([$this->prefixId]);
        }
        $_GET = [];
    }

    private function expectedFullName(): string
    {
        return 'นาย' . $this->firstName . ' ' . $this->lastName;
    }

    #[Test]
    public function personnel_search_sql_includes_thai_prefix(): void
    {
        $stmt = self::$pdo->prepare(
            "SELECT CONCAT(COALESCE(px.prefix_name_th COLLATE utf8mb4_unicode_ci, ''), p.first_name, ' ', p.last_name) AS full_name
             FROM personnel p
             LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id
             WHERE p.personnel_id = ?"
        );
        $stmt->execute([$this->personnelId]);
        $fullName = $stmt->fetchColumn();

        self::assertSame($this->expectedFullName(), $fullName);
    }

    #[Test]
    public function supportive_list_full_name_includes_thai_prefix(): void
    {
        self::$pdo->prepare(
            'INSERT INTO supportive_experience (personnel_id, job_series_name, start_date, end_date)
             VALUES (?, ?, ?, ?)'
        )->execute([$this->personnelId, 'HR-series', '2020-01-01', '2021-01-01']);

        $_GET = ['search' => $this->firstName, 'limit' => 50, 'offset' => 0];
        ob_start();
        try {
            getSupportiveList(self::$pdo);
            $response = json_decode((string) ob_get_clean(), true) ?? [];
        } catch (Throwable $e) {
            if (ob_get_level() > 0) {
                ob_end_clean();
            }
            throw $e;
        }

        self::assertTrue($response['success'] ?? false);
        self::assertGreaterThanOrEqual(1, (int) ($response['pagination']['total'] ?? 0));
        self::assertSame($this->expectedFullName(), $response['data'][0]['full_name'] ?? null);
    }

    #[Test]
    public function null_prefix_still_returns_name_without_null_concat(): void
    {
        self::$pdo->prepare('UPDATE personnel SET prefix_id = NULL WHERE personnel_id = ?')
            ->execute([$this->personnelId]);

        $stmt = self::$pdo->prepare(
            "SELECT CONCAT(COALESCE(px.prefix_name_th COLLATE utf8mb4_unicode_ci, ''), p.first_name, ' ', p.last_name) AS full_name
             FROM personnel p
             LEFT JOIN prefixes px ON p.prefix_id = px.prefix_id
             WHERE p.personnel_id = ?"
        );
        $stmt->execute([$this->personnelId]);
        $fullName = $stmt->fetchColumn();

        self::assertSame($this->firstName . ' ' . $this->lastName, $fullName);
    }
}
