<?php

declare(strict_types=1);

require_once __DIR__ . '/../TransformHelpers.php';
require_once __DIR__ . '/../CrosswalkService.php';
require_once __DIR__ . '/../SourceAdapterInterface.php';

/**
 * D5: per_positionhis → personnel_position_history
 * Composite natural key: personnel_id + effective_date + position_name
 * Depends on: D1 (person crosswalk), D2 (org crosswalk), D3 (position crosswalk)
 */
class PositionHistoryTransformer
{
    public function __construct(
        private PDO $target,
        private SourceAdapterInterface $source,
        private CrosswalkService $crosswalk,
    ) {}

    public function transform(bool $full = false): array
    {
        $result = ['domain' => 'D5', 'created' => 0, 'updated' => 0, 'skipped' => 0, 'errors' => []];

        $since = null;
        if (!$full) {
            $since = $this->crosswalk->lastSyncTime('per_positionhis');
        }

        $personMap = $this->crosswalk->buildMap('per_personal', 'personnel');
        $orgMap = $this->crosswalk->buildMap('per_org', 'organization');
        $posMap = $this->crosswalk->buildMap('per_position', 'position');
        $lineMap = $this->source->fetchLookup('per_line', 'pl_code', 'pl_name');
        $provinceMap = $this->source->fetchLookup('per_province', 'pv_code', 'pv_name');

        $checkStmt = $this->target->prepare(
            'SELECT history_id FROM personnel_position_history
             WHERE personnel_id = ? AND effective_date = ? AND position_name = ?
             LIMIT 1'
        );

        $insertStmt = $this->target->prepare(
            'INSERT INTO personnel_position_history
                (personnel_id, position_id, org_id, position_name, position_level, effective_date, end_date, order_number, order_date, job_series_name, province)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );

        $updateStmt = $this->target->prepare(
            'UPDATE personnel_position_history
             SET position_id = ?, org_id = ?, position_level = ?, end_date = ?, order_number = ?, order_date = ?, job_series_name = ?, province = ?
             WHERE history_id = ?'
        );

        foreach ($this->source->fetchRows('per_positionhis', [
            'poh_id', 'per_id', 'poh_effectivedate', 'poh_enddate', 'poh_pos_no',
            'org_id_3', 'level_no', 'poh_docno', 'poh_docdate', 'pl_code', 'pv_code',
        ], 'update_date', $since) as $row) {
            try {
                $sourceId = (string) ($row['poh_id'] ?? '');
                $perSourceId = (string) ($row['per_id'] ?? '');

                $personnelId = $personMap[$perSourceId] ?? null;
                if ($personnelId === null) {
                    $result['skipped']++;
                    continue;
                }

                $effectiveDate = TransformHelpers::beDateToCe($row['poh_effectivedate'] ?? null);
                if ($effectiveDate === null) {
                    $result['skipped']++;
                    continue;
                }

                $posNo = TransformHelpers::trimOrNull($row['poh_pos_no'] ?? null);
                $plCode = TransformHelpers::trimOrNull($row['pl_code'] ?? null);
                $jobSeriesName = $plCode !== null ? ($lineMap[$plCode] ?? $plCode) : null;
                $positionName = $jobSeriesName ?? $posNo ?? 'ไม่ระบุ';

                $positionId = null;
                if ($posNo !== null && isset($posMap[$posNo])) {
                    $positionId = $posMap[$posNo];
                }

                $orgId = null;
                $orgSourceId = (string) ($row['org_id_3'] ?? '');
                if ($orgSourceId !== '' && $orgSourceId !== '0' && isset($orgMap[$orgSourceId])) {
                    $orgId = $orgMap[$orgSourceId];
                }

                $level = TransformHelpers::levelCrosswalk($row['level_no'] ?? null);
                $endDate = TransformHelpers::beDateToCe($row['poh_enddate'] ?? null);
                $orderNumber = TransformHelpers::trimOrNull($row['poh_docno'] ?? null);
                $orderDate = TransformHelpers::beDateToCe($row['poh_docdate'] ?? null);

                $pvCode = TransformHelpers::trimOrNull($row['pv_code'] ?? null);
                $province = $pvCode !== null ? ($provinceMap[$pvCode] ?? $pvCode) : null;

                $checkStmt->execute([$personnelId, $effectiveDate, $positionName]);
                $existingId = $checkStmt->fetchColumn();

                if ($existingId !== false) {
                    $updateStmt->execute([$positionId, $orgId, $level, $endDate, $orderNumber, $orderDate, $jobSeriesName, $province, (int) $existingId]);
                    $this->crosswalk->record('per_positionhis', $sourceId, 'personnel_position_history', (int) $existingId);
                    $result['updated']++;
                } else {
                    $insertStmt->execute([$personnelId, $positionId, $orgId, $positionName, $level, $effectiveDate, $endDate, $orderNumber, $orderDate, $jobSeriesName, $province]);
                    $newId = (int) $this->target->lastInsertId();
                    $this->crosswalk->record('per_positionhis', $sourceId, 'personnel_position_history', $newId);
                    $result['created']++;
                }
            } catch (Throwable $e) {
                $result['errors'][] = 'per_positionhis [' . ($row['poh_id'] ?? '?') . ']: ' . $e->getMessage();
            }
        }

        return $result;
    }
}
