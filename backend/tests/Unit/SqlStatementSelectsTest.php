<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../scripts/migration-lib.php';

final class SqlStatementSelectsTest extends TestCase
{
    #[Test]
    #[DataProvider('provideStatements')]
    public function it_identifies_select_statements_correctly(string $sql, bool $expected): void
    {
        self::assertSame($expected, sqlStatementSelects($sql));
    }

    /**
     * @return array<string, array{string, bool}>
     */
    public static function provideStatements(): array
    {
        return [
            'pure select' => ['SELECT 1', true],
            'lowercase with leading spaces' => ['  select 1', true],
            'leading dash dash comment' => ["-- ---- T-D4.2 pre-check\nSELECT 1", true],
            'leading block comment' => ['/* x */ SELECT 1', true],
            'leading hash comment' => ["# c\nSELECT 1", true],
            'alter table' => ['ALTER TABLE x ADD COLUMN y', false],
            'update table' => ['UPDATE t SET a=1', false],
            'comment only' => ['-- comment only', false],
            'empty string' => ['', false],
            'whitespace only' => ['   ', false],
            'unterminated block comment' => ['/* unterminated', false],
        ];
    }
}
