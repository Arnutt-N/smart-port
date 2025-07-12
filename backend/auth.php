<?php
// สำหรับมือใหม่: JWT คือ "ตั๋วเข้า" – ใช้เพื่อยืนยันตัวตนผู้ใช้
require_once 'vendor/autoload.php'; // จาก composer install firebase/php-jwt
use \Firebase\JWT\JWT;
use \Firebase\JWT\Key;

function generateJWT($user_id)
{
    $payload = [
        'iat' => time(),
        'exp' => time() + 3600, // หมดอายุ 1 ชม.
        'data' => ['user_id' => $user_id]
    ];
    return JWT::encode($payload, JWT_SECRET, 'HS256');
}

function validateJWT($token)
{
    try {
        $decoded = JWT::decode($token, new Key(JWT_SECRET, 'HS256'));
        return $decoded->data->user_id;
    } catch (Exception $e) {
        return false;
    }
}
