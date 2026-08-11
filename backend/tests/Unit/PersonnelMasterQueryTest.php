<?php
declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../helpers.php';
require_once __DIR__ . '/../../routes/personnel.php';

/**
 * Unit: validation + list/typeahead mode helpers (ไม่มี DB)
 */
final class PersonnelMasterQueryTest extends TestCase
{
    #[Test]
    public function citizen_id_must_be_exactly_13_digits(): void
    {
        self::assertTrue(isValidCitizenId('1234567890123'));
        self::assertFalse(isValidCitizenId('123456789012'));
        self::assertFalse(isValidCitizenId('12345678901234'));
        self::assertFalse(isValidCitizenId('123456789012a'));
        self::assertFalse(isValidCitizenId(''));
    }

    #[Test]
    public function master_select_includes_identity_and_org_columns(): void
    {
        $sql = personnelMasterSelectSql();
        self::assertStringContainsString('p.citizen_id', $sql);
        self::assertStringContainsString('p.employee_id', $sql);
        self::assertStringContainsString('p.is_active', $sql);
        self::assertStringContainsString('position_name', $sql);
        self::assertStringContainsString('org_name', $sql);
    }
}
