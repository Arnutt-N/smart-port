<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../auth.php';

final class AuthHeaderTest extends TestCase
{
    #[Test]
    public function bearer_token_is_read_from_a_case_insensitive_authorization_header(): void
    {
        $token = extractBearerTokenFromRequest([], [
            'authorization' => 'Bearer test-jwt',
        ]);

        self::assertSame('test-jwt', $token);
    }
}
