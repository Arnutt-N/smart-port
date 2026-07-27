<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use RuntimeException;

require_once __DIR__ . '/../../scripts/migration-lib.php';

/**
 * ครอบพฤติกรรมการหาโฟลเดอร์ migration ของ run-migrations.php
 *
 * เคสสำคัญคือ "โฟลเดอร์มีอยู่แต่ว่างเปล่า" ซึ่งเกิดจริงกับ image ที่ build ด้วย
 * backend/Dockerfile (สร้าง /var/www/database เปล่าไว้ เพราะ database/ อยู่นอก build context)
 * ของเดิมเช็คแค่ is_dir() จึงเลือกโฟลเดอร์เปล่า แล้วรายงาน "No pending migrations."
 * ทั้งที่ schema ไม่ถูกแตะเลย — ต้องดังให้ได้ยินแทนที่จะเงียบ
 */
final class MigrationDirectoryTest extends TestCase
{
    /** @var list<string> */
    private array $tempDirs = [];

    protected function tearDown(): void
    {
        putenv('MIGRATIONS_DIR');
        unset($_ENV['MIGRATIONS_DIR'], $_SERVER['MIGRATIONS_DIR']);

        foreach ($this->tempDirs as $dir) {
            foreach (glob($dir . '/*') ?: [] as $file) {
                @unlink($file);
            }
            @rmdir($dir);
        }
        $this->tempDirs = [];
    }

    /** @param list<string> $fileNames */
    private function makeDir(array $fileNames): string
    {
        $dir = sys_get_temp_dir() . '/mig-' . bin2hex(random_bytes(6));
        mkdir($dir, 0777, true);
        $this->tempDirs[] = $dir;

        foreach ($fileNames as $name) {
            file_put_contents($dir . '/' . $name, "-- test\nSELECT 1;\n");
        }

        return $dir;
    }

    #[Test]
    public function it_returns_a_configured_directory_that_has_migrations(): void
    {
        $dir = $this->makeDir(['03-a.sql', '04-b.sql']);
        putenv("MIGRATIONS_DIR={$dir}");

        self::assertSame($dir, migrationDirectory());
    }

    #[Test]
    public function it_fails_loudly_when_the_configured_directory_is_empty(): void
    {
        // เคสจริงของ image ที่ build ด้วย backend/Dockerfile: /var/www/database ถูกสร้างเปล่าไว้
        // ต้องไม่ fallback ไปโฟลเดอร์อื่นเงียบ ๆ และต้องไม่รายงานว่า "ไม่มี migration ค้าง"
        $dir = $this->makeDir([]);
        putenv("MIGRATIONS_DIR={$dir}");

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('contains no migration files');

        migrationDirectory();
    }

    #[Test]
    public function it_fails_loudly_when_the_directory_only_holds_non_migration_sql(): void
    {
        // tidb-init.sql เป็น bootstrap ไม่ใช่ migration — มีไฟล์นี้อย่างเดียวถือว่าว่าง
        $dir = $this->makeDir(['tidb-init.sql', 'export-docker.sql']);
        putenv("MIGRATIONS_DIR={$dir}");

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('contains no migration files');

        migrationDirectory();
    }

    #[Test]
    public function it_lists_only_numbered_migrations_in_natural_order(): void
    {
        $dir = $this->makeDir([
            '10-ten.sql',
            '02-two.sql',
            'tidb-init.sql',
            'reimport-data.sql',
            '09-nine.sql',
        ]);

        $names = array_map('basename', listMigrationFiles($dir));

        self::assertSame(['02-two.sql', '09-nine.sql', '10-ten.sql'], $names);
    }

    #[Test]
    public function it_fails_when_the_configured_directory_does_not_exist(): void
    {
        putenv('MIGRATIONS_DIR=/definitely/not/a/real/path/xyz');

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('MIGRATIONS_DIR does not exist');

        migrationDirectory();
    }

    #[Test]
    public function it_reports_which_directories_were_tried_when_no_fallback_exists(): void
    {
        // ไม่ตั้ง MIGRATIONS_DIR → ไล่ fallback; ในคอนเทนเนอร์เทส backend/ ถูก mount เป็น /app
        // จึงไม่มีทั้ง /var/www/database และ <repo>/database → ต้องบอกว่าลองที่ไหนไปบ้าง
        putenv('MIGRATIONS_DIR');
        unset($_ENV['MIGRATIONS_DIR'], $_SERVER['MIGRATIONS_DIR']);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('No migrations directory found');

        migrationDirectory();
    }
}
