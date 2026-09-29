<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../scripts/migration-lib.php';

final class ExecuteMigrationStatementTest extends TestCase
{
    #[Test]
    public function it_drains_select_and_logs_pre_check_output(): void
    {
        $stmt = self::createMock(\PDOStatement::class);
        $stmt->method('fetchAll')->with(\PDO::FETCH_ASSOC)->willReturn([
            ['soft_link' => 'awards.personnel_id', 'orphans' => 0],
        ]);
        $stmt->expects(self::once())->method('closeCursor');

        $pdo = self::createMock(\PDO::class);
        $pdo->expects(self::once())->method('query')->with('SELECT 1')->willReturn($stmt);
        $pdo->expects(self::never())->method('exec');

        $this->expectOutputString('  pre-check: awards.personnel_id orphans=0' . PHP_EOL);

        executeMigrationStatement($pdo, 'SELECT 1');
    }

    #[Test]
    public function it_calls_exec_for_non_select_statements_without_output(): void
    {
        $pdo = self::createMock(\PDO::class);
        $pdo->expects(self::once())->method('exec')->with('ALTER TABLE t ADD COLUMN c INT')->willReturn(0);
        $pdo->expects(self::never())->method('query');

        $this->expectOutputString('');

        executeMigrationStatement($pdo, 'ALTER TABLE t ADD COLUMN c INT');
    }

    #[Test]
    public function it_handles_query_returning_false_safely_without_throwing(): void
    {
        $pdo = self::createMock(\PDO::class);
        $pdo->expects(self::once())->method('query')->with('SELECT 1')->willReturn(false);

        $this->expectOutputString('');

        executeMigrationStatement($pdo, 'SELECT 1');
    }

    #[Test]
    public function it_skips_logging_when_row_is_not_an_array(): void
    {
        $stmt = self::createMock(\PDOStatement::class);
        $stmt->method('fetchAll')->with(\PDO::FETCH_ASSOC)->willReturn([0]);
        $stmt->expects(self::once())->method('closeCursor');

        $pdo = self::createMock(\PDO::class);
        $pdo->expects(self::once())->method('query')->willReturn($stmt);

        $this->expectOutputString('');

        executeMigrationStatement($pdo, 'SELECT 1');
    }

    #[Test]
    public function it_logs_fallback_keys_when_row_array_is_missing_expected_keys(): void
    {
        $stmt = self::createMock(\PDOStatement::class);
        $stmt->method('fetchAll')->with(\PDO::FETCH_ASSOC)->willReturn([[]]);
        $stmt->expects(self::once())->method('closeCursor');

        $pdo = self::createMock(\PDO::class);
        $pdo->expects(self::once())->method('query')->willReturn($stmt);

        $this->expectOutputString('  pre-check: (unknown) orphans=?' . PHP_EOL);

        executeMigrationStatement($pdo, 'SELECT 1');
    }
}
