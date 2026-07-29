<?php

declare(strict_types=1);

require_once __DIR__ . '/SourceAdapterInterface.php';

class StagingPdoAdapter implements SourceAdapterInterface
{
    public function __construct(private PDO $pdo) {}

    public function fetchRows(string $table, array $columns = [], ?string $sinceColumn = null, ?string $sinceValue = null): iterable
    {
        $this->validateIdentifier($table);
        $select = $columns !== []
            ? implode(', ', array_map([$this, 'quoteIdentifier'], $columns))
            : '*';

        $sql = "SELECT {$select} FROM `{$table}`";
        $params = [];

        if ($sinceColumn !== null && $sinceValue !== null) {
            $this->validateIdentifier($sinceColumn);
            $sql .= " WHERE `{$sinceColumn}` > ?";
            $params[] = $sinceValue;
        }

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            yield $row;
        }
    }

    public function fetchLookup(string $table, string $keyColumn, string $valueColumn): array
    {
        $this->validateIdentifier($table);
        $this->validateIdentifier($keyColumn);
        $this->validateIdentifier($valueColumn);

        $sql = "SELECT `{$keyColumn}`, `{$valueColumn}` FROM `{$table}`";
        $stmt = $this->pdo->query($sql);

        $map = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $key = (string) $row[$keyColumn];
            $map[$key] = $row[$valueColumn] !== null ? (string) $row[$valueColumn] : '';
        }

        return $map;
    }

    public function hasTable(string $table): bool
    {
        $this->validateIdentifier($table);
        $stmt = $this->pdo->prepare(
            'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1'
        );
        $stmt->execute([$table]);

        return (bool) $stmt->fetchColumn();
    }

    private function validateIdentifier(string $identifier): void
    {
        if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $identifier)) {
            throw new InvalidArgumentException("Invalid SQL identifier: {$identifier}");
        }
    }

    private function quoteIdentifier(string $identifier): string
    {
        $this->validateIdentifier($identifier);

        return "`{$identifier}`";
    }
}
