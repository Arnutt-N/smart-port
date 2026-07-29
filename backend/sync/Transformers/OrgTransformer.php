<?php

declare(strict_types=1);

require_once __DIR__ . '/../TransformHelpers.php';
require_once __DIR__ . '/../CrosswalkService.php';
require_once __DIR__ . '/../SourceAdapterInterface.php';

/**
 * D2: per_org → organization (import only org_active = 1)
 */
class OrgTransformer
{
    public function __construct(
        private PDO $target,
        private SourceAdapterInterface $source,
        private CrosswalkService $crosswalk,
    ) {}

    public function transform(bool $full = false): array
    {
        $result = ['domain' => 'D2', 'created' => 0, 'updated' => 0, 'skipped' => 0, 'errors' => []];

        $since = null;
        if (!$full) {
            $since = $this->crosswalk->lastSyncTime('per_org');
        }

        foreach ($this->source->fetchRows('per_org', ['org_id', 'org_code', 'org_name', 'org_active'], 'update_date', $since) as $row) {
            try {
                if ((int) ($row['org_active'] ?? 0) !== 1) {
                    $result['skipped']++;
                    continue;
                }

                $orgCode = TransformHelpers::trimOrNull($row['org_code'] ?? null);
                $orgName = TransformHelpers::trimOrNull($row['org_name'] ?? null);
                $sourceId = (string) ($row['org_id'] ?? '');

                if ($orgCode === null || $orgName === null || $sourceId === '') {
                    $result['skipped']++;
                    continue;
                }

                $existingId = $this->crosswalk->resolveByNaturalKey('organization', 'org_code', $orgCode);

                if ($existingId !== null) {
                    $upd = $this->target->prepare('UPDATE organization SET org_name = ? WHERE org_id = ?');
                    $upd->execute([$orgName, $existingId]);
                    $this->crosswalk->record('per_org', $sourceId, 'organization', $existingId);
                    $result['updated']++;
                } else {
                    $ins = $this->target->prepare('INSERT INTO organization (org_name, org_code) VALUES (?, ?)');
                    $ins->execute([$orgName, $orgCode]);
                    $newId = (int) $this->target->lastInsertId();
                    $this->crosswalk->record('per_org', $sourceId, 'organization', $newId);
                    $result['created']++;
                }
            } catch (Throwable $e) {
                $result['errors'][] = 'per_org [' . ($row['org_id'] ?? '?') . ']: ' . $e->getMessage();
            }
        }

        return $result;
    }
}
