<?php

declare(strict_types=1);

require_once __DIR__ . '/sync/SourceAdapterInterface.php';
require_once __DIR__ . '/sync/CrosswalkService.php';
require_once __DIR__ . '/sync/TransformHelpers.php';
require_once __DIR__ . '/sync/Transformers/PrefixTransformer.php';
require_once __DIR__ . '/sync/Transformers/OrgTransformer.php';
require_once __DIR__ . '/sync/Transformers/PositionTransformer.php';
require_once __DIR__ . '/sync/Transformers/PersonTransformer.php';
require_once __DIR__ . '/sync/Transformers/PositionHistoryTransformer.php';
require_once __DIR__ . '/sync/Transformers/DecorationTransformer.php';
require_once __DIR__ . '/sync/Transformers/TrainingTransformer.php';

class SyncTransformService
{
    private const DOMAIN_ORDER = ['D4', 'D2', 'D3', 'D1', 'D5', 'D6', 'D7'];

    private const DOMAIN_TABLES = [
        'D4' => 'per_prename',
        'D2' => 'per_org',
        'D3' => 'per_position',
        'D1' => 'per_personal',
        'D5' => 'per_positionhis',
        'D6' => 'per_decoratehis',
        'D7' => 'per_training',
    ];

    private PDO $target;
    private SourceAdapterInterface $source;
    private CrosswalkService $crosswalk;

    public function __construct(PDO $target, SourceAdapterInterface $source)
    {
        $this->target = $target;
        $this->source = $source;
        $this->crosswalk = new CrosswalkService($target);
    }

    public function syncDomain(string $domain, bool $full = false): array
    {
        $domain = strtoupper($domain);

        if (!isset(self::DOMAIN_TABLES[$domain])) {
            return ['domain' => $domain, 'created' => 0, 'updated' => 0, 'skipped' => 0, 'errors' => ["Unknown domain: {$domain}"]];
        }

        $transformer = $this->createTransformer($domain);

        return $transformer->transform($full);
    }

    public function syncAll(bool $full = false): array
    {
        $results = [];
        $totalErrors = 0;

        foreach (self::DOMAIN_ORDER as $domain) {
            $result = $this->syncDomain($domain, $full);
            $results[] = $result;
            $totalErrors += count($result['errors']);

            if ($totalErrors > 100) {
                $results[] = ['domain' => 'ABORT', 'created' => 0, 'updated' => 0, 'skipped' => 0, 'errors' => ['Aborted: >100 cumulative errors']];
                break;
            }
        }

        return $results;
    }

    public function getStatus(): array
    {
        $status = [];
        foreach (self::DOMAIN_TABLES as $domain => $table) {
            $status[$domain] = [
                'source_table' => $table,
                'last_sync' => $this->crosswalk->lastSyncTime($table),
            ];
        }

        return $status;
    }

    public static function domainOrder(): array
    {
        return self::DOMAIN_ORDER;
    }

    private function createTransformer(string $domain): object
    {
        return match ($domain) {
            'D4' => new PrefixTransformer($this->target, $this->source, $this->crosswalk),
            'D2' => new OrgTransformer($this->target, $this->source, $this->crosswalk),
            'D3' => new PositionTransformer($this->target, $this->source, $this->crosswalk),
            'D1' => new PersonTransformer($this->target, $this->source, $this->crosswalk),
            'D5' => new PositionHistoryTransformer($this->target, $this->source, $this->crosswalk),
            'D6' => new DecorationTransformer($this->target, $this->source, $this->crosswalk),
            'D7' => new TrainingTransformer($this->target, $this->source, $this->crosswalk),
        };
    }
}
