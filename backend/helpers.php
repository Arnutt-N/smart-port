<?php
// ============================================================================
// helpers.php
// Shared utility functions for Smart Port API
// ฟังก์ชันช่วยเหลือที่ใช้ร่วมกันระหว่าง candidate list และ probation endpoints
// ============================================================================

/**
 * แปลงวันที่เป็นรูปแบบไทย (พ.ศ.)
 * Convert date string to Thai format with Buddhist Era year
 *
 * @param string|null $dateStr Date string in Y-m-d format (e.g. "2026-03-22")
 * @return string|null Thai formatted date (e.g. "22 มี.ค. 2569") or null
 */
function formatThaiDate(?string $dateStr): ?string
{
    if ($dateStr === null || $dateStr === '') {
        return null;
    }

    $thaiMonths = [
        '', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];

    $timestamp = strtotime($dateStr);
    if ($timestamp === false) {
        return null;
    }

    $day = (int) date('j', $timestamp);
    $month = (int) date('n', $timestamp);
    $year = (int) date('Y', $timestamp) + 543; // พ.ศ. = ค.ศ. + 543

    return "{$day} {$thaiMonths[$month]} {$year}";
}

/**
 * แปลงรหัสระดับเป็นชื่อภาษาไทย
 * Convert level code to Thai level name
 *
 * @param string $code Level code (e.g. "K1", "O2")
 * @return string Thai level name or the code itself if not found
 */
function getLevelName(string $code): string
{
    $levelNames = [
        'K1' => 'ปฏิบัติการ',
        'K2' => 'ชำนาญการ',
        'K3' => 'ชำนาญการพิเศษ',
        'K4' => 'เชี่ยวชาญ',
        'K5' => 'ทรงคุณวุฒิ',
        'O1' => 'ปฏิบัติงาน',
        'O2' => 'ชำนาญงาน',
        'O3' => 'อาวุโส',
        'M1' => 'อำนวยการ ต้น',
        'M2' => 'อำนวยการ สูง',
        'S1' => 'บริหาร ต้น',
        'S2' => 'บริหาร สูง',
    ];

    return $levelNames[$code] ?? $code;
}
