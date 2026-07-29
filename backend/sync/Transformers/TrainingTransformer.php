<?php

declare(strict_types=1);

require_once __DIR__ . '/../TransformHelpers.php';
require_once __DIR__ . '/../CrosswalkService.php';
require_once __DIR__ . '/../SourceAdapterInterface.php';

/**
 * D7: per_training (+ per_train lookup) → training_course
 * Only course names imported (no enrollment records this phase).
 * Dedup by course_name.
 */
class TrainingTransformer
{
    public function __construct(
        private PDO $target,
        private SourceAdapterInterface $source,
        private CrosswalkService $crosswalk,
    ) {}

    public function transform(bool $full = false): array
    {
        $result = ['domain' => 'D7', 'created' => 0, 'updated' => 0, 'skipped' => 0, 'errors' => []];

        $since = null;
        if (!$full) {
            $since = $this->crosswalk->lastSyncTime('per_training');
        }

        $trainMap = $this->source->fetchLookup('per_train', 'tr_code', 'tr_name');

        $checkStmt = $this->target->prepare('SELECT course_id FROM training_course WHERE course_name = ? LIMIT 1');
        $insertStmt = $this->target->prepare('INSERT INTO training_course (course_name) VALUES (?)');

        $seen = [];

        foreach ($this->source->fetchRows('per_training', ['trn_id', 'tr_code'], 'update_date', $since) as $row) {
            try {
                $sourceId = (string) ($row['trn_id'] ?? '');
                $trCode = TransformHelpers::trimOrNull($row['tr_code'] ?? null);

                if ($trCode === null) {
                    $result['skipped']++;
                    continue;
                }

                $courseName = $trainMap[$trCode] ?? null;
                if ($courseName === null || trim($courseName) === '') {
                    $result['skipped']++;
                    continue;
                }

                $courseName = TransformHelpers::trimOrNull($courseName);

                if (isset($seen[$courseName])) {
                    $this->crosswalk->record('per_training', $sourceId, 'training_course', $seen[$courseName]);
                    $result['skipped']++;
                    continue;
                }

                $checkStmt->execute([$courseName]);
                $existingId = $checkStmt->fetchColumn();

                if ($existingId !== false) {
                    $courseId = (int) $existingId;
                    $seen[$courseName] = $courseId;
                    $this->crosswalk->record('per_training', $sourceId, 'training_course', $courseId);
                    $result['skipped']++;
                } else {
                    $insertStmt->execute([$courseName]);
                    $courseId = (int) $this->target->lastInsertId();
                    $seen[$courseName] = $courseId;
                    $this->crosswalk->record('per_training', $sourceId, 'training_course', $courseId);
                    $result['created']++;
                }
            } catch (Throwable $e) {
                $result['errors'][] = 'per_training [' . ($row['trn_id'] ?? '?') . ']: ' . $e->getMessage();
            }
        }

        return $result;
    }
}
