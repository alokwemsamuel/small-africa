<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\App;
use App\Mail\LogMailer;
use App\Mail\Mailer;
use App\Security\ArraySession;
use App\Security\Session;
use App\Support\Clock;
use App\Support\Config;
use App\Support\Container;
use App\Support\Database;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * Real database (DB_TEST_DATABASE), in-memory session and mailer, frozen clock. Each test
 * runs inside a transaction that is rolled back afterwards.
 */
abstract class IntegrationTestCase extends TestCase
{
    protected Container $c;
    protected Database $db;
    protected ArraySession $session;
    protected LogMailer $mailer;
    protected Clock $clock;

    protected function setUp(): void
    {
        $config = Config::fromEnvironment();
        $config = $config
            ->with('DB_DATABASE', $config->str('DB_TEST_DATABASE'))
            ->with('APP_ENV', 'testing')
            ->with('APP_BASE_PATH', '')
            ->with('FRONTEND_URL', 'http://localhost:5173')
            ->with('CORS_ALLOWED_ORIGINS', 'http://localhost:5173')
            ->with('PAYMENT_DRIVER', 'simulated');
        $this->c = App::container($config);
        $this->session = new ArraySession();
        $this->mailer = new LogMailer(null);
        $this->clock = new Clock();
        $this->clock->freeze('2026-10-20 12:00:00');
        $this->c->instance(Session::class, $this->session);
        $this->c->instance(Mailer::class, $this->mailer);
        $this->c->instance(Clock::class, $this->clock);
        $this->db = $this->c->get(Database::class);
        $this->db->pdo()->beginTransaction();
    }

    protected function tearDown(): void
    {
        if ($this->db->pdo()->inTransaction()) {
            $this->db->pdo()->rollBack();
        }
    }

    /** Extracts the token from the most recent email's link. */
    protected function tokenFromLastEmail(): string
    {
        $last = end($this->mailer->sent);
        self::assertNotFalse($last, 'No email was sent');
        self::assertMatchesRegularExpression('/token=([A-Za-z0-9_\-]+)/', $last['text']);
        preg_match('/token=([A-Za-z0-9_\-]+)/', $last['text'], $m);
        return $m[1];
    }

    /**
     * Sends a request through the full middleware stack.
     *
     * @param array<string, mixed>|string|null $body array → JSON; string → sent raw (e.g. webhooks)
     * @param array<string, string> $headers
     * @return array{0: ResponseInterface, 1: array<string, mixed>}
     */
    protected function request(string $method, string $path, array|string|null $body = null, array $headers = []): array
    {
        $app = App::create($this->c);
        $request = (new ServerRequestFactory())->createServerRequest($method, $path, ['REMOTE_ADDR' => '203.0.113.10']);
        parse_str((string) parse_url($path, PHP_URL_QUERY), $query);
        $request = $request->withQueryParams($query);
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }
        if ($body !== null) {
            $request = $request->withHeader('Content-Type', 'application/json');
            $request->getBody()->write(is_string($body) ? $body : json_encode($body));
            $request->getBody()->rewind();
        }
        $response = $app->handle($request);
        $decoded = json_decode((string) $response->getBody(), true);
        return [$response, is_array($decoded) ? $decoded : []];
    }

    /** @return array<string, string> headers for a state-changing request from the SPA */
    protected function spaHeaders(): array
    {
        [, $data] = $this->request('GET', '/api/auth/csrf');
        return ['X-CSRF-Token' => $data['csrfToken'], 'Origin' => 'http://localhost:5173'];
    }
}
