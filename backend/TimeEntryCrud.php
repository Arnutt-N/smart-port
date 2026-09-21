<?php
// ============================================================================
// TimeEntryCrud.php
// Shared CRUD core for time-entry routes (supportive/diverse/multiplier/equivalence).
// #4 folded from day one: every core returns ['http'=>int,'body'=>array];
// routes only emit via timeEntryEmit(). No echo/exit here — direct-call testable.
// ============================================================================

/**
 * Map HTTP method to permission action. Unknown method → null (caller emits 405).
 */
function timeEntryAction(string $method): ?string
{
    $map = ['GET' => 'read', 'POST' => 'create', 'PUT' => 'update', 'DELETE' => 'delete'];
    return $map[$method] ?? null;
}

/**
 * Single permission choke point (N39/U5-style cross-fixes land here).
 * Returns null when allowed, else ['status'=>int,'body'=>array] (caller emits).
 */
function timeEntryDenied(string $action, string $resource, ?array $user, PDO $pdo): ?array
{
    return evaluatePermissionAccess($action, $resource, $user, $pdo);
}

/**
 * Shared list core — envelope shape byte-identical per route via cfg.
 *
 * cfg keys (all required unless noted):
 *   table       base table, e.g. 'supportive_experience'
 *   alias       table alias, e.g. 'se'
 *   idCol       PK with alias (unused by list; kept so one cfg serves detail too)
 *   joins       JOIN fragment incl. leading space, e.g. ' LEFT JOIN personnel p ...'
 *   selectExtra extra SELECT fragment after "{alias}.* ,", e.g. full-name SQL + ' AS full_name'
 *   personnelCol personnel filter column; default "{alias}.personnel_id"
 *   searchSql   list of LIKE condition fragments, ONE ? placeholder each —
 *               each receives one "%term%" param (mirror supportive 4-term search)
 *   orderBy     ORDER BY fragment without keyword, e.g. 'se.start_date DESC'
 *   summarySql  full-dataset summary query (NOT page-scoped — N27)
 *   summaryMap  callable (array $summaryRow, int $total): array → summary shape (per-route casts)
 *   dateFields  list of Y-m-d columns enriched as "{field}_thai" per row
 *
 * $query defaults to $_GET when null (explicit array = direct-call testable).
 *
 * @return array{http:int, body:array<string,mixed>} http always 200
 */
function timeEntryList(PDO $pdo, array $cfg, ?array $query = null): array
{
    $query = $query ?? $_GET;
    $alias = $cfg['alias'];
    $personnelId = $query['personnel_id'] ?? null;
    $search = trim((string) ($query['search'] ?? ''));
    $limit = max(1, min(intval($query['limit'] ?? 20), 200));
    $offset = max(0, intval($query['offset'] ?? 0));

    $baseQuery = "SELECT {$alias}.*, {$cfg['selectExtra']}
                  FROM {$cfg['table']} {$alias}{$cfg['joins']}";
    $countQuery = "SELECT COUNT(*) AS total
                   FROM {$cfg['table']} {$alias}{$cfg['joins']}";

    $conditions = [];
    $params = [];

    $personnelCol = $cfg['personnelCol'] ?? ($alias . '.personnel_id');
    if ($personnelId !== null && $personnelId !== '') {
        $conditions[] = "{$personnelCol} = ?";
        $params[] = intval($personnelId);
    }

    if ($search !== '') {
        $conditions[] = '(' . implode(' OR ', $cfg['searchSql']) . ')';
        $term = "%{$search}%";
        foreach ($cfg['searchSql'] as $fragment) {
            $params[] = $term;
        }
    }

    $where = $conditions === [] ? '' : ' WHERE ' . implode(' AND ', $conditions);

    $stmt = $pdo->prepare($baseQuery . $where . " ORDER BY {$cfg['orderBy']} LIMIT {$limit} OFFSET {$offset}");
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $countStmt = $pdo->prepare($countQuery . $where);
    $countStmt->execute($params);
    $total = intval($countStmt->fetch(PDO::FETCH_ASSOC)['total']);

    foreach ($rows as &$row) {
        foreach ($cfg['dateFields'] as $field) {
            $row[$field . '_thai'] = formatThaiDate($row[$field] ?? null);
        }
    }
    unset($row);

    $summaryRow = $pdo->query($cfg['summarySql'])->fetch(PDO::FETCH_ASSOC);
    $summary = ($cfg['summaryMap'])($summaryRow ?: [], $total);

    return ['http' => 200, 'body' => [
        'success' => true,
        'data' => $rows,
        'summary' => $summary,
        'pagination' => [
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'has_more' => ($offset + $limit) < $total,
        ],
    ]];
}

/**
 * Shared detail core. $notFoundMsg stays per-route (FE/toasts may match text).
 *
 * @return array{http:int, body:array<string,mixed>} 200 + record, or 404 + msg
 */
function timeEntryDetail(PDO $pdo, array $cfg, int $id, string $notFoundMsg): array
{
    $alias = $cfg['alias'];
    $stmt = $pdo->prepare(
        "SELECT {$alias}.*, {$cfg['selectExtra']}
         FROM {$cfg['table']} {$alias}{$cfg['joins']}
         WHERE {$cfg['idCol']} = ?"
    );
    $stmt->execute([$id]);
    $record = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$record) {
        return ['http' => 404, 'body' => ['error' => $notFoundMsg]];
    }

    foreach ($cfg['dateFields'] as $field) {
        $record[$field . '_thai'] = formatThaiDate($record[$field] ?? null);
    }

    return ['http' => 200, 'body' => ['success' => true, 'data' => $record]];
}

/**
 * Audit choke point — wraps logAudit().
 */
function timeEntryWriteAudit(PDO $pdo, int $userId, string $action, string $table, ?int $id, ?array $before, ?array $after): void
{
    logAudit($pdo, $userId, $action, $table, $id, $before, $after);
}

/**
 * The single emit adapter — every handler ends here.
 */
function timeEntryEmit(array $outcome): void
{
    http_response_code($outcome['http']);
    echo json_encode($outcome['body'], JSON_UNESCAPED_UNICODE);
}
