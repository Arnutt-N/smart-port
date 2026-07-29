<?php

declare(strict_types=1);

/**
 * Pure transform functions for legacy HR → Smart Port sync (date/year/level conversion).
 */
class TransformHelpers
{
    private const BE_OFFSET = 543;
    private const BE_THRESHOLD = 2400;

    private const LEVEL_MAP = [
        '01' => 'K1', '02' => 'K2', '03' => 'K3', '04' => 'K4', '05' => 'K5',
        '06' => 'M1', '07' => 'M2',
        '08' => 'S1', '09' => 'S2',
        '10' => 'O1', '11' => 'O2', '12' => 'O3',
    ];

    /**
     * G1: Convert Buddhist Era datetime string to CE date.
     * Source: CHAR(19) 'YYYY-MM-DD HH:MM:SS' (BE) → Target: 'YYYY-MM-DD' (CE DATE)
     */
    public static function beDateToCe(?string $raw): ?string
    {
        if ($raw === null || trim($raw) === '') {
            return null;
        }

        $raw = trim($raw);
        $datePart = substr($raw, 0, 10);
        $parts = explode('-', $datePart);

        if (count($parts) !== 3) {
            return null;
        }

        $year = (int) $parts[0];
        $month = (int) $parts[1];
        $day = (int) $parts[2];

        if ($year > self::BE_THRESHOLD) {
            $year -= self::BE_OFFSET;
        }

        if ($month < 1 || $month > 12 || $day < 1 || $day > 31) {
            return null;
        }

        return sprintf('%04d-%02d-%02d', $year, $month, $day);
    }

    /**
     * G2: Convert Buddhist Era year to CE.
     * Source: CHAR(4) 'YYYY' (BE) → Target: int (CE year)
     */
    public static function beYearToCe(?string $raw): ?int
    {
        if ($raw === null || trim($raw) === '') {
            return null;
        }

        $year = (int) trim($raw);

        if ($year === 0) {
            return null;
        }

        if ($year > self::BE_THRESHOLD) {
            $year -= self::BE_OFFSET;
        }

        return $year;
    }

    /**
     * D1/D5 level crosswalk: source level_no CHAR(2) → Smart Port level code.
     * '01'→'K1', '02'→'K2', ..., '12'→'O3' (ระบบแท่ง ก.พ.)
     */
    public static function levelCrosswalk(?string $levelNo): ?string
    {
        if ($levelNo === null || trim($levelNo) === '') {
            return null;
        }

        $key = str_pad(trim($levelNo), 2, '0', STR_PAD_LEFT);

        return self::LEVEL_MAP[$key] ?? null;
    }

    /**
     * G4: Trim whitespace; return null if empty.
     */
    public static function trimOrNull(?string $val): ?string
    {
        if ($val === null) {
            return null;
        }

        $trimmed = trim($val);

        return $trimmed === '' ? null : $trimmed;
    }

    /**
     * G1 variant: return full DATETIME string (CE) when source has time component.
     */
    public static function beDatetimeToCe(?string $raw): ?string
    {
        if ($raw === null || trim($raw) === '') {
            return null;
        }

        $raw = trim($raw);
        $datePart = self::beDateToCe($raw);

        if ($datePart === null) {
            return null;
        }

        if (strlen($raw) >= 19) {
            $timePart = substr($raw, 11, 8);
            return $datePart . ' ' . $timePart;
        }

        return $datePart;
    }
}
