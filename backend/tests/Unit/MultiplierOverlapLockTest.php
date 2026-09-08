<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/multiplier.php';

/**
 * N13 — overlap ของ multiplier_experience ต้องล็อกแถวบุคคลก่อน COUNT
 * (anti-drift บนซอร์ส ไม่รัน concurrent HTTP)
 */
final class MultiplierOverlapLockTest extends TestCase
{
    #[Test]
    public function personnel_lock_sql_uses_for_update(): void
    {
        self::assertStringContainsString('FOR UPDATE', MULTIPLIER_PERSONNEL_LOCK_SQL);
        self::assertStringContainsString('FROM personnel', MULTIPLIER_PERSONNEL_LOCK_SQL);
    }

    #[Test]
    public function overlap_sql_has_no_for_update_on_experience(): void
    {
        self::assertStringNotContainsString('FOR UPDATE', MULTIPLIER_OVERLAP_SQL);
        self::assertStringContainsString('FROM multiplier_experience', MULTIPLIER_OVERLAP_SQL);
    }

    #[Test]
    public function create_locks_then_checks_overlap_inside_transaction(): void
    {
        $src = file_get_contents(__DIR__ . '/../../routes/multiplier.php');
        self::assertIsString($src);
        $start = strpos($src, 'function createMultiplier(');
        self::assertNotFalse($start);
        $end = strpos($src, 'function fetchAreaRow', $start);
        self::assertNotFalse($end);
        $fn = substr($src, $start, $end - $start);
        self::assertStringContainsString('beginTransaction', $fn);
        self::assertStringContainsString('MULTIPLIER_PERSONNEL_LOCK_SQL', $fn);
        self::assertLessThan(
            strpos($fn, 'MULTIPLIER_OVERLAP_SQL'),
            strpos($fn, 'MULTIPLIER_PERSONNEL_LOCK_SQL'),
            'personnel lock must run before overlap count'
        );
        self::assertGreaterThan(
            strpos($fn, 'beginTransaction'),
            strpos($fn, 'commit'),
            'commit must follow beginTransaction'
        );
    }

    #[Test]
    public function update_locks_then_checks_overlap_inside_transaction(): void
    {
        $src = file_get_contents(__DIR__ . '/../../routes/multiplier.php');
        self::assertIsString($src);
        $start = strpos($src, 'function updateMultiplier(');
        self::assertNotFalse($start);
        $fn = substr($src, $start);
        self::assertStringContainsString('beginTransaction', $fn);
        self::assertStringContainsString('MULTIPLIER_PERSONNEL_LOCK_SQL', $fn);
        self::assertLessThan(
            strpos($fn, 'MULTIPLIER_OVERLAP_EXCLUDE_SQL'),
            strpos($fn, 'MULTIPLIER_PERSONNEL_LOCK_SQL')
        );
    }
}
