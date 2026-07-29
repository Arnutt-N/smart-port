<?php

declare(strict_types=1);

require_once __DIR__ . '/../TransformHelpers.php';
require_once __DIR__ . '/../CrosswalkService.php';
require_once __DIR__ . '/../SourceAdapterInterface.php';

/**
 * D4: per_prename → prefixes
 */
class PrefixTransformer
{
    public function __construct(
        private PDO $target,
        private SourceAdapterInterface $source,
        private CrosswalkService $crosswalk,
    ) {}

    public function transform(bool $full = false): array
    {
        $result = ['domain' => 'D4', 'created' => 0, 'updated' => 0, 'skipped' => 0, 'errors' => []];

        $since = null;
        if (!$full) {
            $since = $this->crosswalk->lastSyncTime('per_prename');
        }

        $stmt = $this->target->prepare(
            'INSERT INTO prefixes (prefix_code, prefix_name_th, prefix_name_en, prefix_short, is_active)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                prefix_name_th = VALUES(prefix_name_th),
                prefix_name_en = VALUES(prefix_name_en),
                prefix_short = VALUES(prefix_short),
                is_active = VALUES(is_active)'
        );

        foreach ($this->source->fetchRows('per_prename', ['pn_code', 'pn_name', 'pn_eng_name', 'pn_shortname', 'pn_active'], 'update_date', $since) as $row) {
            try {
                $code = TransformHelpers::trimOrNull($row['pn_code'] ?? null);
                $nameTh = TransformHelpers::trimOrNull($row['pn_name'] ?? null);

                if ($code === null || $nameTh === null) {
                    $result['skipped']++;
                    continue;
                }

                $nameEn = TransformHelpers::trimOrNull($row['pn_eng_name'] ?? null);
                $short = TransformHelpers::trimOrNull($row['pn_shortname'] ?? null);
                $active = (int) ($row['pn_active'] ?? 1) === 1 ? 1 : 0;

                $stmt->execute([$code, mb_substr($nameTh, 0, 50), $nameEn !== null ? mb_substr($nameEn, 0, 50) : null, $short !== null ? mb_substr($short, 0, 20) : null, $active]);

                $prefixId = $this->resolvePrefixId($code);
                if ($prefixId !== null) {
                    $this->crosswalk->record('per_prename', $code, 'prefixes', $prefixId);
                }

                if ($stmt->rowCount() === 1) {
                    $result['created']++;
                } else {
                    $result['updated']++;
                }
            } catch (Throwable $e) {
                $result['errors'][] = 'per_prename [' . ($row['pn_code'] ?? '?') . ']: ' . $e->getMessage();
            }
        }

        return $result;
    }

    private function resolvePrefixId(string $code): ?int
    {
        $stmt = $this->target->prepare('SELECT prefix_id FROM prefixes WHERE prefix_code = ? LIMIT 1');
        $stmt->execute([$code]);
        $val = $stmt->fetchColumn();

        return $val !== false ? (int) $val : null;
    }
}
