<?php

declare(strict_types=1);

/**
 * Seeds reference data into an empty, migrated database.
 *
 *   php bin/seed.php           seed DB_DATABASE
 *   php bin/seed.php --test    seed DB_TEST_DATABASE
 *
 * For a clean slate locally: composer fresh  (migrate --fresh + seed)
 */

use App\Seeds\ReferenceSeeder;
use App\Support\Config;
use App\Support\Database;

$container = require dirname(__DIR__) . '/bootstrap.php';
/** @var Config $config */
$config = $container->get(Config::class);
if (in_array('--test', array_slice($argv, 1), true)) {
    $config = $config->with('DB_DATABASE', $config->str('DB_TEST_DATABASE'));
}
$db = Database::connect($config);

if ((int) $db->scalar('SELECT COUNT(*) FROM users') > 0) {
    fwrite(STDERR, "Database already has users; refusing to seed twice. Run `composer fresh` for a clean local database.\n");
    exit(1);
}

$start = microtime(true);
(new ReferenceSeeder($db, dirname(__DIR__) . '/seeds'))->run();

printf(
    "Seeded %s in %.1fs: %d users, %d dishes, %d dish options, %d coupons.\n",
    $config->str('DB_DATABASE'),
    microtime(true) - $start,
    $db->scalar('SELECT COUNT(*) FROM users'),
    $db->scalar('SELECT COUNT(*) FROM dishes'),
    $db->scalar('SELECT COUNT(*) FROM dish_options'),
    $db->scalar('SELECT COUNT(*) FROM coupons'),
);
