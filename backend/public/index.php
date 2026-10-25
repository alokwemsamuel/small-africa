<?php

declare(strict_types=1);

use App\App;

$container = require dirname(__DIR__) . '/bootstrap.php';
App::create($container)->run();
