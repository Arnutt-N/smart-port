<?php

declare(strict_types=1);

namespace Tests\Unit;

use PDO;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/csp_summary.php';

/**
 * auth + input validation ของ GET /api/csp-report/summary — ไม่แตะ DB (dbFactory ปลอมคืน null
 * เสมอ เว้นแต่เทสจะส่งมาเอง) เทสชุดนี้ล็อกพฤติกรรม fail-closed ไว้: ไม่ตั้ง env = 503 ไม่ใช่
 * เปิดให้อ่านฟรี
 *
 * token ที่ใช้ในเทสนี้ต้องยาว >= CSP_SUMMARY_TOKEN_MIN_LENGTH (32 ตัวอักษร) เสมอ ไม่งั้นจะโดน
 * guard I3 (token สั้น = fail-closed 503) ตัดหน้าก่อนถึงเคสที่เทสตั้งใจจะตรวจจริง
 */
final class CspSummaryAuthTest extends TestCase
{
    /**
     * 46 ตัวอักษร — ยาวกว่า CSP_SUMMARY_TOKEN_MIN_LENGTH (32) พอที่จะไม่ชนขอบเขต guard I3
     * โดยไม่ต้องนับเป๊ะ ๆ (setUp() ยืนยันความยาวด้วย assertGreaterThanOrEqual() ซ้ำอีกชั้น)
     */
    private const VALID_TOKEN = 'valid-test-token-0123456789-ok-and-long-enough';

    /** ค่า env/header เดิมก่อนเทสแตะ — คืนกลับใน tearDown() แทนการ putenv() ล้างทิ้งถาวร (M4) */
    private ?string $originalToken = null;
    private ?string $originalHeader = null;

    protected function setUp(): void
    {
        self::assertGreaterThanOrEqual(
            CSP_SUMMARY_TOKEN_MIN_LENGTH,
            strlen(self::VALID_TOKEN),
            'VALID_TOKEN ของเทสนี้ต้องผ่าน guard ความยาวขั้นต่ำเอง ไม่งั้นเทสจะพังเพราะเหตุผลผิด'
        );

        $currentToken = getenv('CSP_SUMMARY_TOKEN');
        $this->originalToken = $currentToken === false ? null : $currentToken;
        $this->originalHeader = $_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] ?? null;

        putenv('CSP_SUMMARY_TOKEN');
        unset($_SERVER['HTTP_X_CSP_SUMMARY_TOKEN']);
        // Issue #113 code review M2: sentinel ที่ไม่ใช่โค้ดจริงตัวไหนที่ handler คืน — เดิมตั้ง
        // เป็น 200 ไว้ ทำให้ assertSame(200, ...) ของเคสสำเร็จผ่านลอย ๆ เสมอเพราะ setUp() ตั้งไว้
        // ก่อนแล้ว ไม่ใช่เพราะ handler ตั้งเอง (handler ตอนนั้นไม่เคยเรียก http_response_code()
        // ในเส้นทางสำเร็จ) เปลี่ยนมาใช้ 418 เพื่อให้เคสสำเร็จพิสูจน์ได้จริงว่า handler ตั้ง 200 เอง
        http_response_code(418);
    }

    protected function tearDown(): void
    {
        if ($this->originalToken === null) {
            putenv('CSP_SUMMARY_TOKEN');
        } else {
            putenv('CSP_SUMMARY_TOKEN=' . $this->originalToken);
        }
        if ($this->originalHeader === null) {
            unset($_SERVER['HTTP_X_CSP_SUMMARY_TOKEN']);
        } else {
            $_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] = $this->originalHeader;
        }
        http_response_code(418);
    }

    /** @return array{status:int, body:array} */
    private function call(string $method, array $query, ?callable $dbFactory = null): array
    {
        ob_start();
        // ไม่ส่ง $dbFactory มา = ใช้ตัวปลอมที่คืน null เสมอ กัน unit test แตะ DB จริง
        // (ตรงกับพฤติกรรมเดิมที่เคยส่ง $pdo = null ตรง ๆ ก่อนแก้ I1)
        handleCspSummary($method, $query, $dbFactory ?? static fn (): ?PDO => null);
        $body = (string) ob_get_clean();
        return ['status' => http_response_code(), 'body' => json_decode($body, true) ?? []];
    }

    #[Test]
    public function it_returns_503_when_the_token_env_is_not_configured(): void
    {
        $result = $this->call('GET', []);

        $this->assertSame(503, $result['status']);
        $this->assertSame('summary endpoint not configured', $result['body']['error']);
    }

    #[Test]
    public function it_does_not_call_the_db_factory_when_the_token_env_is_not_configured(): void
    {
        // Issue #113 code review I1: ยังไม่ผ่าน token check เลยต้องไม่แตะ DB — ส่ง factory
        // ที่ตั้ง flag เมื่อถูกเรียก แล้วยืนยันว่า flag ยังเป็น false หลังได้ 503
        $called = false;
        $dbFactory = static function () use (&$called): ?PDO {
            $called = true;
            return null;
        };

        $result = $this->call('GET', [], $dbFactory);

        $this->assertSame(503, $result['status']);
        $this->assertFalse($called, 'ยังไม่มี token ต้องไม่มีการเรียก dbFactory เลย');
    }

    #[Test]
    public function it_returns_503_when_the_token_is_too_short_to_resist_guessing(): void
    {
        // Issue #113 code review I3: controller ruling — token สั้นกว่า 32 ตัวอักษร
        // ต้อง fail-closed เป็น 503 เหมือนไม่ได้ตั้งค่าเลย (ไม่บอกสาเหตุจริงให้ client)
        $short = str_repeat('a', CSP_SUMMARY_TOKEN_MIN_LENGTH - 1);
        putenv('CSP_SUMMARY_TOKEN=' . $short);
        $_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] = $short;

        $called = false;
        $dbFactory = static function () use (&$called): ?PDO {
            $called = true;
            return null;
        };
        $result = $this->call('GET', [], $dbFactory);

        $this->assertSame(503, $result['status']);
        $this->assertSame('summary endpoint not configured', $result['body']['error']);
        $this->assertFalse($called, 'token สั้นเกินไปต้องไม่มีการเรียก dbFactory เลย');
    }

    #[Test]
    public function it_returns_401_when_the_token_does_not_match(): void
    {
        putenv('CSP_SUMMARY_TOKEN=' . self::VALID_TOKEN);
        $_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] = 'wrong-token';

        $this->assertSame(401, $this->call('GET', [])['status']);
    }

    #[Test]
    public function it_does_not_call_the_db_factory_when_the_token_does_not_match(): void
    {
        // Issue #113 code review I1: token ผิดต้องไม่แตะ DB เช่นกัน
        putenv('CSP_SUMMARY_TOKEN=' . self::VALID_TOKEN);
        $_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] = 'wrong-token';

        $called = false;
        $dbFactory = static function () use (&$called): ?PDO {
            $called = true;
            return null;
        };
        $result = $this->call('GET', [], $dbFactory);

        $this->assertSame(401, $result['status']);
        $this->assertFalse($called, 'token ไม่ตรงต้องไม่มีการเรียก dbFactory เลย');
    }

    #[Test]
    public function it_returns_401_when_the_token_header_is_missing(): void
    {
        putenv('CSP_SUMMARY_TOKEN=' . self::VALID_TOKEN);

        $this->assertSame(401, $this->call('GET', [])['status']);
    }

    #[Test]
    public function it_rejects_a_days_value_outside_the_allowed_range(): void
    {
        putenv('CSP_SUMMARY_TOKEN=' . self::VALID_TOKEN);
        $_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] = self::VALID_TOKEN;

        $this->assertSame(400, $this->call('GET', ['days' => '0'])['status']);
        http_response_code(418);
        $this->assertSame(400, $this->call('GET', ['days' => '91'])['status']);
    }

    #[Test]
    public function it_answers_with_the_summary_shape_when_the_token_matches(): void
    {
        putenv('CSP_SUMMARY_TOKEN=' . self::VALID_TOKEN);
        $_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] = self::VALID_TOKEN;

        $result = $this->call('GET', ['days' => '7']);

        $this->assertSame(200, $result['status']);
        // dbFactory ปลอมคืน null → storage ต้องเป็น unavailable ไม่ใช่ ready ที่มี 0 violation
        $this->assertSame('unavailable', $result['body']['storage']);
        $this->assertSame(7, $result['body']['window_days']);
    }

    #[Test]
    public function it_calls_the_db_factory_exactly_once_when_the_token_matches(): void
    {
        // Issue #113 code review I1: หลัง auth ผ่านครบทุกด่านแล้วเท่านั้นที่ควรแตะ DB
        putenv('CSP_SUMMARY_TOKEN=' . self::VALID_TOKEN);
        $_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] = self::VALID_TOKEN;

        $calls = 0;
        $dbFactory = static function () use (&$calls): ?PDO {
            $calls++;
            return null;
        };
        $result = $this->call('GET', ['days' => '7'], $dbFactory);

        $this->assertSame(200, $result['status']);
        $this->assertSame(1, $calls, 'auth ผ่านแล้วต้องเรียก dbFactory ครั้งเดียวพอดี');
    }

    #[Test]
    public function it_falls_back_to_storage_unavailable_when_the_db_factory_throws(): void
    {
        // Issue #113 code review I1: ถ้า dbFactory() throw (เช่น buildSslOptions() หา CA
        // ไม่เจอ) handler ต้องครอบไว้เอง แล้วถือว่าไม่มี DB (storage=unavailable) — ไม่ใช่ 500
        putenv('CSP_SUMMARY_TOKEN=' . self::VALID_TOKEN);
        $_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] = self::VALID_TOKEN;

        $dbFactory = static function (): ?PDO {
            throw new \RuntimeException('simulated buildSslOptions() failure');
        };
        $result = $this->call('GET', ['days' => '7'], $dbFactory);

        $this->assertSame(200, $result['status'], 'DB connect ล้มเหลวต้องไม่กลายเป็น 500');
        $this->assertSame('unavailable', $result['body']['storage']);
    }

    #[Test]
    public function it_rejects_non_get_methods(): void
    {
        putenv('CSP_SUMMARY_TOKEN=' . self::VALID_TOKEN);
        $_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] = self::VALID_TOKEN;

        $this->assertSame(405, $this->call('POST', [])['status']);
    }
}
