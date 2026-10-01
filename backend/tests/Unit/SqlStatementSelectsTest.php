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
            'show tables' => ['SHOW TABLES', true],
            'describe table' => ['DESCRIBE t', true],
            'desc shorthand lowercase' => ['desc t', true],
            'explain query' => ['EXPLAIN SELECT 1', true],
            'with cte select' => ['WITH x AS (SELECT 1) SELECT * FROM x', true],
            'values row constructor' => ['VALUES ROW(1,2)', true],
            'leading comment then show' => ["-- c\nSHOW TABLES", true],
            'stacked leading comments then select' => ["-- a\n/* b */\nSELECT 1", true],
            'with non-select tail still classifies true' => ['WITH x AS (SELECT 1) UPDATE t SET a=1', true],
            'set names' => ['SET NAMES utf8mb4', false],
            'insert with values clause' => ['INSERT INTO t VALUES (1)', false],
            'create view containing select' => ['CREATE VIEW v AS SELECT 1', false],
            'select-word inside leading comment then alter' => ['/* SELECT */ ALTER TABLE t ADD COLUMN c INT', false],
        ];
    }
}
