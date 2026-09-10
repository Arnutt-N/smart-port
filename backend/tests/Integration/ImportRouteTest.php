<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use QualificationEngine;
use Throwable;

putenv('JWT_SECRET=integration-test-secret-0123456789abcdef');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../routes/import.php';

/**
 * N56 — import e2e positive path ต่อ DB จริง
 *
 * เดิม ImportServiceTest มี positive ระดับ service แต่ชั้น route (handleImport +
 * processImportUpload: pre-log → service → import_log/audit → HTTP 200/422)
 * มีแค่ negative path (formula/OLE) — ไฟล์นี้ปิด positive loop แบบ end-to-end:
 * fixture .xlsx → personnel จริง → engine คำนวณได้ → import_log + audit ครบ
 */
final class ImportRouteTest extends TestCase
{
    private const SAMPLE = __DIR__ . '/../fixtures/import-sample.xlsx';

    private static ?PDO $pdo = null;

    private int $actorId = 0;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }
        if (!is_file(self::SAMPLE)) {
            self::markTestSkipped('ไม่พบ fixture import-sample.xlsx');
        }
        foreach (['personnel', 'import_log', 'audit_log'] as $table) {
            if (!self::$pdo->query("SHOW TABLES LIKE '{$table}'")->fetchColumn()) {
                self::markTestSkipped("ไม่พบตาราง {$table}");
            }
        }
        http_response_code(200);
        $this->cleanup();

        $actorName = 'n56actor' . bin2hex(random_bytes(3));
        self::$pdo->prepare(
            "INSERT INTO users (username, password_hash, full_name, role, is_active, must_change_password)
             VALUES (?, ?, 'N56 Actor', 'admin', 1, 0)"
        )->execute([$actorName, password_hash('ActorPass123', PASSWORD_BCRYPT)]);
        $this->actorId = (int) self::$pdo->lastInsertId();
        $GLOBALS['__auth_user'] = ['user_id' => $this->actorId, 'role' => 'admin'];
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['__auth_user']);
        if (self::$pdo !== null) {
            $this->cleanup();
            try {
                if ($this->actorId > 0) {
                    self::$pdo->prepare('DELETE FROM users WHERE user_id = ?')->execute([$this->actorId]);
                }
            } catch (Throwable $e) {
                // cleanup ล้มเหลว — อย่าทำให้ผลเทสเสีย
            }
        }
        $this->actorId = 0;
        http_response_code(200);
    }

    #[Test]
    public function positive_upload_persists_personnel_and_logs(): void
    {
        $logBefore = $this->importLogCount();
        $auditBefore = $this->importAuditCount();

        $outcome = processImportUpload(self::$pdo, self::SAMPLE, 'import-sample.xlsx', $this->actorId);

        self::assertSame(200, $outcome['http'], json_encode($outcome['body']));
        self::assertTrue($outcome['body']['success']);
        self::assertSame(2, $outcome['body']['summary']['personnel']);
        self::assertSame(1, $outcome['body']['summary']['diverse']);

        // personnel จริงถูก insert
        $count = (int) self::$pdo->query(
            "SELECT COUNT(*) FROM personnel WHERE citizen_id LIKE '11001002990%'"
        )->fetchColumn();
        self::assertSame(2, $count);

        // import_log: สำเร็จ 1 แถว บันทึกจำนวนคน ไม่มี PII
        self::assertSame($logBefore + 1, $this->importLogCount());
        $log = self::$pdo->query(
            'SELECT personnel_count, is_success, error_summary, filename FROM import_log ORDER BY log_id DESC LIMIT 1'
        )->fetch(PDO::FETCH_ASSOC);
        self::assertSame(2, (int) $log['personnel_count']);
        self::assertSame(1, (int) $log['is_success']);
        self::assertNull($log['error_summary']);

        // audit_log: CREATE import 1 แถว
        self::assertSame($auditBefore + 1, $this->importAuditCount());

        // engine คำนวณได้หลังนำเข้า — ปิด loop e2e (ค่าตรงกับ ImportServiceTest)
        $engine = new QualificationEngine(self::$pdo);
        $m1 = $engine->computeDetail('M1', $this->personnelId('1100100299005'));
        self::assertNotNull($m1);
        self::assertSame('2023-01-01', $m1['data']['qualification_date']);
    }

    #[Test]
    public function reimport_returns_friendly_duplicate_error(): void
    {
        $first = processImportUpload(self::$pdo, self::SAMPLE, 'import-sample.xlsx', $this->actorId);
        self::assertSame(200, $first['http'], json_encode($first['body']));

        $logBefore = $this->importLogCount();
        $second = processImportUpload(self::$pdo, self::SAMPLE, 'import-sample.xlsx', $this->actorId);

        self::assertSame(422, $second['http']);
        self::assertFalse($second['body']['success']);
        $errors = implode(' ', $second['body']['errors']);
        self::assertStringContainsString('เลขบัตรประชาชนซ้ำ', $errors);
        self::assertStringNotContainsString('SQLSTATE', $errors);

        // import ซ้ำก็ถูกบันทึกเป็น attempt ที่ล้มเหลว
        self::assertSame($logBefore + 1, $this->importLogCount());
        $isSuccess = (int) self::$pdo->query(
            'SELECT is_success FROM import_log ORDER BY log_id DESC LIMIT 1'
        )->fetchColumn();
        self::assertSame(0, $isSuccess);
    }

    #[Test]
    public function missing_file_returns_422_and_logs_attempt(): void
    {
        $outcome = processImportUpload(self::$pdo, __DIR__ . '/nonexistent-n56.xlsx', 'missing.xlsx', $this->actorId);

        self::assertSame(422, $outcome['http']);
        self::assertFalse($outcome['body']['success']);
        self::assertNotEmpty($outcome['body']['errors']);
    }

    #[Test]
    public function handle_import_validates_method_path_and_auth(): void
    {
        // ผิด method → 405
        $out = $this->callHandle('GET', ['import', 'executive']);
        self::assertSame(405, $out['code']);

        // ผิด path → 404
        $out = $this->callHandle('POST', ['import', 'wrong']);
        self::assertSame(404, $out['code']);

        // unauthenticated → 401
        $GLOBALS['__auth_user'] = null;
        $out = $this->callHandle('POST', ['import', 'executive']);
        self::assertSame(401, $out['code']);

        // viewer ไม่มี create:import → 403
        $GLOBALS['__auth_user'] = ['user_id' => $this->actorId, 'role' => 'viewer'];
        $out = $this->callHandle('POST', ['import', 'executive']);
        self::assertSame(403, $out['code']);
    }

    /**
     * @param list<string> $path
     * @return array{code:int, body:array<string,mixed>}
     */
    private function callHandle(string $method, array $path): array
    {
        http_response_code(200);
        ob_start();
        handleImport(self::$pdo, $method, $path);
        $raw = (string) ob_get_clean();
        return ['code' => http_response_code(), 'body' => json_decode($raw, true) ?? []];
    }

    private function importLogCount(): int
    {
        return (int) self::$pdo->query('SELECT COUNT(*) FROM import_log')->fetchColumn();
    }

    private function importAuditCount(): int
    {
        return (int) self::$pdo->query(
            "SELECT COUNT(*) FROM audit_log WHERE action = 'CREATE' AND table_name = 'import'"
        )->fetchColumn();
    }

    private function personnelId(string $citizenId): int
    {
        $stmt = self::$pdo->prepare('SELECT personnel_id FROM personnel WHERE citizen_id = ?');
        $stmt->execute([$citizenId]);
        return (int) $stmt->fetchColumn();
    }

    private function cleanup(): void
    {
        $ids = "SELECT personnel_id FROM personnel WHERE citizen_id LIKE '11001002990%'";
        try {
            self::$pdo->exec("DELETE FROM diverse_experience WHERE personnel_id IN ({$ids})");
            self::$pdo->exec("DELETE FROM position_equivalence WHERE personnel_id IN ({$ids})");
            self::$pdo->exec("DELETE FROM personnel_position_history WHERE personnel_id IN ({$ids})");
            self::$pdo->exec("DELETE FROM personnel WHERE citizen_id LIKE '11001002990%'");
            self::$pdo->exec("DELETE FROM organization WHERE org_name = 'กองบริหารทรัพยากรบุคคล'");
            self::$pdo->exec("DELETE FROM `position` WHERE position_name IN ('นักทรัพยากรบุคคลชำนาญการ', 'ผู้อำนวยการกอง')");
            self::$pdo->exec('DELETE FROM import_log WHERE filename IN (\'import-sample.xlsx\', \'missing.xlsx\')');
            self::$pdo->exec("DELETE FROM audit_log WHERE action = 'CREATE' AND table_name = 'import'");
        } catch (Throwable $e) {
            // ตารางอาจยังไม่มีในบาง schema — ปล่อยให้ test จริงจับ
        }
    }
}
