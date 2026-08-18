<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../routes/csp_summary.php';

/**
 * auth + input validation ของ GET /api/csp-report/summary — ไม่แตะ DB (ส่ง $pdo = null)
 * เทสชุดนี้ล็อกพฤติกรรม fail-closed ไว้: ไม่ตั้ง env = 503 ไม่ใช่เปิดให้อ่านฟรี
 */
final class CspSummaryAuthTest extends TestCase
{
    protected function setUp(): void
    {
        putenv('CSP_SUMMARY_TOKEN');
        unset($_SERVER['HTTP_X_CSP_SUMMARY_TOKEN']);
        http_response_code(200);
    }

    protected function tearDown(): void
    {
        putenv('CSP_SUMMARY_TOKEN');
        unset($_SERVER['HTTP_X_CSP_SUMMARY_TOKEN']);
    }

    /** @return array{status:int, body:array} */
    private function call(string $method, array $query): array
    {
        ob_start();
        handleCspSummary(null, $method, $query);
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
    public function it_returns_401_when_the_token_does_not_match(): void
    {
        putenv('CSP_SUMMARY_TOKEN=correct-token');
        $_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] = 'wrong-token';

        $this->assertSame(401, $this->call('GET', [])['status']);
    }

    #[Test]
    public function it_returns_401_when_the_token_header_is_missing(): void
    {
        putenv('CSP_SUMMARY_TOKEN=correct-token');

        $this->assertSame(401, $this->call('GET', [])['status']);
    }

    #[Test]
    public function it_rejects_a_days_value_outside_the_allowed_range(): void
    {
        putenv('CSP_SUMMARY_TOKEN=correct-token');
        $_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] = 'correct-token';

        $this->assertSame(400, $this->call('GET', ['days' => '0'])['status']);
        http_response_code(200);
        $this->assertSame(400, $this->call('GET', ['days' => '91'])['status']);
    }

    #[Test]
    public function it_answers_with_the_summary_shape_when_the_token_matches(): void
    {
        putenv('CSP_SUMMARY_TOKEN=correct-token');
        $_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] = 'correct-token';

        $result = $this->call('GET', ['days' => '7']);

        $this->assertSame(200, $result['status']);
        // $pdo = null → storage ต้องเป็น unavailable ไม่ใช่ ready ที่มี 0 violation
        $this->assertSame('unavailable', $result['body']['storage']);
        $this->assertSame(7, $result['body']['window_days']);
    }

    #[Test]
    public function it_rejects_non_get_methods(): void
    {
        putenv('CSP_SUMMARY_TOKEN=correct-token');
        $_SERVER['HTTP_X_CSP_SUMMARY_TOKEN'] = 'correct-token';

        $this->assertSame(405, $this->call('POST', [])['status']);
    }
}
