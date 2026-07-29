<?php

declare(strict_types=1);

require_once __DIR__ . '/../TransformHelpers.php';
require_once __DIR__ . '/../CrosswalkService.php';
require_once __DIR__ . '/../SourceAdapterInterface.php';

/**
 * D1: per_personal → personnel
 * Natural key: per_cardno = citizen_id (13-digit)
 * Depends on: D2 (org crosswalk), D3 (position crosswalk), D4 (prefix crosswalk)
 */
class PersonTransformer
{
    public function __construct(
        private PDO $target,
        private SourceAdapterInterface $source,
        private CrosswalkService $crosswalk,
    ) {}

    public function transform(bool $full = false): array
    {
        $result = ['domain' => 'D1', 'created' => 0, 'updated' => 0, 'skipped' => 0, 'errors' => []];

        $since = null;
        if (!$full) {
            $since = $this->crosswalk->lastSyncTime('per_personal');
        }

        $orgMap = $this->crosswalk->buildMap('per_org', 'organization');
        $posMap = $this->crosswalk->buildMap('per_position', 'position');
        $prefixMap = $this->crosswalk->buildMap('per_prename', 'prefixes');

        $upsert = $this->target->prepare(
            'INSERT INTO personnel (citizen_id, first_name, last_name, prefix_id, hire_date,
                current_position_id, current_org_id, current_level_code, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                first_name = VALUES(first_name),
                last_name = VALUES(last_name),
                prefix_id = VALUES(prefix_id),
                hire_date = VALUES(hire_date),
                current_position_id = VALUES(current_position_id),
                current_org_id = VALUES(current_org_id),
                current_level_code = VALUES(current_level_code),
                is_active = VALUES(is_active)'
        );

        foreach ($this->source->fetchRows('per_personal', [
            'per_id', 'per_cardno', 'per_name', 'per_surname', 'per_startdate',
            'pos_id', 'org_id', 'level_no', 'per_status', 'pn_code',
        ], 'update_date', $since) as $row) {
            try {
                $citizenId = TransformHelpers::trimOrNull($row['per_cardno'] ?? null);
                $firstName = TransformHelpers::trimOrNull($row['per_name'] ?? null);
                $lastName = TransformHelpers::trimOrNull($row['per_surname'] ?? null);
                $sourceId = (string) ($row['per_id'] ?? '');

                if ($citizenId === null || $firstName === null || $lastName === null) {
                    $result['skipped']++;
                    continue;
                }

                if (!preg_match('/^\d{13}$/', $citizenId)) {
                    $result['errors'][] = "per_personal [{$sourceId}]: invalid citizen_id format '{$citizenId}'";
                    $result['skipped']++;
                    continue;
                }

                $hireDate = TransformHelpers::beDateToCe($row['per_startdate'] ?? null);
                $levelCode = TransformHelpers::levelCrosswalk($row['level_no'] ?? null);
                $isActive = (int) ($row['per_status'] ?? 0) === 1 ? 1 : 0;

                $prefixId = null;
                $pnCode = TransformHelpers::trimOrNull($row['pn_code'] ?? null);
                if ($pnCode !== null && isset($prefixMap[$pnCode])) {
                    $prefixId = $prefixMap[$pnCode];
                }

                $positionId = null;
                $posSourceId = (string) ($row['pos_id'] ?? '');
                if ($posSourceId !== '' && $posSourceId !== '0' && isset($posMap[$posSourceId])) {
                    $positionId = $posMap[$posSourceId];
                }

                $orgId = null;
                $orgSourceId = (string) ($row['org_id'] ?? '');
                if ($orgSourceId !== '' && $orgSourceId !== '0' && isset($orgMap[$orgSourceId])) {
                    $orgId = $orgMap[$orgSourceId];
                }

                $existed = $this->crosswalk->resolveByNaturalKey('personnel', 'citizen_id', $citizenId);
                $upsert->execute([$citizenId, $firstName, $lastName, $prefixId, $hireDate, $positionId, $orgId, $levelCode, $isActive]);

                $personnelId = $this->crosswalk->resolveByNaturalKey('personnel', 'citizen_id', $citizenId);
                if ($personnelId !== null) {
                    $this->crosswalk->record('per_personal', $sourceId, 'personnel', $personnelId);
                }

                if ($existed !== null) {
                    $result['updated']++;
                } else {
                    $result['created']++;
                }
            } catch (Throwable $e) {
                $result['errors'][] = 'per_personal [' . ($row['per_id'] ?? '?') . ']: ' . $e->getMessage();
            }
        }

        return $result;
    }
}
