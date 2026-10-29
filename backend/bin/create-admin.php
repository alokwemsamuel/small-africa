<?php

declare(strict_types=1);

/**
 * Creates the first Super Admin on a fresh production database (the demo accounts are never seeded there).
 *
 *   ADMIN_PASSWORD='a long passphrase' php bin/create-admin.php you@yourdomain.com "First" "Last"
 *
 * The password comes from the environment so it doesn't end up in the shell history of the command line.
 */

use App\Security\PasswordPolicy;
use App\Support\Database;

$container = require dirname(__DIR__) . '/bootstrap.php';
$db = Database::connect($container->get(\App\Support\Config::class));

[, $email, $first, $last] = $argv + [null, null, null, null];
$password = (string) getenv('ADMIN_PASSWORD');
if (!$email || !$first || !$last || $password === '') {
    fwrite(STDERR, "Usage: ADMIN_PASSWORD='…' php bin/create-admin.php <email> <first name> <last name>\n");
    exit(1);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || str_ends_with(strtolower($email), '@smallafrica.demo')) {
    fwrite(STDERR, "Use a real email address (not @smallafrica.demo).\n");
    exit(1);
}
$problems = PasswordPolicy::problems($password, [$email, $first, $last]);
if ($problems) {
    fwrite(STDERR, 'That password is too weak: ' . implode(' ', $problems) . "\n");
    exit(1);
}
if ($db->scalar("SELECT COUNT(*) FROM users WHERE role = 'super_admin'") > 0) {
    fwrite(STDERR, "A Super Admin already exists. Add more staff from Admin → Staff & roles.\n");
    exit(1);
}
$db->insert('users', [
    'role' => 'super_admin', 'first_name' => $first, 'last_name' => $last, 'email' => strtolower($email),
    'password_hash' => PasswordPolicy::hash($password), 'email_verified_at' => date('Y-m-d H:i:s'),
]);
echo "Super Admin created. Sign in, then turn on two-factor authentication.\n";
