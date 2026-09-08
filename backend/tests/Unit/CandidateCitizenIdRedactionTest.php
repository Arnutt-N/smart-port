<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/personnel.php';
require_once __DIR__ . '/../../routes/candidates.php';

/**
 * T1 / N1 — candidate detail ต้อง redact citizen_id ใน data สำหรับ non-admin
 * อย่าใส่เลขบัตรจริงใน fixture
 */
final class CandidateCitizenIdRedactionTest extends TestCase
{
    #[Test]
    public function helper_omits_citizen_id_for_operator_keeps_for_admin(): void
    {
        $row = ['citizen_id' => 'x', 'personnel_id' => 1];

        $operator = redactPersonnelCitizenIdForRole($row, 'operator');
        self::assertArrayNotHasKey('citizen_id', $operator);

        $admin = redactPersonnelCitizenIdForRole($row, 'admin');
        self::assertSame('x', $admin['citizen_id']);
    }

    #[Test]
    public function redact_applies_to_envelope_data_not_top_level(): void
    {
        $env = ['success' => true, 'data' => ['citizen_id' => 'x']];
        $env['data'] = redactPersonnelCitizenIdForRole($env['data'], 'viewer');
        self::assertArrayNotHasKey('citizen_id', $env['data']);
        self::assertArrayNotHasKey('citizen_id', $env);
    }

    #[Test]
    public function candidates_route_redacts_result_data_and_includes_personnel(): void
    {
        $src = file_get_contents(__DIR__ . '/../../routes/candidates.php');
        self::assertIsString($src);
        self::assertStringContainsString("redactPersonnelCitizenIdForRole(\$result['data']", $src);
        self::assertMatchesRegularExpression('/include_once\s+[^;]*personnel\\.php/', $src);
    }
}
