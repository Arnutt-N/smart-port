<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/probation.php';

/**
 * N14 — PUT /probation/{id} ต้อง whitelist overall_status และเช็ค end≥start
 * (รวมค่าเดิมเมื่อส่งมาแค่ฝั่งเดียว) และห้ามเปิด CANCELLED กลับ
 */
final class ProbationUpdateValidationTest extends TestCase
{
    /** @return array{overall_status: string, start_date: string, end_date: string} */
    private static function existing(): array
    {
        return [
            'overall_status' => 'IN_PROGRESS',
            'start_date' => '2026-01-01',
            'end_date' => '2026-07-01',
        ];
    }

    /** @return array<string, array{string}> */
    public static function allowedStatusProvider(): array
    {
        return [
            'IN_PROGRESS' => ['IN_PROGRESS'],
            'COMPLETED' => ['COMPLETED'],
            'FAILED' => ['FAILED'],
            'EXTENDED' => ['EXTENDED'],
        ];
    }

    #[Test]
    #[DataProvider('allowedStatusProvider')]
    public function allowed_overall_status_has_no_error(string $status): void
    {
        self::assertNull(probationUpdateValidationError(
            ['overall_status' => $status],
            self::existing()
        ));
    }

    #[Test]
    public function unknown_overall_status_is_invalid(): void
    {
        self::assertSame(
            'Invalid overall_status',
            probationUpdateValidationError(['overall_status' => 'HACKED'], self::existing())
        );
    }

    #[Test]
    public function empty_overall_status_is_invalid(): void
    {
        self::assertSame(
            'Invalid overall_status',
            probationUpdateValidationError(['overall_status' => ''], self::existing())
        );
    }

    #[Test]
    public function cancelled_enrollment_cannot_reopen(): void
    {
        $existing = self::existing();
        $existing['overall_status'] = 'CANCELLED';
        self::assertSame(
            'Cancelled enrollment cannot be reopened',
            probationUpdateValidationError(['overall_status' => 'IN_PROGRESS'], $existing)
        );
    }

    #[Test]
    public function cancelled_enrollment_cannot_update_other_fields(): void
    {
        $existing = self::existing();
        $existing['overall_status'] = 'CANCELLED';
        self::assertSame(
            'Cancelled enrollment cannot be reopened',
            probationUpdateValidationError(['remarks' => 'note'], $existing)
        );
    }

    #[Test]
    public function put_cannot_set_cancelled(): void
    {
        self::assertSame(
            'Invalid overall_status',
            probationUpdateValidationError(['overall_status' => 'CANCELLED'], self::existing())
        );
    }

    #[Test]
    public function inverted_dates_in_payload_are_rejected(): void
    {
        self::assertSame(
            'end_date must be greater than or equal to start_date',
            probationUpdateValidationError(
                ['start_date' => '2026-12-31', 'end_date' => '2026-01-01'],
                self::existing()
            )
        );
    }

    #[Test]
    public function end_date_alone_must_not_precede_existing_start(): void
    {
        self::assertSame(
            'end_date must be greater than or equal to start_date',
            probationUpdateValidationError(['end_date' => '2025-12-01'], self::existing())
        );
    }

    #[Test]
    public function start_date_alone_must_not_follow_existing_end(): void
    {
        self::assertSame(
            'end_date must be greater than or equal to start_date',
            probationUpdateValidationError(['start_date' => '2026-12-01'], self::existing())
        );
    }

    #[Test]
    public function empty_start_date_in_payload_is_rejected(): void
    {
        self::assertSame(
            'Invalid date format',
            probationUpdateValidationError(['start_date' => ''], self::existing())
        );
    }

    #[Test]
    public function unpadded_end_date_is_rejected(): void
    {
        self::assertSame(
            'Invalid date format',
            probationUpdateValidationError(['end_date' => '2026-1-5'], self::existing())
        );
    }

    #[Test]
    public function overflow_end_date_is_rejected(): void
    {
        self::assertSame(
            'Invalid date format',
            probationUpdateValidationError(['end_date' => '2026-02-30'], self::existing())
        );
    }

    #[Test]
    public function datetime_suffix_end_date_is_rejected(): void
    {
        self::assertSame(
            'Invalid date format',
            probationUpdateValidationError(['end_date' => '2026-01-01 00:00'], self::existing())
        );
    }

    #[Test]
    public function equal_dates_are_allowed(): void
    {
        self::assertNull(probationUpdateValidationError(
            ['start_date' => '2026-01-15', 'end_date' => '2026-01-15'],
            self::existing()
        ));
    }

    #[Test]
    public function remarks_only_skips_status_and_keeps_existing_range(): void
    {
        self::assertNull(probationUpdateValidationError(
            ['remarks' => 'note'],
            self::existing()
        ));
    }

    #[Test]
    public function update_source_calls_validator(): void
    {
        $src = file_get_contents(__DIR__ . '/../../routes/probation.php');
        self::assertIsString($src);
        $start = strpos($src, 'function updateProbationEnrollment');
        self::assertNotFalse($start);
        $end = strpos($src, 'function deleteProbationEnrollment', $start);
        self::assertNotFalse($end);
        $fn = substr($src, $start, $end - $start);
        self::assertStringContainsString('probationUpdateValidationError(', $fn);
        self::assertStringContainsString('http_response_code(400)', $fn);
    }
}
