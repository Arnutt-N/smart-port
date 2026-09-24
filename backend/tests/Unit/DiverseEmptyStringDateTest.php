<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/diverse.php';

/**
 * T2.4-R7 — direct-call: update-diverse normalize '' → null โดยไม่ใช้ trim
 * (ของเดิมใน DiverseDateFieldTest เป็นแค่ source-assert — test นี้พิสูจน์พฤติกรรมจริง)
 */
final class DiverseEmptyStringDateTest extends TestCase
{
    private function seededPdo(): ?PDO
    {
        if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            return null;
        }
        $pdo = new PDO('sqlite::memory:');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec('CREATE TABLE diverse_experience (
            experience_id INTEGER PRIMARY KEY,
            personnel_id INTEGER,
            from_job_series TEXT, from_work_group TEXT, from_division TEXT,
            from_org_id INTEGER, from_province TEXT,
            from_start_date TEXT, from_end_date TEXT,
            to_job_series TEXT, to_work_group TEXT, to_division TEXT,
            to_org_id INTEGER, to_province TEXT,
            to_start_date TEXT, to_end_date TEXT,
            is_diff_job_series INTEGER DEFAULT 0, is_diff_org INTEGER DEFAULT 0,
            is_diff_location INTEGER DEFAULT 0, is_diff_work_nature INTEGER DEFAULT 0,
            from_total_days INTEGER, to_total_days INTEGER, qualified_date TEXT
        )');
        $pdo->exec('CREATE TABLE audit_log (
            log_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER, action TEXT, table_name TEXT, record_id INTEGER,
            before_value TEXT, after_value TEXT, ip_address TEXT, user_agent TEXT
        )');
        $pdo->exec("INSERT INTO diverse_experience
            (experience_id, personnel_id, from_job_series, from_start_date, from_end_date)
            VALUES (1, 1, 'วิชาการ', '2020-01-01', '2020-12-31')");
        return $pdo;
    }

    #[Test]
    public function empty_string_date_is_stored_as_null(): void
    {
        $pdo = $this->seededPdo();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        http_response_code(200);
        ob_start();
        updateDiverse($pdo, 1, ['user_id' => 1], ['from_start_date' => '']);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(200, http_response_code());
        self::assertTrue($body['success'] ?? false);
        $stored = $pdo->query('SELECT from_start_date FROM diverse_experience WHERE experience_id = 1')
            ->fetchColumn();
        self::assertNull($stored);
    }

    #[Test]
    public function whitespace_date_is_rejected_without_trimming(): void
    {
        $pdo = $this->seededPdo();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        http_response_code(200);
        ob_start();
        updateDiverse($pdo, 1, ['user_id' => 1], ['from_start_date' => ' ']);
        $body = json_decode((string) ob_get_clean(), true);

        // ถ้ามี trim แอบอยู่ ' ' จะกลายเป็น '' → null → 200; ต้อง 400 เท่านั้น
        self::assertSame(400, http_response_code());
        self::assertSame('รูปแบบวันที่ไม่ถูกต้อง', $body['error'] ?? null);
        $stored = $pdo->query('SELECT from_start_date FROM diverse_experience WHERE experience_id = 1')
            ->fetchColumn();
        self::assertSame('2020-01-01', $stored);
    }
}
