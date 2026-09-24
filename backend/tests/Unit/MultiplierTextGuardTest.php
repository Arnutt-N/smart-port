<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/multiplier.php';

/**
 * T12 — multiplier text guards: validateMultiplierTextFields() + wiring ใน
 * create/update (sqlite เปล่าไม่มีตาราง — ถ้า guard พลาด SQL จะระเบิดแทน 400)
 */
final class MultiplierTextGuardTest extends TestCase
{
    protected function tearDown(): void
    {
        http_response_code(200);
    }

    #[Test]
    public function non_string_proof_or_description_is_rejected(): void
    {
        $err = validateMultiplierTextFields(['proof_reference' => ['not', 'a', 'string']]);
        self::assertNotNull($err);
        self::assertStringContainsString('proof_reference', $err);

        $err = validateMultiplierTextFields(['description' => ['x' => 1]]);
        self::assertNotNull($err);
        self::assertStringContainsString('description', $err);
    }

    #[Test]
    public function overlong_proof_reference_is_rejected(): void
    {
        $err = validateMultiplierTextFields(['proof_reference' => str_repeat('ก', 501)]);
        self::assertNotNull($err);
        self::assertStringContainsString('ไม่เกิน', $err);
    }

    #[Test]
    public function boundary_and_absent_values_pass(): void
    {
        self::assertNull(validateMultiplierTextFields([]));
        self::assertNull(validateMultiplierTextFields(['proof_reference' => null]));
        self::assertNull(validateMultiplierTextFields(['proof_reference' => str_repeat('ก', 500)]));
        // description เป็น TEXT — ยาวเท่าไหร่ก็ได้ (แค่ต้องเป็น string)
        self::assertNull(validateMultiplierTextFields(['description' => str_repeat('x', 70000)]));
    }

    #[Test]
    public function create_wiring_rejects_before_any_sql(): void
    {
        $pdo = $this->bareSqlite();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        http_response_code(200);
        ob_start();
        createMultiplier($pdo, [], [
            'personnel_id' => 1,
            'area_multiplier_id' => 2,
            'start_date' => '2024-01-01',
            'end_date' => '2024-12-31',
            'proof_reference' => ['array-instead-of-string'],
        ]);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(400, http_response_code());
        self::assertStringContainsString('proof_reference', (string) ($body['error'] ?? ''));
    }

    #[Test]
    public function update_wiring_rejects_before_any_sql(): void
    {
        $pdo = $this->bareSqlite();
        if ($pdo === null) {
            self::markTestSkipped('pdo_sqlite not available');
        }

        http_response_code(200);
        ob_start();
        updateMultiplier($pdo, 1, [], ['description' => ['nested' => 'nope']]);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(400, http_response_code());
        self::assertStringContainsString('description', (string) ($body['error'] ?? ''));
    }

    private function bareSqlite(): ?PDO
    {
        if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            return null;
        }
        $pdo = new PDO('sqlite::memory:');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $pdo;
    }
}
