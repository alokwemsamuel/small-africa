<?php

declare(strict_types=1);

// Prints a new APP_KEY. Paste it into .env. Changing the key makes stored 2FA secrets unreadable.
echo 'APP_KEY=base64:' . base64_encode(random_bytes(32)) . PHP_EOL;
