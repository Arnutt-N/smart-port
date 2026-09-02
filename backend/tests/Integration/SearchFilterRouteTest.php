<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

putenv('JWT_SECRET=integration-test-secret-0123456789abcdef');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../routes/supportive.php';
require_once __DIR__ . '/../../routes/diverse.php';
require_once __DIR__ . '/../../routes/equivalence.php';

/**
 * ยืนยันว่า ?search= ที่ frontend ส่งมา (useSupportive/useDiverse/useEquivalence)
 * ถูกนำไปกรองจริงในสามหน้านี้ — เดิม backend ไม่อ่านค่าเลย ทำให้ช่องค้นหาไม่มีผล
 * แต่ก็ไม่ error ผู้ใช้จึงเข้าใจว่า "ค้นแล้วไม่เจอ"
 *
 * Skips เมื่อต่อ MySQL ไม่ได้
 */
final class SearchFilterRouteTest extends TestCase
{
    private static ?PDO $pdo = null;
    private int $personnelId = 0;
    private string $uniqueName = '';

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }
        foreach (['personnel', 'supportive_experience', 'diverse_experience', 'position_equivalence'] as $table) {
            if (!self::$pdo->query("SHOW TABLES LIKE '{$table}'")->fetchColumn()) {
                self::markTestSkipped("ไม่พบตาราง {$table}");
            }
        }

        $suffix = bin2hex(random_bytes(4));
        $this->uniqueName = 'ค้นหา' . $suffix;

        self::$pdo->prepare('INSERT INTO personnel (first_name, last_name) VALUES (?, ?)')
            ->execute([$this->uniqueName, 'นามสมมติ']);
        $this->personnelId = (int) self::$pdo->lastInsertId();

        $_GET = [];
        http_response_code(200);
    }

    protected function tearDown(): void
    {
        if (self::$pdo === null || !$this->personnelId) {
            return;
        }
        foreach (['supportive_experience', 'diverse_experience', 'position_equivalence'] as $table) {
            self::$pdo->prepare("DELETE FROM {$table} WHERE personnel_id = ?")->execute([$this->personnelId]);
        }
        self::$pdo->prepare('DELETE FROM personnel WHERE personnel_id = ?')->execute([$this->personnelId]);
        $_GET = [];
    }

    private function capture(callable $fn): array
    {
        ob_start();
        $fn();
        return json_decode((string) ob_get_clean(), true) ?? [];
    }

    /** @return array{0: array, 1: array} ผลลัพธ์ตอนค้นด้วยคำที่ตรง และคำที่ไม่ตรง */
    private function searchBoth(callable $listFn): array
    {
        $_GET = ['search' => $this->uniqueName, 'limit' => 50, 'offset' => 0];
        $hit = $this->capture($listFn);

        $_GET = ['search' => 'ไม่มีคำนี้แน่นอน-' . bin2hex(random_bytes(4)), 'limit' => 50, 'offset' => 0];
        $miss = $this->capture($listFn);

        return [$hit, $miss];
    }

    #[Test]
    public function supportive_search_filters_by_person_name(): void
    {
        self::$pdo->prepare(
            'INSERT INTO supportive_experience (personnel_id, job_series_name, start_date, end_date)
             VALUES (?, ?, ?, ?)'
        )->execute([$this->personnelId, 'นักทรัพยากรบุคคล', '2020-01-01', '2021-01-01']);

        [$hit, $miss] = $this->searchBoth(fn () => getSupportiveList(self::$pdo));

        self::assertTrue($hit['success']);
        self::assertSame(1, $hit['pagination']['total'], 'ค้นด้วยชื่อที่ตรงต้องเจอ 1 แถว');
        self::assertSame($this->personnelId, (int) $hit['data'][0]['personnel_id']);
        self::assertSame(0, $miss['pagination']['total'], 'ค้นด้วยคำที่ไม่ตรงต้องไม่เจอ');
    }

    #[Test]
    public function supportive_search_also_matches_job_series_name(): void
    {
        $series = 'สายงานเฉพาะ-' . bin2hex(random_bytes(3));
        self::$pdo->prepare(
            'INSERT INTO supportive_experience (personnel_id, job_series_name, start_date, end_date)
             VALUES (?, ?, ?, ?)'
        )->execute([$this->personnelId, $series, '2020-01-01', '2021-01-01']);

        $_GET = ['search' => $series, 'limit' => 50, 'offset' => 0];
        $response = $this->capture(fn () => getSupportiveList(self::$pdo));

        self::assertSame(1, $response['pagination']['total']);
        self::assertSame($series, $response['data'][0]['job_series_name']);
    }

    #[Test]
    public function diverse_search_filters_by_person_name(): void
    {
        self::$pdo->prepare(
            'INSERT INTO diverse_experience (personnel_id, from_job_series, to_job_series) VALUES (?, ?, ?)'
        )->execute([$this->personnelId, 'สายงานเดิม', 'สายงานใหม่']);

        [$hit, $miss] = $this->searchBoth(fn () => getDiverseList(self::$pdo));

        self::assertSame(1, $hit['pagination']['total']);
        self::assertSame($this->personnelId, (int) $hit['data'][0]['personnel_id']);
        self::assertSame(0, $miss['pagination']['total']);
    }

    #[Test]
    public function equivalence_search_filters_by_person_name_and_counts_consistently(): void
    {
        self::$pdo->prepare(
            'INSERT INTO position_equivalence (personnel_id, actual_position, equivalent_type) VALUES (?, ?, ?)'
        )->execute([$this->personnelId, 'ผู้อำนวยการกอง', 'อำนวยการ']);

        [$hit, $miss] = $this->searchBoth(fn () => getEquivalenceList(self::$pdo));

        // count query ของ equivalence เดิมไม่ join personnel — ถ้าลืม join จะ error หรือได้ total เพี้ยน
        self::assertSame(1, $hit['pagination']['total']);
        self::assertCount(1, $hit['data']);
        self::assertSame($this->personnelId, (int) $hit['data'][0]['personnel_id']);
        self::assertSame(0, $miss['pagination']['total']);
    }

    #[Test]
    public function empty_search_does_not_filter_anything_out(): void
    {
        self::$pdo->prepare(
            'INSERT INTO supportive_experience (personnel_id, job_series_name, start_date, end_date)
             VALUES (?, ?, ?, ?)'
        )->execute([$this->personnelId, 'นักทรัพยากรบุคคล', '2020-01-01', '2021-01-01']);

        $_GET = ['search' => '', 'limit' => 50, 'offset' => 0];
        $response = $this->capture(fn () => getSupportiveList(self::$pdo));

        self::assertTrue($response['success']);
        self::assertGreaterThanOrEqual(1, $response['pagination']['total']);
    }
}
