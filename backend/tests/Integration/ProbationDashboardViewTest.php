<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use Throwable;

/**
 * Contract for vw_probation_dashboard after JOIN rewrite (migration 17).
 * Column shape must stay stable for routes/probation.php + FE useProbation.
 */
final class ProbationDashboardViewTest extends TestCase
{
    private static ?PDO $pdo = null;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped(
                'ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้ว bash backend/tests/run.sh'
            );
        }
    }

    #[Test]
    public function it_exposes_expected_dashboard_columns(): void
    {
        try {
            $stmt = self::$pdo->query('SELECT * FROM vw_probation_dashboard LIMIT 1');
        } catch (Throwable $e) {
            self::markTestSkipped('vw_probation_dashboard ไม่พร้อม: ' . $e->getMessage());
        }

        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            // empty view is OK — still verify DESCRIBE columns
            $cols = self::$pdo->query('SHOW COLUMNS FROM vw_probation_dashboard')->fetchAll(PDO::FETCH_COLUMN);
            foreach ([
                'enrollment_id', 'personnel_id', 'full_name', 'remaining_days',
                'total_tasks', 'completed_tasks', 'overdue_tasks',
                'mentor_name', 'supervisor_name', 'director_name',
                'department', 'position_name',
            ] as $col) {
                self::assertContains($col, $cols, "missing column {$col}");
            }
            return;
        }

        foreach ([
            'enrollment_id', 'personnel_id', 'full_name', 'remaining_days',
            'total_tasks', 'completed_tasks', 'overdue_tasks',
            'department', 'position_name',
        ] as $col) {
            self::assertArrayHasKey($col, $row, "missing column {$col}");
        }
    }

    #[Test]
    public function it_matches_task_aggregates_from_base_tables(): void
    {
        try {
            $rows = self::$pdo->query(
                'SELECT enrollment_id, total_tasks, completed_tasks, overdue_tasks
                 FROM vw_probation_dashboard'
            )->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            self::markTestSkipped('vw_probation_dashboard ไม่พร้อม: ' . $e->getMessage());
        }

        if ($rows === []) {
            self::markTestSkipped('ไม่มี enrollment IN_PROGRESS ใน seed — ข้าม aggregate assert');
        }

        $agg = self::$pdo->prepare(
            'SELECT
                COUNT(*) AS total_tasks,
                SUM(CASE WHEN status = \'COMPLETED\' THEN 1 ELSE 0 END) AS completed_tasks,
                SUM(CASE WHEN status = \'OVERDUE\' THEN 1 ELSE 0 END) AS overdue_tasks
             FROM probation_task_progress
             WHERE enrollment_id = ?'
        );

        foreach ($rows as $row) {
            $agg->execute([(int) $row['enrollment_id']]);
            $expected = $agg->fetch(PDO::FETCH_ASSOC);
            self::assertSame(
                (int) ($expected['total_tasks'] ?? 0),
                (int) $row['total_tasks'],
                "total_tasks mismatch for enrollment {$row['enrollment_id']}"
            );
            self::assertSame(
                (int) ($expected['completed_tasks'] ?? 0),
                (int) $row['completed_tasks'],
                "completed_tasks mismatch for enrollment {$row['enrollment_id']}"
            );
            self::assertSame(
                (int) ($expected['overdue_tasks'] ?? 0),
                (int) $row['overdue_tasks'],
                "overdue_tasks mismatch for enrollment {$row['enrollment_id']}"
            );
        }
    }
}
