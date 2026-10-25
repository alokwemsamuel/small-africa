<?php

declare(strict_types=1);

use App\App;
use App\Support\Config;

require __DIR__ . '/vendor/autoload.php';

date_default_timezone_set('Africa/Lagos');
ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/storage/logs/php-errors.log');
ini_set('expose_php', '0');

if (is_file(__DIR__ . '/.env')) {
    Dotenv\Dotenv::createImmutable(__DIR__)->safeLoad();
}

return App::container(Config::fromEnvironment());
