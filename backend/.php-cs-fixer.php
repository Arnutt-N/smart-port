<?php

declare(strict_types=1);

// PHP-CS-Fixer config (D5) — PSR-12 base + สไตล์ repo: 4-space, single quotes
$finder = PhpCsFixer\Finder::create()
    ->in(__DIR__)
    ->exclude(['vendor'])
    ->name('*.php');

return (new PhpCsFixer\Config())
    ->setRules([
        '@PSR12' => true,
        'single_quote' => true,
        'indentation_type' => true,
        'array_syntax' => ['syntax' => 'short'],
        'no_unused_imports' => true,
    ])
    ->setFinder($finder);
