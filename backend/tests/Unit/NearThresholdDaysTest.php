<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use QualificationEngine;

/**
 * Contract: FE CANDIDATE_NEAR_THRESHOLD_DAYS and engine near window stay at 90.
 * (See CONTEXT.md — วันใกล้เกณฑ์)
 */
final class NearThresholdDaysTest extends TestCase
{
    #[Test]
    public function candidate_near_threshold_is_ninety_days(): void
    {
        self::assertSame(90, QualificationEngine::NEAR_THRESHOLD_DAYS);
    }
}
