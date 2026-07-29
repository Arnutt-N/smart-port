<?php

declare(strict_types=1);

namespace Tests\Unit;

use CsvFileAdapter;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../sync/CsvFileAdapter.php';

final class CsvFileAdapterTest extends TestCase
{
    private string $tmpDir;

    protected function setUp(): void
    {
        $this->tmpDir = sys_get_temp_dir() . '/sync_test_' . getmypid();
        if (!is_dir($this->tmpDir)) {
            mkdir($this->tmpDir, 0777, true);
        }
    }

    protected function tearDown(): void
    {
        $files = glob($this->tmpDir . '/*');
        foreach ($files as $f) {
            unlink($f);
        }
        rmdir($this->tmpDir);
    }

    #[Test]
    public function it_reads_csv_with_headers(): void
    {
        file_put_contents($this->tmpDir . '/per_prename.csv', "pn_code,pn_name,pn_active\n001,นาย,1\n002,นาง,1\n");

        $adapter = new CsvFileAdapter($this->tmpDir);
        $rows = iterator_to_array($adapter->fetchRows('per_prename'));

        self::assertCount(2, $rows);
        self::assertSame('001', $rows[0]['pn_code']);
        self::assertSame('นาย', $rows[0]['pn_name']);
    }

    #[Test]
    public function it_filters_by_since_column(): void
    {
        file_put_contents($this->tmpDir . '/per_org.csv', "org_id,org_name,update_date\n1,A,2026-01-01\n2,B,2026-06-01\n3,C,2026-03-01\n");

        $adapter = new CsvFileAdapter($this->tmpDir);
        $rows = iterator_to_array($adapter->fetchRows('per_org', [], 'update_date', '2026-02-01'));

        self::assertCount(2, $rows);
        self::assertSame('2', $rows[0]['org_id']);
        self::assertSame('3', $rows[1]['org_id']);
    }

    #[Test]
    public function it_selects_specific_columns(): void
    {
        file_put_contents($this->tmpDir . '/per_line.csv', "pl_code,pl_name,pl_type\nPL01,นักวิเคราะห์,1\n");

        $adapter = new CsvFileAdapter($this->tmpDir);
        $rows = iterator_to_array($adapter->fetchRows('per_line', ['pl_code', 'pl_name']));

        self::assertCount(1, $rows);
        self::assertArrayHasKey('pl_code', $rows[0]);
        self::assertArrayHasKey('pl_name', $rows[0]);
        self::assertArrayNotHasKey('pl_type', $rows[0]);
    }

    #[Test]
    public function it_builds_lookup_map(): void
    {
        file_put_contents($this->tmpDir . '/per_line.csv', "pl_code,pl_name\nPL01,นักวิเคราะห์\nPL02,นักทรัพยากร\n");

        $adapter = new CsvFileAdapter($this->tmpDir);
        $map = $adapter->fetchLookup('per_line', 'pl_code', 'pl_name');

        self::assertSame(['PL01' => 'นักวิเคราะห์', 'PL02' => 'นักทรัพยากร'], $map);
    }

    #[Test]
    public function it_returns_empty_for_missing_file(): void
    {
        $adapter = new CsvFileAdapter($this->tmpDir);
        $rows = iterator_to_array($adapter->fetchRows('nonexistent'));

        self::assertCount(0, $rows);
    }

    #[Test]
    public function it_reports_table_existence(): void
    {
        file_put_contents($this->tmpDir . '/per_org.csv', "org_id\n1\n");

        $adapter = new CsvFileAdapter($this->tmpDir);
        self::assertTrue($adapter->hasTable('per_org'));
        self::assertFalse($adapter->hasTable('per_missing'));
    }

    #[Test]
    public function it_rejects_invalid_table_names(): void
    {
        $adapter = new CsvFileAdapter($this->tmpDir);

        $this->expectException(InvalidArgumentException::class);
        iterator_to_array($adapter->fetchRows('../../etc/passwd'));
    }

    #[Test]
    public function it_handles_empty_csv(): void
    {
        file_put_contents($this->tmpDir . '/empty.csv', '');

        $adapter = new CsvFileAdapter($this->tmpDir);
        $rows = iterator_to_array($adapter->fetchRows('empty'));

        self::assertCount(0, $rows);
    }
}
