<?php

declare(strict_types=1);

class CrosswalkService
{
    private const SOURCE_SYSTEM = 'legacy-hr';

    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function resolve(string $sourceTable, string $sourceId, string $internalTable): ?int
    {
        $stmt = $this->pdo->prepare(
            'SELECT internal_id FROM external_ref
             WHERE source_system = ? AND source_table = ? AND source_id = ? AND internal_table = ?
             LIMIT 1'
        );
        $stmt->execute([self::SOURCE_SYSTEM, $sourceTable, $sourceId, $internalTable]);
        $val = $stmt->fetchColumn();

        return $val !== false ? (int) $val : null;
    }

    public function resolveByNaturalKey(string $internalTable, string $column, string $value): ?int
    {
        $allowed = ['personnel', 'organization', 'position', 'prefixes', 'training_course', 'royal_decorations', 'personnel_position_history'];
        if (!in_array($internalTable, $allowed, true)) {
            throw new InvalidArgumentException("Table not allowed: {$internalTable}");
        }
        $allowedCols = ['citizen_id', 'org_code', 'position_code', 'prefix_code', 'course_name'];
        if (!in_array($column, $allowedCols, true)) {
            throw new InvalidArgumentException("Column not allowed: {$column}");
        }

        $stmt = $this->pdo->prepare(
            "SELECT {$this->pkColumn($internalTable)} FROM `{$internalTable}` WHERE `{$column}` = ? LIMIT 1"
        );
        $stmt->execute([$value]);
        $val = $stmt->fetchColumn();

        return $val !== false ? (int) $val : null;
    }

    public function record(string $sourceTable, string $sourceId, string $internalTable, int $internalId): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO external_ref (source_system, source_table, source_id, internal_table, internal_id)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE internal_id = VALUES(internal_id), synced_at = CURRENT_TIMESTAMP'
        );
        $stmt->execute([self::SOURCE_SYSTEM, $sourceTable, $sourceId, $internalTable, $internalId]);
    }

    /**
     * Build a full source_id → internal_id map for a table pair.
     * @return array<string, int>
     */
    public function buildMap(string $sourceTable, string $internalTable): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT source_id, internal_id FROM external_ref
             WHERE source_system = ? AND source_table = ? AND internal_table = ?'
        );
        $stmt->execute([self::SOURCE_SYSTEM, $sourceTable, $internalTable]);

        $map = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $map[$row['source_id']] = (int) $row['internal_id'];
        }

        return $map;
    }

    public function lastSyncTime(string $sourceTable): ?string
    {
        $stmt = $this->pdo->prepare(
            'SELECT MAX(synced_at) FROM external_ref
             WHERE source_system = ? AND source_table = ?'
        );
        $stmt->execute([self::SOURCE_SYSTEM, $sourceTable]);
        $val = $stmt->fetchColumn();

        return $val !== false && $val !== null ? (string) $val : null;
    }

    private function pkColumn(string $table): string
    {
        return match ($table) {
            'personnel' => 'personnel_id',
            'organization' => 'org_id',
            'position' => 'position_id',
            'prefixes' => 'prefix_id',
            'training_course' => 'course_id',
            'royal_decorations' => 'decoration_id',
            'personnel_position_history' => 'history_id',
            default => 'id',
        };
    }
}
