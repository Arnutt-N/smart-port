<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use Throwable;

putenv('JWT_SECRET=integration-test-secret-0123456789abcdef');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../routes/sync.php';

/**
 * N23 — integration suite ของชั้น route sync (handleSync, status, trigger) ต่อ DB จริง
 *
 * เดิมมีแค่ SyncTransformService ระดับ service (SyncTransformServiceTest) ไม่มีเทส
 * ชั้น route: auth/permission branching, validation (domain/source), audit log
 * ใช้ $GLOBALS['__auth_user'] ฉีด identity (pattern เดียวกับ routes/settings.php)
 */
final class SyncRouteTest extends TestCase
{
    private static ?PDO $pdo = null;

    /** @var list<string> temp dirs ที่ต้องลบ */
    private array $tmpDirs = [];

    /** @var array<string,string|false> env ที่ backup ไว้ */
    private array $envBackup = [];

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }
        foreach (['external_ref', 'prefixes', 'audit_log'] as $table) {
            if (!self::$pdo->query("SHOW TABLES LIKE '{$table}'")->fetchColumn()) {
                self::markTestSkipped("ไม่พบตาราง {$table}");
            }
        }
        http_response_code(200);
        $GLOBALS['__auth_user'] = ['user_id' => 1, 'role' => 'admin'];
        $this->cleanup();
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['__auth_user']);
        foreach (['SYNC_STAGING_HOST', 'SYNC_STAGING_DATABASE', 'SYNC_STAGING_USER', 'SYNC_CSV_DIR'] as $k) {
            $this->restoreEnv($k);
        }
        foreach ($this->tmpDirs as $dir) {
            $this->removeDir($dir);
        }
        $this->tmpDirs = [];
        if (self::$pdo !== null) {
            $this->cleanup();
        }
        http_response_code(200);
    }

    #[Test]
    public function status_returns_all_domains_with_source_tables(): void
    {
        http_response_code(200);
        ob_start();
        handleSyncStatus(self::$pdo);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(200, http_response_code());
        self::assertTrue($body['success']);
        foreach (['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'] as $d) {
            self::assertArrayHasKey($d, $body['data'], "status ต้องมี {$d}");
            self::assertArrayHasKey('source_table', $body['data'][$d]);
        }
        self::assertSame('per_personal', $body['data']['D1']['source_table']);
    }

    #[Test]
    public function route_get_status_returns_200_for_admin(): void
    {
        $out = $this->callSync('GET', ['sync', 'status']);

        self::assertSame(200, $out['code']);
        self::assertTrue($out['body']['success']);
        self::assertArrayHasKey('D4', $out['body']['data']);
    }

    #[Test]
    public function route_get_status_returns_401_when_unauthenticated(): void
    {
        $GLOBALS['__auth_user'] = null;
        $out = $this->callSync('GET', ['sync', 'status']);

        self::assertSame(401, $out['code']);
        self::assertSame('Unauthorized', $out['body']['error'] ?? null);
    }

    #[Test]
    public function route_post_is_forbidden_for_operator_by_default(): void
    {
        // POST /sync คือ create:sync — operator ไม่มีตาม default matrix
        $GLOBALS['__auth_user'] = ['user_id' => 2, 'role' => 'operator'];
        $out = $this->callSync('POST', ['sync', 'D4']);

        self::assertSame(403, $out['code']);
        self::assertSame('create:sync', $out['body']['required_permission'] ?? null);
    }

    #[Test]
    public function trigger_rejects_invalid_domain(): void
    {
        // domain ตรวจหลัง source resolve — ต้องมี csv dir ใช้ได้ก่อนจึงจะถึงเช็ค domain
        $this->setEnv('SYNC_CSV_DIR', $this->makeCsvDir([]));
        http_response_code(200);
        ob_start();
        handleSyncTrigger(self::$pdo, 'DX', ['source' => 'csv', 'full' => true], ['user_id' => 1, 'role' => 'admin']);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(400, http_response_code());
        self::assertStringContainsString('domain ไม่ถูกต้อง', (string) ($body['error'] ?? ''));
    }

    #[Test]
    public function trigger_rejects_unknown_source(): void
    {
        http_response_code(200);
        ob_start();
        handleSyncTrigger(self::$pdo, 'D4', ['source' => 'carrier-pigeon'], ['user_id' => 1, 'role' => 'admin']);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(400, http_response_code());
        self::assertStringContainsString('staging หรือ csv', (string) ($body['error'] ?? ''));
    }

    #[Test]
    public function trigger_returns_503_when_staging_not_configured(): void
    {
        $this->clearEnv('SYNC_STAGING_HOST');
        $this->clearEnv('SYNC_STAGING_DATABASE');
        $this->clearEnv('SYNC_STAGING_USER');

        http_response_code(200);
        ob_start();
        handleSyncTrigger(self::$pdo, 'D4', ['source' => 'staging'], ['user_id' => 1, 'role' => 'admin']);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(503, http_response_code());
        self::assertStringContainsString('SYNC_STAGING_', (string) ($body['error'] ?? ''));
    }

    #[Test]
    public function trigger_returns_503_when_csv_dir_missing(): void
    {
        $this->setEnv('SYNC_CSV_DIR', '/nonexistent-sync-csv-dir-n23');

        http_response_code(200);
        ob_start();
        handleSyncTrigger(self::$pdo, 'D4', ['source' => 'csv', 'full' => true], ['user_id' => 1, 'role' => 'admin']);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(503, http_response_code());
        self::assertStringContainsString('SYNC_CSV_DIR', (string) ($body['error'] ?? ''));
    }

    #[Test]
    public function trigger_syncs_d4_from_csv_and_writes_audit(): void
    {
        $dir = $this->makeCsvDir([
            'per_prename.csv' => "pn_code,pn_name,pn_eng_name,pn_shortname,pn_active\n"
                . "SYN001,นายทดสอบซิงก์,Mr.,นทซ,1\n"
                . "SYN002,นางทดสอบซิงก์,Mrs.,นทซญ,1\n"
                . "SYN003,นางสาวทดสอบซิงก์,Miss,น.ส.ทซ,1\n",
        ]);
        $this->setEnv('SYNC_CSV_DIR', $dir);

        $auditBefore = $this->syncAuditCount();

        http_response_code(200);
        ob_start();
        handleSyncTrigger(self::$pdo, 'D4', ['source' => 'csv', 'full' => true], ['user_id' => 1, 'role' => 'admin']);
        $body = json_decode((string) ob_get_clean(), true);

        self::assertSame(200, http_response_code(), json_encode($body));
        self::assertTrue($body['success']);
        self::assertSame(3, $body['data']['created'] ?? null, json_encode($body));

        $count = (int) self::$pdo->query(
            "SELECT COUNT(*) FROM prefixes WHERE prefix_code IN ('SYN001','SYN002','SYN003')"
        )->fetchColumn();
        self::assertSame(3, $count);

        $refCount = (int) self::$pdo->query(
            "SELECT COUNT(*) FROM external_ref WHERE source_table = 'per_prename'"
            . " AND source_system = 'legacy-hr'"
            . " AND source_id IN ('SYN001','SYN002','SYN003')"
        )->fetchColumn();
        self::assertSame(3, $refCount);

        self::assertSame($auditBefore + 1, $this->syncAuditCount(), 'trigger ต้องเขียน audit_log 1 แถว');
    }

    /**
     * @param list<string> $path
     * @return array{code:int, body:array<string,mixed>}
     */
    private function callSync(string $method, array $path): array
    {
        http_response_code(200);
        ob_start();
        handleSync(self::$pdo, $method, $path);
        $raw = (string) ob_get_clean();
        return ['code' => http_response_code(), 'body' => json_decode($raw, true) ?? []];
    }

    private function syncAuditCount(): int
    {
        return (int) self::$pdo->query(
            "SELECT COUNT(*) FROM audit_log WHERE action = 'sync' AND table_name = 'external_ref'"
        )->fetchColumn();
    }

    /** @param array<string,string> $files */
    private function makeCsvDir(array $files): string
    {
        $dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'syncn23_' . bin2hex(random_bytes(6));
        mkdir($dir, 0777, true);
        foreach ($files as $name => $content) {
            file_put_contents($dir . DIRECTORY_SEPARATOR . $name, $content);
        }
        $this->tmpDirs[] = $dir;
        return $dir;
    }

    private function removeDir(string $dir): void
    {
        foreach (glob($dir . DIRECTORY_SEPARATOR . '*') ?: [] as $f) {
            if (is_file($f)) {
                @unlink($f);
            }
        }
        @rmdir($dir);
    }

    private function setEnv(string $key, string $value): void
    {
        if (!array_key_exists($key, $this->envBackup)) {
            $this->envBackup[$key] = getenv($key);
        }
        putenv("{$key}={$value}");
        $_ENV[$key] = $value;
    }

    private function clearEnv(string $key): void
    {
        if (!array_key_exists($key, $this->envBackup)) {
            $this->envBackup[$key] = getenv($key);
        }
        putenv($key);
        unset($_ENV[$key]);
    }

    private function restoreEnv(string $key): void
    {
        if (!array_key_exists($key, $this->envBackup)) {
            return;
        }
        $old = $this->envBackup[$key];
        if ($old === false) {
            putenv($key);
            unset($_ENV[$key]);
        } else {
            putenv("{$key}={$old}");
            $_ENV[$key] = $old;
        }
        unset($this->envBackup[$key]);
    }

    private function cleanup(): void
    {
        try {
            self::$pdo->exec(
                "DELETE FROM external_ref WHERE source_system = 'legacy-hr'"
                . " AND source_id IN ('SYN001','SYN002','SYN003')"
            );
            self::$pdo->exec("DELETE FROM prefixes WHERE prefix_code LIKE 'SYN%'");
            self::$pdo->exec("DELETE FROM audit_log WHERE action = 'sync' AND table_name = 'external_ref'");
        } catch (Throwable $e) {
            // ตารางอาจยังไม่มีในบาง schema — ปล่อยให้ test จริงจับ
        }
    }
}
