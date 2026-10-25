<?php

declare(strict_types=1);

namespace Tests\Integration;

final class PreferencesAndMenuFlagsTest extends IntegrationTestCase
{
    /** @return array<string, string> */
    private function signIn(): array
    {
        [, $login] = $this->request('POST', '/api/auth/login', ['email' => 'guest@smallafrica.demo', 'password' => 'SmallAfrica@Guest2026'], $this->spaHeaders());
        return ['X-CSRF-Token' => $login['csrfToken'], 'Origin' => 'http://localhost:5173'];
    }

    public function testThemePreferenceIsSavedToTheProfile(): void
    {
        $headers = $this->signIn();
        [$res, $body] = $this->request('PATCH', '/api/account/profile', ['theme_preference' => 'light'], $headers);
        self::assertSame(200, $res->getStatusCode());
        self::assertSame('light', $body['user']['themePreference']);

        [, $me] = $this->request('GET', '/api/auth/me');
        self::assertSame('light', $me['user']['themePreference']);
    }

    public function testThemePreferenceRejectsUnknownValues(): void
    {
        $headers = $this->signIn();
        [$res, $body] = $this->request('PATCH', '/api/account/profile', ['theme_preference' => 'neon'], $headers);
        self::assertSame(422, $res->getStatusCode());
        self::assertArrayHasKey('theme_preference', $body['error']['fields']);
    }

    public function testExactlyTheExpectedDishesAreFlaggedAsContainingPork(): void
    {
        $slugs = array_column($this->db->all('SELECT slug FROM dishes WHERE contains_pork = 1 ORDER BY slug'), 'slug');
        self::assertSame(['beef-wellington', 'bigos', 'kielbasa-platter', 'kotlet-schabowy', 'pierogi-z-miesem', 'zurek'], $slugs);
    }

    public function testNoUnflaggedDishMentionsPorkIngredients(): void
    {
        $rows = $this->db->all(
            "SELECT slug FROM dishes WHERE contains_pork = 0
             AND (LOWER(CONCAT(description, ' ', COALESCE(ingredients, ''))) REGEXP 'pork|bacon|ham[^a-z]|lard|prosciutto|kiełbasa')",
        );
        self::assertSame([], $rows, 'A dish mentions pork in its description/ingredients but is not flagged');
    }
}
