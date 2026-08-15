<?php

declare(strict_types=1);

namespace Tests\Integration;

use ImportService;
use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use Throwable;

/**
 * Issue #111 — regression สำหรับ hardening ของ XLSX import:
 * 1) ไฟล์ที่มีเซลล์สูตรต้องถูก "ปฏิเสธทั้งไฟล์" (fail-closed) — สูตรไม่ถูก evaluate เด็ดขาด
 *    (โค้ดเดิมส่ง calculateFormulas=true → สูตรกลุ่ม CVE-2026-59931 เช่น =WEBSERVICE()
 *    จะทำให้เกิด SSRF/outbound request ระหว่าง import)
 * 2) ไฟล์ binary แปลกปลอม (OLE/XLS) ที่เปลี่ยนนามสกุลเป็น .xlsx ต้อง fail closed
 *
 * ใช้ citizen_id ช่วง 11001002990% เหมือน ImportServiceTest → cleanup ทั้ง setUp/tearDown
 */
final class ImportFormulaHardeningTest extends TestCase
{
    /** checksum ผ่าน (ช่วง test data เดียวกับ ImportServiceTest) */
    private const CITIZEN_ID = '1100100299021';
    private const ORG_NAME = 'องค์กรทดสอบ-formula-111';
    private const POSITION_NAME = 'ตำแหน่งทดสอบ-formula-111';

    private static ?PDO $pdo = null;
    /** @var list<string> */
    private array $tmpFiles = [];

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }
        if (!self::$pdo->query("SHOW TABLES LIKE 'personnel'")->fetchColumn()) {
            self::markTestSkipped('ไม่พบตาราง personnel');
        }
        $this->cleanup();
    }

    protected function tearDown(): void
    {
        foreach ($this->tmpFiles as $f) {
            if (is_file($f)) {
                @unlink($f);
            }
        }
        if (self::$pdo !== null) {
            $this->cleanup();
        }
    }

    #[Test]
    public function workbook_with_formula_cells_is_rejected_fail_closed(): void
    {
        // จำลองไฟล์จาก Excel จริงแบบควบคุม XML ได้เอง: เซลล์สูตรมี <f> + cached <v>
        // (writer ของ library ไม่เขียน <v> เมื่อปิด preCalculate จึงต้องประกอบ ZIP เอง)
        // ต้องถูกปฏิเสธทั้งไฟล์ก่อนแตะ DB — สูตรไม่ถูก evaluate จึงไม่มีทางเกิด outbound request
        $path = $this->buildMaliciousWorkbook([
            'B2' => ['=1+1', 'SENTINEL'],
            'C2' => ['=WEBSERVICE("http://169.254.169.254/latest/")', 'CACHED-OK'],
        ]);

        $result = (new ImportService(self::$pdo))->importFromFile($path);

        self::assertFalse($result['success'], 'ไฟล์มีสูตรต้องถูกปฏิเสธ');
        self::assertStringContainsString('สูตร', implode(' ', $result['errors']));

        // nothing persisted — parse ล้มก่อน persist
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM personnel WHERE citizen_id = ?');
        $stmt->execute([self::CITIZEN_ID]);
        self::assertSame(0, (int) $stmt->fetchColumn(), 'ต้องไม่มีแถวถูก insert จากไฟล์ที่มีสูตร');
    }

    /**
     * ประกอบ .xlsx ขั้นต่ำ (OOXML) ด้วย ZipArchive — ชีต Personnel 1 แถวข้อมูล
     * บางเซลล์เป็น formula + cached value ตามที่กำหนด
     *
     * @param array<string, array{0:string, 1:string}> $formulaCells coord => [สูตร, cached value]
     */
    private function buildMaliciousWorkbook(array $formulaCells): string
    {
        $headers = ['citizen_id', 'first_name', 'last_name', 'hire_date', 'current_level_code', 'current_level_start_date', 'education_level', 'org_name', 'position_name'];
        $values = [self::CITIZEN_ID, 'ชื่อจริง', 'นามสกุลจริง', '2015-01-01', 'K3', '2020-01-01', 'BACHELOR', self::ORG_NAME, self::POSITION_NAME];

        $colLetter = static fn (int $i): string => chr(ord('A') + $i);

        $row1 = '';
        foreach ($headers as $i => $h) {
            $row1 .= '<c r="' . $colLetter($i) . '1" t="inlineStr"><is><t>' . htmlspecialchars($h, ENT_XML1) . '</t></is></c>';
        }
        $row2 = '';
        foreach ($values as $i => $v) {
            $coord = $colLetter($i) . '2';
            if (isset($formulaCells[$coord])) {
                [$formula, $cached] = $formulaCells[$coord];
                $row2 .= '<c r="' . $coord . '" t="str"><f>' . htmlspecialchars($formula, ENT_XML1) . '</f><v>' . htmlspecialchars($cached, ENT_XML1) . '</v></c>';
            } else {
                $row2 .= '<c r="' . $coord . '" t="inlineStr"><is><t>' . htmlspecialchars($v, ENT_XML1) . '</t></is></c>';
            }
        }

        $sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<dimension ref="A1:I2"/><sheetData>'
            . '<row r="1">' . $row1 . '</row>'
            . '<row r="2">' . $row2 . '</row>'
            . '</sheetData></worksheet>';

        $workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<sheets><sheet name="Personnel" sheetId="1" r:id="rId1"/></sheets></workbook>';

        $workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';

        $rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';

        $contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';

        $base = tempnam(sys_get_temp_dir(), 'imp111_');
        $this->tmpFiles[] = $base; // tempnam สร้างไฟล์เปล่าไว้ — ลบตอน tearDown ด้วย
        $path = $base . '.xlsx';
        $zip = new \ZipArchive();
        self::assertTrue($zip->open($path, \ZipArchive::CREATE) === true, 'สร้าง zip fixture ไม่ได้');
        $zip->addFromString('[Content_Types].xml', $contentTypes);
        $zip->addFromString('_rels/.rels', $rootRels);
        $zip->addFromString('xl/workbook.xml', $workbookXml);
        $zip->addFromString('xl/_rels/workbook.xml.rels', $workbookRels);
        $zip->addFromString('xl/worksheets/sheet1.xml', $sheetXml);
        $zip->close();
        $this->tmpFiles[] = $path;

        return $path;
    }

    #[Test]
    public function ole_binary_renamed_to_xlsx_fails_closed(): void
    {
        // OLE/XLS magic (D0 CF 11 E0) — ไม่ใช่ ZIP → Xlsx reader ต้อง throw แล้วถูกห่อเป็น error
        $base = tempnam(sys_get_temp_dir(), 'imp111c_');
        $this->tmpFiles[] = $base;
        $path = $base . '.xlsx';
        file_put_contents($path, "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1" . str_repeat("\x00", 512));
        $this->tmpFiles[] = $path;

        $result = (new ImportService(self::$pdo))->importFromFile($path);

        self::assertFalse($result['success']);
        self::assertNotEmpty($result['errors']);
        self::assertStringContainsString('อ่านไฟล์ Excel ไม่ได้', implode(' ', $result['errors']));
    }

    private function cleanup(): void
    {
        $ids = 'SELECT personnel_id FROM personnel WHERE citizen_id = ' . self::$pdo->quote(self::CITIZEN_ID);
        try {
            self::$pdo->exec("DELETE FROM diverse_experience WHERE personnel_id IN ({$ids})");
            self::$pdo->exec("DELETE FROM position_equivalence WHERE personnel_id IN ({$ids})");
            self::$pdo->exec("DELETE FROM personnel_position_history WHERE personnel_id IN ({$ids})");
            self::$pdo->exec('DELETE FROM personnel WHERE citizen_id = ' . self::$pdo->quote(self::CITIZEN_ID));
            self::$pdo->exec('DELETE FROM organization WHERE org_name = ' . self::$pdo->quote(self::ORG_NAME));
            self::$pdo->exec('DELETE FROM `position` WHERE position_name = ' . self::$pdo->quote(self::POSITION_NAME));
        } catch (Throwable $e) {
            // ตารางอาจยังไม่มีในบาง schema — ปล่อยให้ test จริงจับ
        }
    }
}
