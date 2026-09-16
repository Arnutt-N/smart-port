<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/work_results.php';

/** N17-style — payload ของผลงานต้องเข้มเรื่องวันที่ / enum / personnel_id */
final class WorkResultValidationTest extends TestCase
{
    private function core(array $extra = []): array
    {
        return array_merge([
            'personnel_id' => 1,
            'title' => 'ผลงานทดสอบ',
            'submission_date' => '2024-06-01',
        ], $extra);
    }

    #[Test]
    public function missing_core_fields_are_rejected(): void
    {
        [, $err] = validateWorkResultPayload([], true);
        self::assertNotNull($err);
    }

    #[Test]
    public function malformed_submission_date_is_rejected(): void
    {
        [, $err] = validateWorkResultPayload($this->core(['submission_date' => 'not-a-date']), true);
        self::assertSame('รูปแบบวันที่ไม่ถูกต้อง', $err);
    }

    #[Test]
    public function overflow_submission_date_is_rejected(): void
    {
        [, $err] = validateWorkResultPayload($this->core(['submission_date' => '2026-02-30']), true);
        self::assertSame('รูปแบบวันที่ไม่ถูกต้อง', $err);
    }

    #[Test]
    public function canonical_submission_date_is_allowed(): void
    {
        [, $err] = validateWorkResultPayload($this->core(), true);
        self::assertNull($err);
    }

    #[Test]
    public function blank_submission_date_rejected_on_create_allowed_on_update_as_missing(): void
    {
        [, $errCreate] = validateWorkResultPayload($this->core(['submission_date' => '']), true);
        self::assertNotNull($errCreate);

        [, $errUpdate] = validateWorkResultPayload(['title' => 'x'], false);
        self::assertNull($errUpdate);
    }

    #[Test]
    public function bogus_type_and_status_are_rejected(): void
    {
        [, $errType] = validateWorkResultPayload($this->core(['proposal_type' => 'bogus']), true);
        self::assertSame('ประเภทผลงานไม่ถูกต้อง', $errType);

        [, $errStatus] = validateWorkResultPayload($this->core(['status' => 'bogus']), true);
        self::assertSame('สถานะไม่ถูกต้อง', $errStatus);
    }

    #[Test]
    public function non_int_personnel_id_is_rejected(): void
    {
        [, $err] = validateWorkResultPayload($this->core(['personnel_id' => [1]]), true);
        self::assertSame('รูปแบบข้อมูลไม่ถูกต้อง', $err);
    }
}
