<?php

declare(strict_types=1);

require_once __DIR__ . '/../TransformHelpers.php';
require_once __DIR__ . '/../CrosswalkService.php';
require_once __DIR__ . '/../SourceAdapterInterface.php';

/**
 * D6: per_decoratehis (+ per_decoration lookup) → royal_decorations
 * Natural key: servant_id + decoration_name + received_year
 * received_year stores Buddhist Era (validation 2400-2700) — NO CE conversion
 */
class DecorationTransformer
{
    public function __construct(
        private PDO $target,
        private SourceAdapterInterface $source,
        private CrosswalkService $crosswalk,
    ) {}

    public function transform(bool $full = false): array
    {
        $result = ['domain' => 'D6', 'created' => 0, 'updated' => 0, 'skipped' => 0, 'errors' => []];

        $since = null;
        if (!$full) {
            $since = $this->crosswalk->lastSyncTime('per_decoratehis');
        }

        $personMap = $this->crosswalk->buildMap('per_personal', 'personnel');
        $decorationMap = $this->source->fetchLookup('per_decoration', 'dc_code', 'dc_name');
        $classMap = $this->source->fetchLookup('per_decoration', 'dc_code', 'dc_shortname');

        $checkStmt = $this->target->prepare(
            'SELECT decoration_id FROM royal_decorations
             WHERE servant_id = ? AND decoration_name = ? AND received_year = ?
             LIMIT 1'
        );

        $insertStmt = $this->target->prepare(
            'INSERT INTO royal_decorations (servant_id, decoration_name, decoration_class, received_year, gazette_ref)
             VALUES (?, ?, ?, ?, ?)'
        );

        foreach ($this->source->fetchRows('per_decoratehis', [
            'deh_id', 'per_id', 'per_cardno', 'dc_code', 'deh_date', 'deh_gazette',
        ], 'update_date', $since) as $row) {
            try {
                $sourceId = (string) ($row['deh_id'] ?? '');
                $perSourceId = (string) ($row['per_id'] ?? '');

                $personnelId = $personMap[$perSourceId] ?? null;
                if ($personnelId === null) {
                    $citizenId = TransformHelpers::trimOrNull($row['per_cardno'] ?? null);
                    if ($citizenId !== null) {
                        $personnelId = $this->crosswalk->resolveByNaturalKey('personnel', 'citizen_id', $citizenId);
                    }
                }

                if ($personnelId === null) {
                    $result['skipped']++;
                    continue;
                }

                $dcCode = TransformHelpers::trimOrNull($row['dc_code'] ?? null);
                $decorationName = $dcCode !== null ? ($decorationMap[$dcCode] ?? $dcCode) : null;

                if ($decorationName === null) {
                    $result['skipped']++;
                    continue;
                }

                // D6 exception: received_year stores Buddhist Era directly (no -543)
                $receivedYear = null;
                $rawYear = TransformHelpers::trimOrNull($row['deh_date'] ?? null);
                if ($rawYear !== null) {
                    $yearVal = (int) substr($rawYear, 0, 4);
                    if ($yearVal >= 2400 && $yearVal <= 2700) {
                        $receivedYear = $yearVal;
                    } else {
                        $result['errors'][] = "per_decoratehis [{$sourceId}]: year {$yearVal} outside BE range 2400-2700";
                        $result['skipped']++;
                        continue;
                    }
                }

                $decorationClass = $dcCode !== null ? ($classMap[$dcCode] ?? null) : null;
                $gazetteRef = TransformHelpers::trimOrNull($row['deh_gazette'] ?? null);

                $checkStmt->execute([$personnelId, $decorationName, $receivedYear]);
                $existingId = $checkStmt->fetchColumn();

                if ($existingId !== false) {
                    $this->crosswalk->record('per_decoratehis', $sourceId, 'royal_decorations', (int) $existingId);
                    $result['skipped']++;
                } else {
                    $insertStmt->execute([$personnelId, $decorationName, $decorationClass, $receivedYear, $gazetteRef]);
                    $newId = (int) $this->target->lastInsertId();
                    $this->crosswalk->record('per_decoratehis', $sourceId, 'royal_decorations', $newId);
                    $result['created']++;
                }
            } catch (Throwable $e) {
                $result['errors'][] = 'per_decoratehis [' . ($row['deh_id'] ?? '?') . ']: ' . $e->getMessage();
            }
        }

        return $result;
    }
}
