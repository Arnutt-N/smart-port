<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../scripts/migration-lib.php';

final class SplitSqlStatementsTest extends TestCase
{
    #[Test]
    public function does_not_split_on_semicolon_inside_line_comment(): void
    {
        $sql = <<<'SQL'
-- (local MySQL has FK; TiDB does not — keep order for MySQL)
DROP TABLE IF EXISTS screening_list;
DROP TABLE IF EXISTS civil_servants;
SQL;

        $parts = splitSqlStatements($sql);

        self::assertCount(2, $parts);
        self::assertStringContainsString('DROP TABLE IF EXISTS screening_list', $parts[0]);
        self::assertStringContainsString('DROP TABLE IF EXISTS civil_servants', $parts[1]);
        // คอมเมนต์บรรทัดบนอาจติดมากับ statement แรกได้ — สำคัญคือไม่ถูกตัดเป็น statement แยก
        self::assertDoesNotMatchRegularExpression('/^\s*TiDB\b/m', $parts[0]);
        self::assertDoesNotMatchRegularExpression('/^\s*TiDB\b/m', $parts[1]);
    }

    #[Test]
    public function skips_comment_only_chunks(): void
    {
        $sql = "-- only a comment\n\n# also a comment\n";
        self::assertSame([], splitSqlStatements($sql));
    }

    #[Test]
    public function keeps_semicolon_inside_string_literal(): void
    {
        $sql = "INSERT INTO t (note) VALUES ('a; b');\nSELECT 1;";
        $parts = splitSqlStatements($sql);
        self::assertCount(2, $parts);
        self::assertStringContainsString("'a; b'", $parts[0]);
    }
}
