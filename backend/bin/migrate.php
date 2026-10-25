<?php

declare(strict_types=1);

/**
 * Applies migrations/*.sql in order, recording each in schema_migrations.
 *
 *   php bin/migrate.php            apply pending migrations
 *   php bin/migrate.php --fresh    drop every table in the configured database first (local/test only)
 *   php bin/migrate.php --test     target DB_TEST_DATABASE instead of DB_DATABASE
 */

use App\Support\Config;
use App\Support\Database;

$container = require dirname(__DIR__) . '/bootstrap.php';
/** @var Config $config */
$config = $container->get(Config::class);
$args = array_slice($argv, 1);

if (in_array('--test', $args, true)) {
    $config = $config->with('DB_DATABASE', $config->str('DB_TEST_DATABASE'));
}
$db = Database::connect($config);
$pdo = $db->pdo();
$name = $config->str('DB_DATABASE');

if (in_array('--fresh', $args, true)) {
    if ($config->isProduction()) {
        fwrite(STDERR, "Refusing to run --fresh with APP_ENV=production.\n");
        exit(1);
    }
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach ($db->all('SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?', [$name]) as $row) {
        $pdo->exec('DROP TABLE IF EXISTS `' . str_replace('`', '', $row['t']) . '`');
    }
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    echo "Dropped all tables in {$name}\n";
}

$pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(191) NOT NULL PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

$applied = array_column($db->all('SELECT filename FROM schema_migrations'), 'filename');
$files = glob(dirname(__DIR__) . '/migrations/*.sql');
sort($files);

$count = 0;
foreach ($files as $file) {
    $base = basename($file);
    if (in_array($base, $applied, true)) {
        continue;
    }
    // Strip line comments, then split on semicolons that end a line. Migrations keep one
    // statement per ";\n" (triggers are single-statement, without BEGIN … END).
    $sql = preg_replace('/^\s*--.*$/m', '', (string) file_get_contents($file));
    $statements = array_filter(array_map('trim', preg_split('/;\s*(\r?\n|$)/', $sql)));
    try {
        foreach ($statements as $statement) {
            $pdo->exec($statement);
        }
    } catch (PDOException $e) {
        fwrite(STDERR, "Migration {$base} failed: {$e->getMessage()}\n");
        fwrite(STDERR, "MySQL DDL is not transactional: inspect the database, fix the file, and re-run (use --fresh locally).\n");
        exit(1);
    }
    $db->run('INSERT INTO schema_migrations (filename) VALUES (?)', [$base]);
    echo "Applied {$base}\n";
    $count++;
}
echo $count ? "Done: {$count} migration(s) applied to {$name}.\n" : "Nothing to migrate in {$name}.\n";
