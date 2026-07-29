<?php

declare(strict_types=1);

namespace Tests\Integration;

use CrosswalkService;
use PDO;
use PDOException;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use SyncTransformService;
use Throwable;

require_once __DIR__ . '/../../sync/CrosswalkService.php';
require_once __DIR__ . '/../../sync/SourceAdapterInterface.php';
require_once __DIR__ . '/../../sync/StagingPdoAdapter.php';
require_once __DIR__ . '/../../sync/CsvFileAdapter.php';
require_once __DIR__ . '/../../sync/TransformHelpers.php';
require_once __DIR__ . '/../../sync/Transformers/PrefixTransformer.php';
require_once __DIR__ . '/../../sync/Transformers/OrgTransformer.php';
require_once __DIR__ . '/../../sync/Transformers/PositionTransformer.php';
require_once __DIR__ . '/../../sync/Transformers/PersonTransformer.php';
require_once __DIR__ . '/../../sync/Transformers/PositionHistoryTransformer.php';
require_once __DIR__ . '/../../sync/Transformers/DecorationTransformer.php';
require_once __DIR__ . '/../../sync/Transformers/TrainingTransformer.php';
require_once __DIR__ . '/../../SyncTransformService.php';

/**
 * In-memory source adapter for testing — no staging DB required.
 */
class ArraySourceAdapter implements \SourceAdapterInterface
{
    private array $tables = [];
    private array $lookups = [];

    public function setRows(string $table, array $rows): void
    {
        $this->tables[$table] = $rows;
    }

    public function setLookup(string $table, string $keyCol, string $valCol, array $map): void
    {
        $this->lookups["{$table}.{$keyCol}.{$valCol}"] = $map;
    }

    public function fetchRows(string $table, array $columns = [], ?string $sinceColumn = null, ?string $sinceValue = null): iterable
    {
        $rows = $this->tables[$table] ?? [];

        if ($sinceColumn !== null && $sinceValue !== null) {
            $rows = array_filter($rows, fn($r) => ($r[$sinceColumn] ?? '') > $sinceValue);
        }

        foreach ($rows as $row) {
            if ($columns !== []) {
                yield array_intersect_key($row, array_flip($columns));
            } else {
                yield $row;
            }
        }
    }

    public function fetchLookup(string $table, string $keyColumn, string $valueColumn): array
    {
        return $this->lookups["{$table}.{$keyColumn}.{$valueColumn}"] ?? [];
    }

    public function hasTable(string $table): bool
    {
        return isset($this->tables[$table]);
    }
}

final class SyncTransformServiceTest extends TestCase
{
    private static ?PDO $pdo = null;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }
        if (!self::$pdo->query("SHOW TABLES LIKE 'external_ref'")->fetchColumn()) {
            self::markTestSkipped('ไม่พบตาราง external_ref — รัน migration 23-external-ref.sql');
        }
        $this->cleanup();
    }

    protected function tearDown(): void
    {
        if (self::$pdo !== null) {
            $this->cleanup();
        }
    }

    #[Test]
    public function it_syncs_prefixes_d4(): void
    {
        $source = new ArraySourceAdapter();
        $source->setRows('per_prename', [
            ['pn_code' => '001', 'pn_name' => 'นาย', 'pn_eng_name' => 'Mr.', 'pn_shortname' => 'นาย', 'pn_active' => '1'],
            ['pn_code' => '002', 'pn_name' => 'นาง', 'pn_eng_name' => 'Mrs.', 'pn_shortname' => 'นาง', 'pn_active' => '1'],
            ['pn_code' => '003', 'pn_name' => 'นางสาว', 'pn_eng_name' => 'Miss', 'pn_shortname' => 'น.ส.', 'pn_active' => '1'],
        ]);

        $service = new SyncTransformService(self::$pdo, $source);
        $result = $service->syncDomain('D4', true);

        self::assertSame(3, $result['created'], 'ต้องสร้าง prefix 3 แถว: ' . json_encode($result));
        self::assertSame(0, count($result['errors']));

        $stmt = self::$pdo->query("SELECT COUNT(*) FROM prefixes WHERE prefix_code IN ('001','002','003')");
        self::assertSame(3, (int) $stmt->fetchColumn());

        $refCount = self::$pdo->query("SELECT COUNT(*) FROM external_ref WHERE source_table = 'per_prename' AND source_system = 'legacy-hr'")->fetchColumn();
        self::assertSame(3, (int) $refCount);
    }

    #[Test]
    public function it_syncs_organizations_d2(): void
    {
        $source = new ArraySourceAdapter();
        $source->setRows('per_org', [
            ['org_id' => '901', 'org_code' => 'TEST000000001', 'org_name' => 'กองทดสอบระบบ sync', 'org_active' => '1'],
            ['org_id' => '902', 'org_code' => 'TEST000000002', 'org_name' => 'ฝ่ายทดสอบ inactive', 'org_active' => '0'],
        ]);

        $service = new SyncTransformService(self::$pdo, $source);
        $result = $service->syncDomain('D2', true);

        self::assertSame(1, $result['created']);
        self::assertSame(1, $result['skipped'], 'org_active=0 ต้องถูก skip');

        $stmt = self::$pdo->prepare("SELECT org_id FROM organization WHERE org_code = 'TEST000000001'");
        $stmt->execute();
        self::assertNotFalse($stmt->fetchColumn());
    }

    #[Test]
    public function it_syncs_positions_d3(): void
    {
        $source = new ArraySourceAdapter();
        $source->setRows('per_position', [
            ['pos_id' => '801', 'pos_no' => 'TEST-POS-001', 'pl_code' => 'PL01', 'pos_status' => '1'],
            ['pos_id' => '802', 'pos_no' => 'TEST-POS-002', 'pl_code' => 'PL02', 'pos_status' => '2'],
        ]);
        $source->setLookup('per_line', 'pl_code', 'pl_name', [
            'PL01' => 'นักวิเคราะห์นโยบายและแผน',
            'PL02' => 'นักทรัพยากรบุคคล',
        ]);

        $service = new SyncTransformService(self::$pdo, $source);
        $result = $service->syncDomain('D3', true);

        self::assertSame(1, $result['created']);
        self::assertSame(1, $result['skipped'], 'pos_status=2 ต้องถูก skip');

        $stmt = self::$pdo->prepare("SELECT position_name FROM `position` WHERE position_code = 'TEST-POS-001'");
        $stmt->execute();
        self::assertSame('นักวิเคราะห์นโยบายและแผน', $stmt->fetchColumn());
    }

    #[Test]
    public function it_syncs_persons_d1_with_crosswalk(): void
    {
        // Seed crosswalks for org/position/prefix
        $this->seedCrosswalkDependencies();

        $source = new ArraySourceAdapter();
        $source->setRows('per_personal', [
            [
                'per_id' => '9001', 'per_cardno' => '1999900000001', 'per_name' => 'ทดสอบ',
                'per_surname' => 'ซิงก์', 'per_startdate' => '2560-04-01 00:00:00',
                'pos_id' => '801', 'org_id' => '901', 'level_no' => '03', 'per_status' => '1', 'pn_code' => '001',
            ],
        ]);

        $service = new SyncTransformService(self::$pdo, $source);
        $result = $service->syncDomain('D1', true);

        self::assertSame(1, $result['created'], json_encode($result));
        self::assertSame(0, count($result['errors']));

        $stmt = self::$pdo->prepare("SELECT * FROM personnel WHERE citizen_id = '1999900000001'");
        $stmt->execute();
        $person = $stmt->fetch(PDO::FETCH_ASSOC);

        self::assertNotFalse($person);
        self::assertSame('ทดสอบ', $person['first_name']);
        self::assertSame('ซิงก์', $person['last_name']);
        self::assertSame('2017-04-01', $person['hire_date'], 'G1: BE 2560 → CE 2017');
        self::assertSame('K3', $person['current_level_code'], 'level 03 → K3');
        self::assertSame(1, (int) $person['is_active']);
    }

    #[Test]
    public function it_is_idempotent_on_rerun(): void
    {
        $source = new ArraySourceAdapter();
        $source->setRows('per_prename', [
            ['pn_code' => '001', 'pn_name' => 'นาย', 'pn_eng_name' => 'Mr.', 'pn_shortname' => 'นาย', 'pn_active' => '1'],
        ]);

        $service = new SyncTransformService(self::$pdo, $source);
        $service->syncDomain('D4', true);
        $result2 = $service->syncDomain('D4', true);

        self::assertSame(0, $result2['created'], 'รันซ้ำต้องไม่สร้างใหม่');
        self::assertSame(1, $result2['updated']);

        $count = self::$pdo->query("SELECT COUNT(*) FROM prefixes WHERE prefix_code = '001'")->fetchColumn();
        self::assertSame(1, (int) $count, 'ต้องมีแถวเดียว');
    }

    #[Test]
    public function it_syncs_training_d7_dedup_by_name(): void
    {
        $source = new ArraySourceAdapter();
        $source->setRows('per_training', [
            ['trn_id' => '701', 'tr_code' => 'TR01'],
            ['trn_id' => '702', 'tr_code' => 'TR01'],
            ['trn_id' => '703', 'tr_code' => 'TR02'],
        ]);
        $source->setLookup('per_train', 'tr_code', 'tr_name', [
            'TR01' => 'หลักสูตรนักบริหารระดับสูง',
            'TR02' => 'หลักสูตรภาษาอังกฤษ',
        ]);

        $service = new SyncTransformService(self::$pdo, $source);
        $result = $service->syncDomain('D7', true);

        self::assertSame(2, $result['created'], 'สร้าง 2 courses (dedup TR01)');
        self::assertSame(1, $result['skipped']);
    }

    #[Test]
    public function it_syncs_decorations_d6_with_be_year(): void
    {
        // Seed person crosswalk
        self::$pdo->exec("INSERT INTO personnel (citizen_id, first_name, last_name) VALUES ('1999900000002', 'ประดับ', 'เครื่องราช')");
        $personnelId = (int) self::$pdo->lastInsertId();
        $crosswalk = new CrosswalkService(self::$pdo);
        $crosswalk->record('per_personal', '9002', 'personnel', $personnelId);

        $source = new ArraySourceAdapter();
        $source->setRows('per_decoratehis', [
            ['deh_id' => '601', 'per_id' => '9002', 'per_cardno' => '1999900000002', 'dc_code' => 'DC', 'deh_date' => '2565-01-01', 'deh_gazette' => 'ราชกิจจาฯ เล่ม 139'],
        ]);
        $source->setLookup('per_decoration', 'dc_code', 'dc_name', ['DC' => 'ทวีติยาภรณ์ช้างเผือก']);
        $source->setLookup('per_decoration', 'dc_code', 'dc_shortname', ['DC' => 'ท.ช.']);

        $service = new SyncTransformService(self::$pdo, $source);
        $result = $service->syncDomain('D6', true);

        self::assertSame(1, $result['created'], json_encode($result));

        $stmt = self::$pdo->prepare('SELECT * FROM royal_decorations WHERE servant_id = ?');
        $stmt->execute([$personnelId]);
        $dec = $stmt->fetch(PDO::FETCH_ASSOC);

        self::assertNotFalse($dec);
        self::assertSame('ทวีติยาภรณ์ช้างเผือก', $dec['decoration_name']);
        self::assertSame(2565, (int) $dec['received_year'], 'D6: เก็บ พ.ศ. ตรง ไม่ลบ 543');
    }

    #[Test]
    public function it_returns_status_per_domain(): void
    {
        $source = new ArraySourceAdapter();
        $service = new SyncTransformService(self::$pdo, $source);
        $status = $service->getStatus();

        self::assertArrayHasKey('D1', $status);
        self::assertArrayHasKey('D7', $status);
        self::assertSame('per_personal', $status['D1']['source_table']);
    }

    private function seedCrosswalkDependencies(): void
    {
        // Org
        self::$pdo->exec("INSERT INTO organization (org_name, org_code) VALUES ('กองทดสอบระบบ sync', 'TEST000000001')");
        $orgId = (int) self::$pdo->lastInsertId();

        // Position
        self::$pdo->exec("INSERT INTO `position` (position_name, position_code) VALUES ('นักวิเคราะห์นโยบายและแผน', 'TEST-POS-001')");
        $posId = (int) self::$pdo->lastInsertId();

        // Prefix
        self::$pdo->exec("INSERT INTO prefixes (prefix_code, prefix_name_th) VALUES ('001', 'นาย')");
        $prefixId = (int) self::$pdo->lastInsertId();

        $crosswalk = new CrosswalkService(self::$pdo);
        $crosswalk->record('per_org', '901', 'organization', $orgId);
        $crosswalk->record('per_position', '801', 'position', $posId);
        $crosswalk->record('per_prename', '001', 'prefixes', $prefixId);
    }

    private function cleanup(): void
    {
        try {
            self::$pdo->exec("DELETE FROM external_ref WHERE source_system = 'legacy-hr'");
            self::$pdo->exec("DELETE FROM personnel_position_history WHERE personnel_id IN (SELECT personnel_id FROM personnel WHERE citizen_id LIKE '19999%')");
            self::$pdo->exec("DELETE FROM royal_decorations WHERE servant_id IN (SELECT personnel_id FROM personnel WHERE citizen_id LIKE '19999%')");
            self::$pdo->exec("DELETE FROM personnel WHERE citizen_id LIKE '19999%'");
            self::$pdo->exec("DELETE FROM organization WHERE org_code LIKE 'TEST%'");
            self::$pdo->exec("DELETE FROM `position` WHERE position_code LIKE 'TEST%'");
            self::$pdo->exec("DELETE FROM prefixes WHERE prefix_code IN ('001','002','003')");
            self::$pdo->exec("DELETE FROM training_course WHERE course_name LIKE 'หลักสูตร%'");
        } catch (Throwable $e) {
            // tables may not exist in some schemas
        }
    }
}
