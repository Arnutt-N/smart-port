<?php

declare(strict_types=1);

interface SourceAdapterInterface
{
    /**
     * Fetch rows from a source table.
     *
     * @param string $table Source table name (e.g. 'per_personal')
     * @param array $columns Column names to select (empty = all)
     * @param string|null $sinceColumn Column for delta detection (e.g. 'update_date')
     * @param string|null $sinceValue Only return rows where sinceColumn > this value
     * @return iterable<array<string, mixed>>
     */
    public function fetchRows(string $table, array $columns = [], ?string $sinceColumn = null, ?string $sinceValue = null): iterable;

    /**
     * Build a lookup map from a source table.
     *
     * @param string $table Source table name (e.g. 'per_line')
     * @param string $keyColumn Column to use as key (e.g. 'pl_code')
     * @param string $valueColumn Column to use as value (e.g. 'pl_name')
     * @return array<string, string> key => value map
     */
    public function fetchLookup(string $table, string $keyColumn, string $valueColumn): array;

    /**
     * Check if a source table exists / is accessible.
     */
    public function hasTable(string $table): bool;
}
