<?php

declare(strict_types=1);

// Integration tests run against DB_TEST_DATABASE, rebuilt once per run.
require dirname(__DIR__) . '/vendor/autoload.php';

date_default_timezone_set('Africa/Lagos');
if (is_file(dirname(__DIR__) . '/.env')) {
    Dotenv\Dotenv::createImmutable(dirname(__DIR__))->safeLoad();
}

$php = escapeshellarg(PHP_BINARY);
$bin = escapeshellarg(dirname(__DIR__) . '/bin');
foreach (["{$php} {$bin}/migrate.php --fresh --test", "{$php} {$bin}/seed.php --test"] as $cmd) {
    exec($cmd . ' 2>&1', $out, $code);
    if ($code !== 0) {
        fwrite(STDERR, "Test database setup failed:\n" . implode("\n", $out) . "\n");
        exit(1);
    }
}
