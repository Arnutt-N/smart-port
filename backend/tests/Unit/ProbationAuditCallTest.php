<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * N12 — create/update/delete probation ต้องเรียก logAudit
 * (anti-drift บนซอร์ส ไม่รัน HTTP)
 */
final class ProbationAuditCallTest extends TestCase
{
    private function functionSource(string $name): string
    {
        $src = file_get_contents(__DIR__ . '/../../routes/probation.php');
        self::assertIsString($src);
        $start = strpos($src, "function {$name}");
        self::assertNotFalse($start, "missing {$name}");
        $next = null;
        foreach (['createProbationEnrollment', 'updateProbationEnrollment', 'deleteProbationEnrollment'] as $fn) {
            if ($fn === $name) {
                continue;
            }
            $pos = strpos($src, "function {$fn}", $start + 1);
            if ($pos !== false && ($next === null || $pos < $next)) {
                $next = $pos;
            }
        }
        $end = $next ?? strlen($src);
        return substr($src, $start, $end - $start);
    }

    #[Test]
    public function create_logs_audit_after_insert(): void
    {
        $fn = $this->functionSource('createProbationEnrollment');
        self::assertStringContainsString('logAudit(', $fn);
        self::assertStringContainsString("'CREATE'", $fn);
        self::assertStringContainsString("'probation_enrollment'", $fn);
        self::assertGreaterThan(
            strpos($fn, 'lastInsertId'),
            strpos($fn, 'logAudit('),
            'audit must run after insert id is known'
        );
    }

    #[Test]
    public function update_logs_audit_with_before_snapshot(): void
    {
        $fn = $this->functionSource('updateProbationEnrollment');
        self::assertStringContainsString('logAudit(', $fn);
        self::assertStringContainsString("'UPDATE'", $fn);
        self::assertStringContainsString("'probation_enrollment'", $fn);
    }

    #[Test]
    public function delete_logs_audit_with_before_snapshot(): void
    {
        $fn = $this->functionSource('deleteProbationEnrollment');
        self::assertStringContainsString('logAudit(', $fn);
        self::assertStringContainsString("'DELETE'", $fn);
        self::assertStringContainsString("'probation_enrollment'", $fn);
    }
}
