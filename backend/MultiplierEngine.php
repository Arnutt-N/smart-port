<?php
// ============================================================================
// MultiplierEngine.php
// Pure / domain helpers for การนับทวีคูณ — HTTP stays in routes/multiplier.php
// ============================================================================

include_once __DIR__ . '/helpers.php';

function computeMultiplierFields(PDO $pdo, int $areaMultiplierId, string $startDateStr, string $endDateStr): array
{
    // ใช้ format ที่มี '|' ต่อท้าย เพื่อ reset เวลาเป็น 00:00:00 (ไม่งั้น createFromFormat
    // จะเติมเวลาปัจจุบัน ทำให้ diff กับวันที่จาก DB (00:00:00) คลาดเคลื่อน ±1 วัน)
    $startDate = DateTime::createFromFormat('Y-m-d|', $startDateStr);
    $endDate = DateTime::createFromFormat('Y-m-d|', $endDateStr);

    if (!$startDate || !$endDate) {
        throw new InvalidArgumentException('รูปแบบวันที่ไม่ถูกต้อง');
    }
    if ($endDate < $startDate) {
        throw new InvalidArgumentException('วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น');
    }

    $areaStmt = $pdo->prepare("
        SELECT *
        FROM special_area_multiplier
        WHERE area_multiplier_id = ? AND is_active = 1
        LIMIT 1
    ");
    $areaStmt->execute([$areaMultiplierId]);
    $area = $areaStmt->fetch(PDO::FETCH_ASSOC);
    if (!$area) {
        throw new InvalidArgumentException('ไม่พบพื้นที่ทวีคูณที่ใช้งานได้');
    }

    $effectiveStart = (new DateTime($area['effective_start_date']))->setTime(0, 0, 0);
    $effectiveEnd = $area['effective_end_date']
        ? (new DateTime($area['effective_end_date']))->setTime(0, 0, 0)
        : clone $endDate;

    $eligibleStart = maxDate($startDate, $effectiveStart);
    $eligibleEnd = minDate($endDate, $effectiveEnd);
    if ($eligibleEnd < $eligibleStart) {
        throw new InvalidArgumentException('ช่วงวันที่ปฏิบัติงานไม่ทับซ้อนกับช่วงที่นับทวีคูณได้');
    }

    $serviceDays = inclusiveDays($startDate, $endDate);
    $eligibleDays = inclusiveDays($eligibleStart, $eligibleEnd);
    $ratio = (float) $area['multiplier_ratio'];
    $effectiveDays = $eligibleDays * $ratio / 100;
    $bonusDays = $eligibleDays * ($ratio - 100) / 100;
    $flooredEffective = (int) floor($effectiveDays);

    $netYears = (int) floor($flooredEffective / 360);
    $netMonths = (int) floor(($flooredEffective % 360) / 30);
    $netDayRemainder = (int) (($flooredEffective % 360) % 30);

    $netEndDate = clone $eligibleStart;
    $netEndDate->modify('+' . max($flooredEffective - 1, 0) . ' days');

    return [
        'area_multiplier_id' => (int) $area['area_multiplier_id'],
        'province' => $area['province'],
        'district' => $area['district'],
        'basis_type' => $area['basis_type'],
        'eligible_start_date' => $eligibleStart->format('Y-m-d'),
        'eligible_end_date' => $eligibleEnd->format('Y-m-d'),
        'service_days' => $serviceDays,
        'eligible_days' => $eligibleDays,
        'multiplier_ratio' => $ratio,
        'effective_days' => $effectiveDays,
        'bonus_days' => $bonusDays,
        'net_end_date' => $netEndDate->format('Y-m-d'),
        'net_years' => $netYears,
        'net_months' => $netMonths,
        'net_day_remainder' => $netDayRemainder,
    ];
}

function decorateAreaRow(array &$row): void
{
    $row['area_multiplier_id'] = (int) $row['area_multiplier_id'];
    $row['multiplier_ratio'] = (float) $row['multiplier_ratio'];
    $row['is_active'] = (int) $row['is_active'];
    $row['effective_start_date_thai'] = formatThaiDate($row['effective_start_date']);
    $row['effective_end_date_thai'] = $row['effective_end_date'] ? formatThaiDate($row['effective_end_date']) : null;
    $row['area_label'] = $row['district']
        ? "{$row['province']} / {$row['district']}"
        : "{$row['province']} / ทั้งจังหวัด";
    $legalReference = trim((string) $row['legal_reference']);
    $sourceReference = trim((string) ($row['source_reference'] ?? ''));
    // SOURCE_PENDING / TEST_SEED = ยังไม่ใช่เอกสาร HR จริง → ติดสถานะรอเอกสาร
    $row['source_pending'] = $legalReference === ''
        || str_contains($legalReference, 'SOURCE_PENDING')
        || str_contains($legalReference, 'TEST_SEED')
        || str_contains($sourceReference, 'SOURCE_PENDING')
        || str_contains($sourceReference, 'TEST_SEED');
}

/**
 * ดึงพื้นที่ 1 แถว (รวมที่ปิดใช้งาน) พร้อม decorate — คืน null ถ้าไม่พบ
 */

function decorateMultiplierRow(array &$row): void
{
    $intFields = [
        'multiplier_id',
        'personnel_id',
        'area_multiplier_id',
        'service_days',
        'eligible_days',
        'net_years',
        'net_months',
        'net_day_remainder',
    ];
    foreach ($intFields as $field) {
        if (isset($row[$field])) {
            $row[$field] = (int) $row[$field];
        }
    }

    foreach (['multiplier_ratio', 'effective_days', 'bonus_days'] as $field) {
        if (isset($row[$field])) {
            $row[$field] = (float) $row[$field];
        }
    }

    $row['area_label'] = $row['district']
        ? "{$row['province']} / {$row['district']}"
        : "{$row['province']} / ทั้งจังหวัด";
    $row['start_date_thai'] = formatThaiDate($row['start_date']);
    $row['end_date_thai'] = formatThaiDate($row['end_date']);
    $row['eligible_start_date_thai'] = formatThaiDate($row['eligible_start_date']);
    $row['eligible_end_date_thai'] = formatThaiDate($row['eligible_end_date']);
    $row['net_end_date_thai'] = formatThaiDate($row['net_end_date']);
}

function inclusiveDays(DateTime $startDate, DateTime $endDate): int
{
    return $endDate->diff($startDate)->days + 1;
}

function maxDate(DateTime $a, DateTime $b): DateTime
{
    return $a > $b ? clone $a : clone $b;
}

function minDate(DateTime $a, DateTime $b): DateTime
{
    return $a < $b ? clone $a : clone $b;
}

/**
 * ตรวจ + normalize input สำหรับเพิ่มพื้นที่ทวีคูณ (pure function — unit-testable)
 * ratio ต้องอยู่ใน [100, 999.99] (เพดาน DECIMAL(5,2)); วันที่ต้องเป็น Y-m-d จริง
 * (เช็ค warning ของ createFromFormat กัน overflow เช่น '2004-13-45')
 *
 * @return array{error: ?string, values: ?array}
 */

function validateAreaInput(array $data): array
{
    $province = trim((string) ($data['province'] ?? ''));
    if ($province === '') {
        return ['error' => 'กรุณาระบุ province', 'values' => null];
    }

    $basisType = trim((string) ($data['basis_type'] ?? ''));
    if ($basisType === '') {
        return ['error' => 'กรุณาระบุ basis_type', 'values' => null];
    }

    $ratioRaw = $data['multiplier_ratio'] ?? null;
    if (!is_numeric($ratioRaw)) {
        return ['error' => 'กรุณาระบุ multiplier_ratio เป็นตัวเลข', 'values' => null];
    }
    $ratio = (float) $ratioRaw;
    if ($ratio < 100.0 || $ratio > 999.99) {
        return ['error' => 'multiplier_ratio ต้องอยู่ระหว่าง 100 ถึง 999.99', 'values' => null];
    }

    $start = parseStrictDate((string) ($data['effective_start_date'] ?? ''));
    if ($start === null) {
        return ['error' => 'effective_start_date ต้องเป็นรูปแบบ YYYY-MM-DD', 'values' => null];
    }

    $end = null;
    $endRaw = trim((string) ($data['effective_end_date'] ?? ''));
    if ($endRaw !== '') {
        $end = parseStrictDate($endRaw);
        if ($end === null) {
            return ['error' => 'effective_end_date ต้องเป็นรูปแบบ YYYY-MM-DD', 'values' => null];
        }
        if ($end < $start) {
            return ['error' => 'effective_end_date ต้องไม่น้อยกว่า effective_start_date', 'values' => null];
        }
    }

    $legal = trim((string) ($data['legal_reference'] ?? ''));
    if (mb_strlen($legal) > 300) {
        return ['error' => 'legal_reference ยาวเกิน 300 ตัวอักษร', 'values' => null];
    }

    $source = trim((string) ($data['source_reference'] ?? ''));
    if (mb_strlen($source) > 500) {
        return ['error' => 'source_reference ยาวเกิน 500 ตัวอักษร', 'values' => null];
    }

    $district = trim((string) ($data['district'] ?? ''));

    return ['error' => null, 'values' => [
        'province' => $province,
        'district' => $district === '' ? null : $district,
        'basis_type' => $basisType,
        'multiplier_ratio' => $ratio,
        'effective_start_date' => $start->format('Y-m-d'),
        'effective_end_date' => $end?->format('Y-m-d'),
        'legal_reference' => $legal === '' ? null : $legal,
        'source_reference' => $source === '' ? null : $source,
    ]];
}

/**
 * parse Y-m-d แบบเข้มงวด — คืน null ถ้า format ผิดหรือมี overflow (เดือน 13, วัน 45)
 * ('Y-m-d|' reset เวลาเป็น 00:00:00 ตาม pattern เดิมใน computeMultiplierFields)
 */

function parseStrictDate(string $value): ?DateTime
{
    $date = DateTime::createFromFormat('Y-m-d|', $value);
    $errors = DateTime::getLastErrors();
    if (
        $date === false
        || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
    ) {
        return null;
    }
    return $date;
}

