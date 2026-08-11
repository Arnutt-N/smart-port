<?php
declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../helpers.php';
require_once __DIR__ . '/../../routes/personnel.php';

/**
 * Regression: typeahead /personnel ต้องค้นชื่อเต็มได้ และห้าม bind LIMIT เป็น ?
 * (ATTR_EMULATE_PREPARES=false ทำให้ LIMIT ? พัง → API error → FE กลืนแล้วเห็นรายการว่าง)
 */
final class PersonnelTypeaheadQueryTest extends TestCase
{
    #[Test]
    public function sql_interpolates_clamped_limit_instead_of_placeholder(): void
    {
        $sql = personnelTypeaheadSql(10);

        self::assertStringContainsString('LIMIT 10', $sql);
        self::assertStringNotContainsString('LIMIT ?', $sql);
    }

    #[Test]
    public function sql_clamps_limit_to_safe_range(): void
    {
        self::assertStringContainsString('LIMIT 1', personnelTypeaheadSql(0));
        self::assertStringContainsString('LIMIT 50', personnelTypeaheadSql(999));
    }

    #[Test]
    public function sql_matches_full_name_employee_id_and_citizen_id(): void
    {
        $sql = personnelTypeaheadSql(10);

        self::assertStringContainsString('p.first_name LIKE ?', $sql);
        self::assertStringContainsString('p.last_name LIKE ?', $sql);
        self::assertStringContainsString('p.citizen_id LIKE ?', $sql);
        self::assertStringContainsString('p.employee_id LIKE ?', $sql);
        self::assertStringContainsString('prefix_name_th', $sql);
        // full_name expression used in WHERE (not only SELECT)
        self::assertGreaterThanOrEqual(
            2,
            substr_count($sql, 'prefix_name_th'),
            'ต้องใช้ full_name ทั้งใน SELECT และ WHERE เพื่อให้พิมพ์ชื่อเต็มแล้วเจอ'
        );
    }

    #[Test]
    public function search_rejects_queries_shorter_than_two_chars_without_db(): void
    {
        $pdo = new \PDO('sqlite::memory:');
        self::assertSame([], searchPersonnelTypeahead($pdo, 'ก', 10));
        self::assertSame([], searchPersonnelTypeahead($pdo, ' ', 10));
    }
}
