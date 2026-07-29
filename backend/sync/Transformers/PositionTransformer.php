<?php

declare(strict_types=1);

require_once __DIR__ . '/../TransformHelpers.php';
require_once __DIR__ . '/../CrosswalkService.php';
require_once __DIR__ . '/../SourceAdapterInterface.php';

/**
 * D3: per_position → position (import only pos_status = 1, lookup per_line for name)
 */
class PositionTransformer
{
    public function __construct(
        private PDO $target,
        private SourceAdapterInterface $source,
        private CrosswalkService $crosswalk,
    ) {}

    public function transform(bool $full = false): array
    {
        $result = ['domain' => 'D3', 'created' => 0, 'updated' => 0, 'skipped' => 0, 'errors' => []];

        $since = null;
        if (!$full) {
            $since = $this->crosswalk->lastSyncTime('per_position');
        }

        $lineMap = $this->source->fetchLookup('per_line', 'pl_code', 'pl_name');

        foreach ($this->source->fetchRows('per_position', ['pos_id', 'pos_no', 'pl_code', 'pos_status'], 'update_date', $since) as $row) {
            try {
                if ((int) ($row['pos_status'] ?? 0) !== 1) {
                    $result['skipped']++;
                    continue;
                }

                $posNo = TransformHelpers::trimOrNull($row['pos_no'] ?? null);
                $sourceId = (string) ($row['pos_id'] ?? '');

                if ($posNo === null || $sourceId === '') {
                    $result['skipped']++;
                    continue;
                }

                $plCode = TransformHelpers::trimOrNull($row['pl_code'] ?? null);
                $positionName = $plCode !== null ? ($lineMap[$plCode] ?? $plCode) : $posNo;

                $existingId = $this->crosswalk->resolveByNaturalKey('position', 'position_code', $posNo);

                if ($existingId !== null) {
                    $upd = $this->target->prepare('UPDATE `position` SET position_name = ? WHERE position_id = ?');
                    $upd->execute([$positionName, $existingId]);
                    $this->crosswalk->record('per_position', $sourceId, 'position', $existingId);
                    $result['updated']++;
                } else {
                    $ins = $this->target->prepare('INSERT INTO `position` (position_name, position_code) VALUES (?, ?)');
                    $ins->execute([$positionName, $posNo]);
                    $newId = (int) $this->target->lastInsertId();
                    $this->crosswalk->record('per_position', $sourceId, 'position', $newId);
                    $result['created']++;
                }
            } catch (Throwable $e) {
                $result['errors'][] = 'per_position [' . ($row['pos_id'] ?? '?') . ']: ' . $e->getMessage();
            }
        }

        return $result;
    }
}
