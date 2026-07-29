<?php

declare(strict_types=1);

require_once __DIR__ . '/SourceAdapterInterface.php';

class CsvFileAdapter implements SourceAdapterInterface
{
    public function __construct(private string $csvDir) {}

    public function fetchRows(string $table, array $columns = [], ?string $sinceColumn = null, ?string $sinceValue = null): iterable
    {
        $file = $this->resolveFile($table);

        if (!is_file($file)) {
            return;
        }

        $handle = fopen($file, 'r');
        if ($handle === false) {
            throw new RuntimeException("Cannot open CSV file: {$file}");
        }

        try {
            $headers = fgetcsv($handle);
            if ($headers === false) {
                return;
            }

            $headers = array_map('trim', $headers);
            $sinceIndex = ($sinceColumn !== null) ? array_search($sinceColumn, $headers, true) : false;

            while (($row = fgetcsv($handle)) !== false) {
                if (count($row) !== count($headers)) {
                    continue;
                }

                $assoc = array_combine($headers, $row);

                if ($sinceIndex !== false && $sinceValue !== null) {
                    $cellVal = $assoc[$sinceColumn] ?? '';
                    if ($cellVal <= $sinceValue) {
                        continue;
                    }
                }

                if ($columns !== []) {
                    $assoc = array_intersect_key($assoc, array_flip($columns));
                }

                yield $assoc;
            }
        } finally {
            fclose($handle);
        }
    }

    public function fetchLookup(string $table, string $keyColumn, string $valueColumn): array
    {
        $map = [];
        foreach ($this->fetchRows($table, [$keyColumn, $valueColumn]) as $row) {
            $key = (string) ($row[$keyColumn] ?? '');
            if ($key !== '') {
                $map[$key] = (string) ($row[$valueColumn] ?? '');
            }
        }

        return $map;
    }

    public function hasTable(string $table): bool
    {
        return is_file($this->resolveFile($table));
    }

    private function resolveFile(string $table): string
    {
        if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $table)) {
            throw new InvalidArgumentException("Invalid table name: {$table}");
        }

        $file = rtrim($this->csvDir, '/\\') . DIRECTORY_SEPARATOR . $table . '.csv';

        return $file;
    }
}
