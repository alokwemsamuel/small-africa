<?php

declare(strict_types=1);

/**
 * Interest Account scheduled jobs. Safe to run more than once: every step is idempotent.
 *
 *   php bin/loyalty.php daily                run everything due today (schedule this once a day)
 *   php bin/loyalty.php interest [YYYY-MM]   pay monthly interest (default: last month)
 *   php bin/loyalty.php reconcile            check every cached balance against the ledgers
 *
 * Production: a daily cron job (see the deployment guide), Africa/Lagos time:
 *   10 0 * * *  php /path/to/backend/bin/loyalty.php daily
 */

use App\Loyalty\AlreadyPaid;
use App\Loyalty\InterestService;
use App\Loyalty\Ledger;
use App\Loyalty\LoyaltyJobs;
use App\Support\Database;

$container = require dirname(__DIR__) . '/bootstrap.php';
$command = $argv[1] ?? 'help';

try {
    switch ($command) {
        case 'daily':
            echo json_encode($container->get(LoyaltyJobs::class)->daily(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), PHP_EOL;
            break;
        case 'interest':
            $service = $container->get(InterestService::class);
            $period = $argv[2] ?? $service->previousPeriod();
            echo json_encode($service->run($period, 'cron'), JSON_PRETTY_PRINT), PHP_EOL;
            break;
        case 'reconcile':
            $ledger = $container->get(Ledger::class);
            $bad = 0;
            foreach ($container->get(Database::class)->all('SELECT user_id FROM loyalty_accounts') as $row) {
                $r = $ledger->reconcile((int) $row['user_id']);
                if (!$r['ok']) {
                    $bad++;
                    echo "MISMATCH user {$row['user_id']}: ", json_encode($r), PHP_EOL;
                }
            }
            echo $bad === 0 ? "All balances match their ledgers.\n" : "{$bad} account(s) need attention.\n";
            exit($bad === 0 ? 0 : 1);
        default:
            echo "Usage: php bin/loyalty.php daily | interest [YYYY-MM] | reconcile\n";
            exit($command === 'help' ? 0 : 1);
    }
} catch (AlreadyPaid $e) {
    echo $e->getMessage(), PHP_EOL;
} catch (\Throwable $e) {
    fwrite(STDERR, 'Failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
