<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Seeds\ReferenceSeeder;

/** The demo accounts have public passwords, so a production database must never get them. */
final class ProductionSeedingTest extends IntegrationTestCase
{
    public function testTheSeederRefusesToCreateDemoAccountsInProduction(): void
    {
        $users = (int) $this->db->scalar('SELECT COUNT(*) FROM users');
        $items = (int) $this->db->scalar('SELECT COUNT(*) FROM dishes');
        $seeder = new ReferenceSeeder($this->db, dirname(__DIR__, 2) . '/seeds', production: true, withAccounts: true);

        try {
            $seeder->run();
            self::fail('Seeding the demo accounts in production should have been refused.');
        } catch (\RuntimeException $e) {
            self::assertStringContainsString('APP_ENV=production', $e->getMessage());
            self::assertStringContainsString('create-admin', $e->getMessage());
        }
        // Refused before anything was written.
        self::assertSame($users, (int) $this->db->scalar('SELECT COUNT(*) FROM users'));
        self::assertSame($items, (int) $this->db->scalar('SELECT COUNT(*) FROM dishes'));
    }

    public function testTheSeedScriptNeverOffersDemoAccountsInProduction(): void
    {
        $script = (string) file_get_contents(dirname(__DIR__, 2) . '/bin/seed.php');
        // In production the script passes withAccounts = false (and the class refuses true).
        self::assertStringContainsString('$production, !$production', $script);
    }
}
