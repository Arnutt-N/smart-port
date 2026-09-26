<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../auth.php';

/**
 * D3 — session อ่านจาก httpOnly cookie (cut over จาก Authorization header).
 * ไม่ต้อง DB (getAuthHeader/isHttpsRequest/authCookieParams ไม่แตะ PDO).
 */
final class AuthCookieTest extends TestCase
{
    protected function tearDown(): void
    {
        unset(
            $_COOKIE[AUTH_ACCESS_COOKIE],
            $_SERVER['HTTPS'],
            $_SERVER['HTTP_X_FORWARDED_PROTO'],
            $_SERVER['HTTP_AUTHORIZATION']
        );
    }

    #[Test]
    public function access_jwt_is_read_from_cookie(): void
    {
        $_COOKIE[AUTH_ACCESS_COOKIE] = 'test-jwt-from-cookie';

        self::assertSame('test-jwt-from-cookie', getAuthHeader());
    }

    #[Test]
    public function missing_or_empty_cookie_yields_null(): void
    {
        unset($_COOKIE[AUTH_ACCESS_COOKIE]);
        self::assertNull(getAuthHeader());

        $_COOKIE[AUTH_ACCESS_COOKIE] = '';
        self::assertNull(getAuthHeader());
    }

    #[Test]
    public function authorization_header_is_ignored_after_cutover(): void
    {
        // ไม่มี cookie แต่มี header — ต้องไม่ได้ token (cut over ไม่มี dual-read)
        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer header-jwt';

        self::assertNull(getAuthHeader());
    }

    #[Test]
    public function https_detection_covers_direct_and_proxied_tls(): void
    {
        unset($_SERVER['HTTPS'], $_SERVER['HTTP_X_FORWARDED_PROTO']);
        self::assertFalse(isHttpsRequest());

        $_SERVER['HTTPS'] = 'on';
        self::assertTrue(isHttpsRequest());

        $_SERVER['HTTPS'] = 'off';
        self::assertFalse(isHttpsRequest());

        unset($_SERVER['HTTPS']);
        $_SERVER['HTTP_X_FORWARDED_PROTO'] = 'https';
        self::assertTrue(isHttpsRequest());

        $_SERVER['HTTP_X_FORWARDED_PROTO'] = 'http';
        self::assertFalse(isHttpsRequest());
    }

    #[Test]
    public function cookie_params_carry_security_flags(): void
    {
        unset($_SERVER['HTTPS'], $_SERVER['HTTP_X_FORWARDED_PROTO']);
        $expires = time() + 900;
        $params = authCookieParams('/api/auth', $expires);

        self::assertSame('/api/auth', $params['path']);
        self::assertTrue($params['httponly']);
        self::assertSame('Lax', $params['samesite']);
        self::assertFalse($params['secure'], 'http ตรงต้องไม่มี Secure (ไม่งั้น dev ส่ง cookie ไม่ได้)');
        self::assertSame($expires, $params['expires'], 'persistent cookie ต้องใช้ timestamp ที่ส่งเข้ามาตรง ๆ');
    }

    #[Test]
    public function session_cookie_omits_expires_key(): void
    {
        // remember=off → null = session cookie (ไม่มี key expires เลย)
        $params = authCookieParams('/');

        self::assertArrayNotHasKey('expires', $params);
        self::assertSame('/', $params['path']);
        self::assertTrue($params['httponly']);
        self::assertSame('Lax', $params['samesite']);
    }

    #[Test]
    public function clear_auth_cookies_emits_past_expiry_on_original_paths(): void
    {
        $GLOBALS['__capture_cookies'] = [];
        $before = time() - 3600;
        clearAuthCookies();
        $captured = $GLOBALS['__capture_cookies'];
        unset($GLOBALS['__capture_cookies']);

        self::assertCount(2, $captured);
        self::assertSame(AUTH_ACCESS_COOKIE, $captured[0]['name']);
        self::assertSame('/', $captured[0]['params']['path']);
        self::assertLessThanOrEqual($before, $captured[0]['params']['expires']);
        self::assertSame(AUTH_REFRESH_COOKIE, $captured[1]['name']);
        self::assertSame(AUTH_REFRESH_COOKIE_PATH, $captured[1]['params']['path']);
        self::assertLessThanOrEqual($before, $captured[1]['params']['expires']);
    }

    #[Test]
    public function cookie_params_set_secure_behind_https_proxy(): void
    {
        $_SERVER['HTTP_X_FORWARDED_PROTO'] = 'https';

        self::assertTrue(authCookieParams('/', time() + 3600)['secure']);
        self::assertTrue(authCookieParams('/', null)['secure']);
    }
}
