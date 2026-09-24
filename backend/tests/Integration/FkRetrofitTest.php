<?php

declare(strict_types=1);

namespace Tests\Integration;

use PDO;
use PDOException;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * T-D4.2 — migration 35-fk-retrofit.sql: insert ลูกไม่มีแม่ต้องถูกปฏิเสธ
 * (SQLSTATE 23000) ทั้ง 8 คู่ + ลบแม่ที่ลูกอ้างอยู่ต้องถูกปฏิเสธ (RESTRICT).
 *
 * หมายเหตุ: ถ้า FK หายไป INSERT จะสำเร็จ — เทสต้องลบแถวที่หลุดเข้าไปแล้ว fail
 * (ห้ามทิ้ง orphan ไว้ใน DB แชร์)
 */
final class FkRetrofitTest extends TestCase
{
    private const ORPHAN_ID = 999999991;

    private const CONSTRAINTS = [
        'fk_awards_personnel',
        'fk_decorations_personnel',
        'fk_photos_personnel',
        'fk_proposals_personnel',
        'fk_proposals_evaluator',
        'fk_qualcalc_personnel',
        'fk_refresh_tokens_user',
        'fk_personnel_prefix',
    ];

    private static ?PDO $pdo = null;

    /** @var array<int, array{string, string, int|string}> ตาราง, pk, id ที่ต้องลบ */
    private array $created = [];

    public static function setUpBeforeClass(): void
    {
        self::$pdo = testPdo();
    }

    protected function setUp(): void
    {
        if (self::$pdo === null) {
            self::markTestSkipped('ต่อ MySQL ไม่ได้ — รัน: docker compose up -d db แล้วใช้ tests/run.sh');
        }
        foreach (['awards', 'personnel', 'prefixes', 'users'] as $table) {
            if (!self::$pdo->query("SHOW TABLES LIKE '{$table}'")->fetchColumn()) {
                self::markTestSkipped("ไม่พบตาราง {$table} — รัน migration ให้ครบก่อน");
            }
        }
    }

    protected function tearDown(): void
    {
        if (self::$pdo !== null) {
            // ลบย้อนลำดับที่สร้าง (ลูกก่อนแม่)
            foreach (array_reverse($this->created) as [$table, $pk, $id]) {
                try {
                    self::$pdo->prepare("DELETE FROM {$table} WHERE {$pk} = ?")->execute([$id]);
                } catch (PDOException $e) {
                    // cleanup ล้มเหลว — อย่าทำให้ผลเทสเสีย
                }
            }
        }
        $this->created = [];
        http_response_code(200);
    }

    #[Test]
    public function all_eight_constraints_exist(): void
    {
        $placeholders = implode(',', array_fill(0, count(self::CONSTRAINTS), '?'));
        $stmt = self::$pdo->prepare(
            "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
             WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY'
             AND CONSTRAINT_NAME IN ({$placeholders})"
        );
        $stmt->execute(self::CONSTRAINTS);
        $found = $stmt->fetchAll(PDO::FETCH_COLUMN);

        foreach (self::CONSTRAINTS as $name) {
            self::assertContains($name, $found, "ขาด FK constraint {$name} — migration 35 ยังไม่ apply?");
        }
    }

    #[Test]
    public function evaluator_column_widened_to_bigint(): void
    {
        $type = self::$pdo->query(
            "SELECT DATA_TYPE FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'performance_proposals'
             AND COLUMN_NAME = 'evaluator_id'"
        )->fetchColumn();

        self::assertSame('bigint', $type);
    }

    #[Test]
    public function child_insert_without_parent_is_rejected(): void
    {
        $personnelId = $this->createPersonnel();
        $userId = $this->createUser();

        // [ตาราง, pk, insert SQL, params, คอลัมน์ orphan ที่ต้องเช็ก cleanup]
        $cases = [
            ['awards', 'award_id',
                'INSERT INTO awards (personnel_id, award_name, award_type, awarded_date) VALUES (?, ?, ?, ?)',
                [self::ORPHAN_ID, 'FK35', 'general', '2024-06-01']],
            ['royal_decorations', 'decoration_id',
                'INSERT INTO royal_decorations (personnel_id, decoration_name, received_year) VALUES (?, ?, ?)',
                [self::ORPHAN_ID, 'FK35', 2567]],
            ['civil_servant_photos', 'photo_id',
                "INSERT INTO civil_servant_photos (personnel_id, photo_type, file_name, file_path) VALUES (?, 'profile', ?, ?)",
                [self::ORPHAN_ID, 'fk35_orphan.jpg', 'uploads/fk35_orphan.jpg']],
            ['performance_proposals', 'proposal_id',
                'INSERT INTO performance_proposals (personnel_id, proposal_type, title, submission_date) VALUES (?, ?, ?, ?)',
                [self::ORPHAN_ID, 'performance', 'FK35', '2024-01-01']],
            ['performance_proposals', 'proposal_id',
                'INSERT INTO performance_proposals (personnel_id, proposal_type, title, submission_date, evaluator_id) VALUES (?, ?, ?, ?, ?)',
                [$personnelId, 'performance', 'FK35-eval', '2024-01-01', self::ORPHAN_ID]],
            ['qualification_calculation', 'calc_id',
                'INSERT INTO qualification_calculation (personnel_id, target_level_code, calculation_date) VALUES (?, ?, ?)',
                [self::ORPHAN_ID, 'K2', '2024-01-01']],
            ['refresh_tokens', 'token_id',
                'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
                [self::ORPHAN_ID, str_repeat('a', 64), '2030-01-01 00:00:00']],
            ['personnel', 'personnel_id',
                'INSERT INTO personnel (first_name, last_name, prefix_id) VALUES (?, ?, ?)',
                ['FK35', 'Orphan', self::ORPHAN_ID]],
        ];

        foreach ($cases as [$table, $pk, $sql, $params]) {
            try {
                self::$pdo->prepare($sql)->execute($params);
            } catch (PDOException $e) {
                self::assertSame('23000', $e->getCode(), "{$table}: คาดหวัง FK violation, ได้: {$e->getMessage()}");
                continue;
            }
            // FK หาย — ลบแถวที่หลุดเข้าไปแล้ว fail แบบระบุคู่
            $id = (int) self::$pdo->lastInsertId();
            self::$pdo->prepare("DELETE FROM {$table} WHERE {$pk} = ?")->execute([$id]);
            self::fail("{$table}: insert orphan สำเร็จ — FK ของคู่นี้หายไป?");
        }
    }

    #[Test]
    public function parent_delete_with_child_is_rejected(): void
    {
        // personnel <- awards (RESTRICT)
        $personnelId = $this->createPersonnel();
        self::$pdo->prepare(
            'INSERT INTO awards (personnel_id, award_name, award_type, awarded_date) VALUES (?, ?, ?, ?)'
        )->execute([$personnelId, 'FK35-del', 'general', '2024-06-01']);
        $awardId = (int) self::$pdo->lastInsertId();
        $this->created[] = ['awards', 'award_id', $awardId];

        try {
            self::$pdo->prepare('DELETE FROM personnel WHERE personnel_id = ?')->execute([$personnelId]);
            self::fail('ลบ personnel ที่ awards อ้างอยู่สำเร็จ — FK RESTRICT หายไป?');
        } catch (PDOException $e) {
            self::assertSame('23000', $e->getCode());
        }

        // users <- refresh_tokens (RESTRICT)
        $userId = $this->createUser();
        self::$pdo->prepare(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
        )->execute([$userId, str_repeat('b', 64), '2030-01-01 00:00:00']);
        $tokenId = (int) self::$pdo->lastInsertId();
        $this->created[] = ['refresh_tokens', 'token_id', $tokenId];

        try {
            self::$pdo->prepare('DELETE FROM users WHERE user_id = ?')->execute([$userId]);
            self::fail('ลบ users ที่ refresh_tokens อ้างอยู่สำเร็จ — FK RESTRICT หายไป?');
        } catch (PDOException $e) {
            self::assertSame('23000', $e->getCode());
        }

        // prefixes <- personnel (RESTRICT)
        $prefixId = $this->createPrefix();
        $personnelId2 = $this->createPersonnel($prefixId);

        try {
            self::$pdo->prepare('DELETE FROM prefixes WHERE prefix_id = ?')->execute([$prefixId]);
            self::fail('ลบ prefixes ที่ personnel อ้างอยู่สำเร็จ — FK RESTRICT หายไป?');
        } catch (PDOException $e) {
            self::assertSame('23000', $e->getCode());
        }

        // ลบลูกก่อนแล้วลบแม่ต้องสำเร็จ (พิสูจน์ว่า reject มาจาก FK ไม่ใช่สาเหตุอื่น)
        self::$pdo->prepare('DELETE FROM personnel WHERE personnel_id = ?')->execute([$personnelId2]);
        self::$pdo->prepare('DELETE FROM prefixes WHERE prefix_id = ?')->execute([$prefixId]);
        self::assertFalse(
            (bool) self::$pdo->query("SELECT prefix_id FROM prefixes WHERE prefix_id = {$prefixId}")->fetchColumn()
        );
    }

    private function createPersonnel(?int $prefixId = null): int
    {
        self::$pdo->prepare(
            'INSERT INTO personnel (first_name, last_name, prefix_id) VALUES (?, ?, ?)'
        )->execute(['FK35', 'ทดสอบ', $prefixId]);
        $id = (int) self::$pdo->lastInsertId();
        $this->created[] = ['personnel', 'personnel_id', $id];

        return $id;
    }

    private function createUser(): int
    {
        $username = 'fk35user' . bin2hex(random_bytes(4));
        self::$pdo->prepare(
            'INSERT INTO users (username, password_hash, full_name, role, is_active, must_change_password)
             VALUES (?, ?, ?, ?, 1, 0)'
        )->execute([$username, password_hash('Fk35-Pass-11', PASSWORD_BCRYPT), 'FK35 User', 'operator']);
        $id = (int) self::$pdo->lastInsertId();
        $this->created[] = ['users', 'user_id', $id];

        return $id;
    }

    private function createPrefix(): int
    {
        $code = 'FK' . strtoupper(bin2hex(random_bytes(3)));
        self::$pdo->prepare(
            'INSERT INTO prefixes (prefix_code, prefix_name_th) VALUES (?, ?)'
        )->execute([$code, 'คำนำหน้า FK35']);
        $id = (int) self::$pdo->lastInsertId();
        $this->created[] = ['prefixes', 'prefix_id', $id];

        return $id;
    }
}
