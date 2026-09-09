<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/supportive.php';
require_once __DIR__ . '/../../routes/equivalence.php';
require_once __DIR__ . '/../../routes/diverse.php';

/**
 * N39 — create ของ supportive/equivalence/diverse ต้อง pre-check personnelExists
 * (pattern เดียวกับ probation/multiplier) — personnel ไม่มีจริงต้องตอบ 404 ไม่ใช่
 * INSERT แล้ว FK ระเบิดเป็น 500
 *
 * 404 path เกิดก่อน INSERT เสมอ จึงต้องการแค่ตาราง personnel ว่าง ๆ
 */
final class CreatePersonnelPrecheckTest extends TestCase
{
    private function emptyPersonnelPdo(): ?PDO
    {
        if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            return null;
        }
        $pdo = new PDO('sqlite::memory:');
        $pdo->exec('CREATE TABLE personnel (personnel_id INTEGER PRIMARY KEY)');
        return $pdo;
    }

    #[Test]
    public function create_supportive_returns_404_for_missing_personnel(): void
    {
        $pdo = $this->emptyPersonnelPdo();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        http_response_code(200);
        ob_start();
        createSupportive($pdo, ['user_id' => 1], [
            'personnel_id' => 999,
            'job_series_name' => 'ทรัพยากรบุคคล',
            'start_date' => '2024-01-01',
            'end_date' => '2024-12-31',
        ]);
        json_decode((string) ob_get_clean(), true);

        self::assertSame(404, http_response_code());
    }

    #[Test]
    public function create_equivalence_returns_404_for_missing_personnel(): void
    {
        $pdo = $this->emptyPersonnelPdo();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        http_response_code(200);
        ob_start();
        createEquivalence($pdo, ['user_id' => 1], [
            'personnel_id' => 999,
            'actual_position' => 'นักวิชาการ',
            'equivalent_type' => 'ทางวิชาการ',
        ]);
        json_decode((string) ob_get_clean(), true);

        self::assertSame(404, http_response_code());
    }

    #[Test]
    public function create_diverse_returns_404_for_missing_personnel(): void
    {
        $pdo = $this->emptyPersonnelPdo();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        http_response_code(200);
        ob_start();
        createDiverse($pdo, ['user_id' => 1], ['personnel_id' => 999]);
        json_decode((string) ob_get_clean(), true);

        self::assertSame(404, http_response_code());
    }
}
