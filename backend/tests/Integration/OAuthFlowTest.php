<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\App;
use App\Repositories\UserRepository;
use App\Security\PasswordPolicy;
use App\Services\AuthService;
use App\Social\Identity;
use App\Social\OAuthCookie;
use App\Social\ProviderRegistry;
use App\Social\SocialError;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;
use Tests\Support\FakeProvider;

/** The redirect flow through the whole app, with fake providers: no network, real middleware, real database. */
final class OAuthFlowTest extends IntegrationTestCase
{
    private const FRONTEND = 'http://localhost:5173';
    private FakeProvider $google;
    private FakeProvider $apple;

    protected function setUp(): void
    {
        parent::setUp();
        $this->google = new FakeProvider('google', new Identity('google', 'g-1', 'ada@example.com', true, 'Ada', 'Okafor'));
        $this->apple = new FakeProvider('apple', new Identity('apple', 'a-1', 'kasia@example.com', true, 'Kasia', 'Nowak'));
        // Facebook has no keys in this test: it is switched off.
        $this->c->instance(ProviderRegistry::class, new ProviderRegistry(['google' => $this->google, 'apple' => $this->apple]));
    }

    /**
     * @param array<string, string> $cookies
     * @param array<string, string> $headers
     */
    private function raw(string $method, string $uri, array $cookies = [], array $headers = [], ?string $form = null): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, $uri, ['REMOTE_ADDR' => '203.0.113.10']);
        parse_str((string) parse_url($uri, PHP_URL_QUERY), $query);
        $request = $request->withQueryParams($query)->withCookieParams($cookies);
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }
        if ($form !== null) {
            $request = $request->withHeader('Content-Type', 'application/x-www-form-urlencoded');
            $request->getBody()->write($form);
            $request->getBody()->rewind();
        }
        return App::create($this->c)->handle($request);
    }

    /** @return array{0: string, 1: string} the sealed cookie value and the state, from a start response */
    private function begin(string $provider = 'google', string $query = ''): array
    {
        $response = $this->raw('GET', "/api/auth/oauth/{$provider}/start" . ($query !== '' ? "?{$query}" : ''));
        self::assertSame(302, $response->getStatusCode());
        $cookie = $this->cookieValue($response);
        self::assertNotNull($cookie, 'start must set the sa_oauth cookie');
        parse_str((string) parse_url($response->getHeaderLine('Location'), PHP_URL_QUERY), $q);
        return [$cookie, (string) $q['state']];
    }

    private function cookieValue(ResponseInterface $response): ?string
    {
        $header = $response->getHeaderLine('Set-Cookie');
        return preg_match('/^' . OAuthCookie::NAME . '=([^;]*)/', $header, $m) === 1 && $m[1] !== '' ? rawurldecode($m[1]) : null;
    }

    private function location(ResponseInterface $response): string
    {
        return $response->getHeaderLine('Location');
    }

    private function member(string $email = 'ada@example.com'): array
    {
        $users = $this->c->get(UserRepository::class);
        $id = $users->create([
            'role' => 'customer', 'first_name' => 'Ada', 'last_name' => 'Eze', 'email' => $email, 'phone' => '+2348031112222',
            'password_hash' => PasswordPolicy::hash('Jollof&Pierogi-2026'), 'referral_code' => 'ADA' . random_int(1000, 9999),
        ]);
        $this->db->insert('loyalty_accounts', ['user_id' => $id]);
        return $users->find($id);
    }

    public function testLeavesOutProvidersWithoutKeys(): void
    {
        [$response, $data] = $this->request('GET', '/api/auth/providers');
        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['providers' => ['google', 'apple']], $data);
    }

    public function testStartSendsTheBrowserToTheProviderWithAStateAndAPkceVerifier(): void
    {
        $response = $this->raw('GET', '/api/auth/oauth/google/start?mode=sign-up');
        self::assertSame(302, $response->getStatusCode());
        self::assertStringStartsWith('https://google.example/authorize?state=', $this->location($response));
        self::assertNotEmpty($this->google->lastState);
        self::assertNotEmpty($this->google->lastNonce);
        self::assertNotSame($this->google->lastState, $this->google->lastNonce);
        self::assertSame(self::FRONTEND . '/api/auth/oauth/google/callback', $this->google->lastRedirectUri);
        $cookie = $response->getHeaderLine('Set-Cookie');
        self::assertStringContainsString('HttpOnly', $cookie);
        self::assertStringContainsString('Path=/api/auth/oauth', $cookie);
        self::assertStringContainsString('Max-Age=600', $cookie);
        self::assertStringNotContainsString($this->google->lastState, $cookie, 'the state is sealed, not readable in the cookie');
        self::assertStringNotContainsString('verifier-', rawurldecode($cookie));
    }

    public function testASuccessfulSignUpCreatesTheAccountAndGoesToWelcome(): void
    {
        [$cookie, $state] = $this->begin('google', 'mode=sign-up&ref=friend77');
        $response = $this->raw('GET', "/api/auth/oauth/google/callback?code=abc&state={$state}", [OAuthCookie::NAME => $cookie]);
        self::assertSame(302, $response->getStatusCode());
        self::assertSame(self::FRONTEND . '/welcome?ref=FRIEND77', $this->location($response));
        self::assertStringContainsString('Max-Age=0', $response->getHeaderLine('Set-Cookie'), 'the sign-in cookie is used up');
        self::assertSame('verifier-' . $state, $this->google->lastVerifier, 'the PKCE verifier reached the provider call');
        self::assertNotNull($this->session->get('uid'));
        self::assertSame('google', $this->db->scalar('SELECT signup_provider FROM users WHERE id = ?', [$this->session->get('uid')]));
        // The browser is now signed in: /me shows the welcome step is pending.
        [, $me] = $this->request('GET', '/api/auth/me');
        self::assertSame('google', $me['user']['welcome']['provider']);
    }

    public function testAnExistingMemberGoesStraightToTheirAccountOrTheSafePageTheyWereOn(): void
    {
        $this->member('ada@example.com');
        foreach ([
            ['', '/account'],
            ['return=/checkout', '/checkout'],
            ['return=//evil.example/steal', '/account'],
            ['return=https://evil.example', '/account'],
            ['return=/account?tab=orders', '/account?tab=orders'],
        ] as [$query, $expected]) {
            $this->session->remove('uid');
            [$cookie, $state] = $this->begin('google', $query);
            $response = $this->raw('GET', "/api/auth/oauth/google/callback?code=abc&state={$state}", [OAuthCookie::NAME => $cookie]);
            self::assertSame(self::FRONTEND . $expected, $this->location($response), "return: {$query}");
        }
    }

    public function testAnAnswerWithTheWrongStateIsRefused(): void
    {
        [$cookie] = $this->begin();
        $response = $this->raw('GET', '/api/auth/oauth/google/callback?code=abc&state=forged-by-an-attacker', [OAuthCookie::NAME => $cookie]);
        self::assertSame(self::FRONTEND . '/login?error=social_failed', $this->location($response));
        self::assertSame(0, $this->google->finished, 'the code was never even exchanged');
        self::assertNull($this->session->get('uid'));
    }

    public function testAnAnswerWithoutTheBrowsersSignInCookieIsRefused(): void
    {
        [, $state] = $this->begin();
        $none = $this->raw('GET', "/api/auth/oauth/google/callback?code=abc&state={$state}");
        self::assertSame(self::FRONTEND . '/login?error=social_expired', $this->location($none));
        $junk = $this->raw('GET', "/api/auth/oauth/google/callback?code=abc&state={$state}", [OAuthCookie::NAME => 'not-a-real-cookie']);
        self::assertSame(self::FRONTEND . '/login?error=social_expired', $this->location($junk));
        self::assertSame(0, $this->google->finished);
        self::assertNull($this->session->get('uid'));
    }

    public function testACookieAlteredByTheBrowserOrTooOldIsRefused(): void
    {
        [$cookie, $state] = $this->begin();
        $flipped = substr($cookie, 0, -4) . strrev(substr($cookie, -4));
        $altered = $this->raw('GET', "/api/auth/oauth/google/callback?code=abc&state={$state}", [OAuthCookie::NAME => $flipped]);
        self::assertSame(self::FRONTEND . '/login?error=social_expired', $this->location($altered));

        $this->clock->freeze('2026-10-20 12:11:00'); // eleven minutes later
        $late = $this->raw('GET', "/api/auth/oauth/google/callback?code=abc&state={$state}", [OAuthCookie::NAME => $cookie]);
        self::assertSame(self::FRONTEND . '/login?error=social_expired', $this->location($late));
        self::assertSame(0, $this->google->finished);
    }

    public function testACookieStartedForOneProviderCannotFinishAnother(): void
    {
        [$cookie, $state] = $this->begin('google');
        $response = $this->raw('GET', "/api/auth/oauth/apple/callback?code=abc&state={$state}", [OAuthCookie::NAME => $cookie]);
        self::assertSame(self::FRONTEND . '/login?error=social_failed', $this->location($response));
        self::assertSame(0, $this->apple->finished);
    }

    public function testCancellingAtTheProviderComesBackWithAFriendlyMessage(): void
    {
        [$cookie, $state] = $this->begin();
        $response = $this->raw('GET', "/api/auth/oauth/google/callback?error=access_denied&state={$state}", [OAuthCookie::NAME => $cookie]);
        self::assertSame(self::FRONTEND . '/login?error=social_cancelled', $this->location($response));
        self::assertNull($this->session->get('uid'));
    }

    public function testABadIdTokenFromTheProviderSignsNobodyIn(): void
    {
        $this->google->error = new SocialError(SocialError::FAILED, 'ID token rejected: wrong audience');
        [$cookie, $state] = $this->begin();
        $response = $this->raw('GET', "/api/auth/oauth/google/callback?code=abc&state={$state}", [OAuthCookie::NAME => $cookie]);
        self::assertSame(self::FRONTEND . '/login?error=social_failed', $this->location($response));
        self::assertNull($this->session->get('uid'));
        self::assertSame(0, (int) $this->db->scalar("SELECT COUNT(*) FROM users WHERE email = 'ada@example.com'"));
    }

    public function testASwitchedOffProviderIsRefused(): void
    {
        $response = $this->raw('GET', '/api/auth/oauth/facebook/start');
        self::assertSame(self::FRONTEND . '/login?error=social_disabled', $this->location($response));
        self::assertSame('', $this->cookieValue($response) ?? '');
        $unknown = $this->raw('GET', '/api/auth/oauth/myspace/start');
        self::assertSame(404, $unknown->getStatusCode());
    }

    public function testAnUnconfirmedEmailAndStaffAreSentBackWithTheRightMessage(): void
    {
        $this->member('ada@example.com');
        $this->google->identity = new Identity('google', 'g-9', 'ada@example.com', false, 'Ada', 'Okafor');
        [$cookie, $state] = $this->begin();
        $unverified = $this->raw('GET', "/api/auth/oauth/google/callback?code=abc&state={$state}", [OAuthCookie::NAME => $cookie]);
        self::assertSame(self::FRONTEND . '/login?error=social_email_unverified', $this->location($unverified));

        $users = $this->c->get(UserRepository::class);
        $users->create(['role' => 'manager', 'first_name' => 'Tomasz', 'last_name' => 'K', 'email' => 'tomasz@smallafrica.test', 'password_hash' => PasswordPolicy::hash('Staff&Pierogi-2026')]);
        $this->google->identity = new Identity('google', 'g-10', 'tomasz@smallafrica.test', true, 'Tomasz', 'K');
        [$cookie, $state] = $this->begin();
        $staff = $this->raw('GET', "/api/auth/oauth/google/callback?code=abc&state={$state}", [OAuthCookie::NAME => $cookie]);
        self::assertSame(self::FRONTEND . '/login?error=social_staff', $this->location($staff));
        self::assertNull($this->session->get('uid'));
    }

    public function testApplesCrossSitePostWorksWithoutACsrfTokenAndPassesTheFirstSignInName(): void
    {
        [$cookie, $state] = $this->begin('apple');
        $user = json_encode(['name' => ['firstName' => 'Kasia', 'lastName' => 'Nowak'], 'email' => 'kasia@example.com']);
        $response = $this->raw(
            'POST',
            '/api/auth/oauth/apple/callback',
            [OAuthCookie::NAME => $cookie],
            ['Origin' => 'https://appleid.apple.com'],
            http_build_query(['code' => 'abc', 'state' => $state, 'user' => $user]),
        );
        self::assertSame(302, $response->getStatusCode());
        self::assertSame(self::FRONTEND . '/welcome', $this->location($response));
        self::assertSame($user, $this->apple->lastPosted['user'] ?? null, 'the provider class gets Apple\'s extra fields');
        self::assertNotNull($this->session->get('uid'));
    }

    public function testOtherPostsStillNeedTheCsrfTokenSoOnlyAppleIsExempt(): void
    {
        $evil = $this->raw('POST', '/api/auth/logout', [], ['Origin' => 'https://appleid.apple.com']);
        self::assertSame(403, $evil->getStatusCode());
        // Apple's callback with a forged cookie is still refused, just by the state check.
        $forged = $this->raw('POST', '/api/auth/oauth/apple/callback', [], ['Origin' => 'https://appleid.apple.com'], 'code=abc&state=x');
        self::assertSame(self::FRONTEND . '/login?error=social_expired', $this->location($forged));
    }

    public function testConnectingAProviderNeedsASignedInCustomerAndComesBackToTheSettings(): void
    {
        $signedOut = $this->raw('GET', '/api/auth/oauth/google/start?mode=link');
        self::assertSame(self::FRONTEND . '/account?tab=settings&error=social_expired', $this->location($signedOut));

        $member = $this->member('ada@example.com');
        $this->c->get(AuthService::class)->signInAs($member);
        $this->google->identity = new Identity('google', 'g-77', 'someone.else@example.com', true, 'Ada', 'E');
        [$cookie, $state] = $this->begin('google', 'mode=link');
        $response = $this->raw('GET', "/api/auth/oauth/google/callback?code=abc&state={$state}", [OAuthCookie::NAME => $cookie]);
        self::assertSame(self::FRONTEND . '/account?tab=settings&connected=google', $this->location($response));
        self::assertSame('g-77', $this->db->scalar('SELECT provider_user_id FROM user_identities WHERE user_id = ?', [$member['id']]));

        // The list shows it, and the member can disconnect it again (they still have a password).
        [$list, $data] = $this->request('GET', '/api/account/identities');
        self::assertSame(200, $list->getStatusCode());
        self::assertSame('google', $data['identities'][0]['provider']);
        self::assertTrue($data['hasPassword']);
        self::assertSame(['google', 'apple'], $data['available']);
        [$gone] = $this->request('DELETE', '/api/account/identities/google', null, $this->spaHeaders());
        self::assertSame(200, $gone->getStatusCode());
        self::assertSame(0, (int) $this->db->scalar('SELECT COUNT(*) FROM user_identities WHERE user_id = ?', [$member['id']]));
    }

    public function testConnectingIsRefusedIfSomeoneElseIsSignedInAtTheEnd(): void
    {
        $ada = $this->member('ada@example.com');
        $bea = $this->member('bea@example.com');
        $auth = $this->c->get(AuthService::class);
        $auth->signInAs($ada);
        [$cookie, $state] = $this->begin('google', 'mode=link');
        $auth->signInAs($bea); // another person signs in on the same browser before the provider answers
        $response = $this->raw('GET', "/api/auth/oauth/google/callback?code=abc&state={$state}", [OAuthCookie::NAME => $cookie]);
        self::assertSame(self::FRONTEND . '/account?tab=settings&error=social_expired', $this->location($response));
        self::assertSame(0, (int) $this->db->scalar('SELECT COUNT(*) FROM user_identities'));
    }

    public function testTheWelcomeStepAndSettingAPasswordThroughTheApi(): void
    {
        [$cookie, $state] = $this->begin();
        $this->raw('GET', "/api/auth/oauth/google/callback?code=abc&state={$state}", [OAuthCookie::NAME => $cookie]);

        [$denied] = $this->request('POST', '/api/auth/welcome', ['phone' => '08031234567', 'accept_terms' => true]);
        self::assertSame(403, $denied->getStatusCode(), 'a state-changing call needs the CSRF token');

        $headers = $this->spaHeaders();
        [$bad, $badData] = $this->request('POST', '/api/auth/welcome', ['phone' => 'nope', 'accept_terms' => true], $headers);
        self::assertSame(422, $bad->getStatusCode());
        self::assertArrayHasKey('phone', $badData['error']['fields']);

        [$ok, $data] = $this->request('POST', '/api/auth/welcome', ['phone' => '0803 123 4567', 'accept_terms' => true, 'birthday_day' => 14, 'birthday_month' => 7], $headers);
        self::assertSame(200, $ok->getStatusCode());
        self::assertSame('+2348031234567', $data['user']['phone']);
        self::assertSame('2000-07-14', $data['user']['birthday']);
        self::assertNull($data['user']['welcome']);

        [, $again] = $this->request('POST', '/api/auth/welcome', ['phone' => '0803 123 4567', 'accept_terms' => true], $headers);
        self::assertSame('nothing_to_finish', $again['error']['code']);

        [$set, $setData] = $this->request('POST', '/api/account/password/set', ['new_password' => 'Jollof&Pierogi-2026'], $headers);
        self::assertSame(200, $set->getStatusCode(), json_encode($setData));
        [$user] = [$this->c->get(UserRepository::class)->find((int) $this->session->get('uid'))];
        self::assertNotNull($user['password_hash']);
    }

    public function testTooManyAttemptsFromOneAddressAreStopped(): void
    {
        $last = null;
        for ($i = 0; $i < 32; $i++) {
            $last = $this->raw('GET', '/api/auth/oauth/google/start');
        }
        self::assertSame(self::FRONTEND . '/login?error=social_failed', $this->location($last));
    }
}
