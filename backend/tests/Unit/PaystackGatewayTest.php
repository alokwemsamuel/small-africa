<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Payments\HttpClient;
use App\Payments\PaystackGateway;
use PHPUnit\Framework\TestCase;

final class PaystackGatewayTest extends TestCase
{
    private const SECRET = 'sk_test_unit_secret';

    /** @param list<array{status: int, body: array<string, mixed>}> $responses */
    private function fake(array $responses): HttpClient
    {
        return new class ($responses) extends HttpClient {
            /** @var list<array{method: string, url: string, headers: array<string, string>, body: ?string}> */
            public array $calls = [];

            public function __construct(private array $responses)
            {
            }

            public function request(string $method, string $url, array $headers = [], ?string $body = null): array
            {
                $this->calls[] = compact('method', 'url', 'headers', 'body');
                $next = array_shift($this->responses);
                return ['status' => $next['status'], 'body' => json_encode($next['body'])];
            }
        };
    }

    public function testInitializeSendsKoboAmountReferenceAndSecretServerSide(): void
    {
        $http = $this->fake([['status' => 200, 'body' => ['status' => true, 'data' => ['access_code' => 'AC_1', 'authorization_url' => 'https://checkout.paystack.com/AC_1']]]]);
        $result = (new PaystackGateway(self::SECRET, $http))->initialize('SA-ABC123', 4300000, 'ada@example.com', ['purpose' => 'order'], 'https://smallafrica.ng/orders/SA-ABC123');
        self::assertSame('AC_1', $result['accessCode']);
        $call = $http->calls[0];
        self::assertSame('https://api.paystack.co/transaction/initialize', $call['url']);
        self::assertSame('Bearer ' . self::SECRET, $call['headers']['Authorization']);
        $sent = json_decode((string) $call['body'], true);
        self::assertSame(4300000, $sent['amount']);
        self::assertSame('NGN', $sent['currency']);
        self::assertSame('SA-ABC123', $sent['reference']);
    }

    public function testVerifyMapsStatusesAndDropsSensitiveFields(): void
    {
        $http = $this->fake([
            ['status' => 200, 'body' => ['status' => true, 'data' => ['status' => 'success', 'amount' => 4300000, 'currency' => 'NGN', 'reference' => 'SA-ABC123', 'paid_at' => '2026-10-20T11:00:00Z', 'authorization' => ['authorization_code' => 'AUTH_secret', 'bin' => '408408']]]],
            ['status' => 200, 'body' => ['status' => true, 'data' => ['status' => 'abandoned', 'amount' => 4300000, 'currency' => 'NGN']]],
            ['status' => 200, 'body' => ['status' => true, 'data' => ['status' => 'reversed', 'amount' => 4300000, 'currency' => 'NGN']]],
        ]);
        $gw = new PaystackGateway(self::SECRET, $http);
        $ok = $gw->verify('SA-ABC123');
        self::assertSame('success', $ok['status']);
        self::assertSame(4300000, $ok['amountKobo']);
        self::assertArrayNotHasKey('authorization', $ok['raw'], 'Card authorisation data is never stored');
        self::assertSame('abandoned', $gw->verify('SA-ABC123')['status']);
        self::assertSame('failed', $gw->verify('SA-ABC123')['status']);
    }

    public function testApiErrorsThrow(): void
    {
        $http = $this->fake([['status' => 401, 'body' => ['status' => false, 'message' => 'Invalid key']]]);
        $this->expectException(\RuntimeException::class);
        (new PaystackGateway(self::SECRET, $http))->verify('SA-ABC123');
    }

    public function testWebhookSignatureIsHmacSha512OfRawBody(): void
    {
        $gw = new PaystackGateway(self::SECRET, $this->fake([]));
        $body = '{"event":"charge.success","data":{"reference":"SA-ABC123"}}';
        self::assertTrue($gw->verifyWebhookSignature($body, hash_hmac('sha512', $body, self::SECRET)));
        self::assertFalse($gw->verifyWebhookSignature($body . ' ', hash_hmac('sha512', $body, self::SECRET)));
        self::assertFalse($gw->verifyWebhookSignature($body, ''));
    }

    public function testRefusesMissingSecretKey(): void
    {
        $this->expectException(\RuntimeException::class);
        new PaystackGateway('', $this->fake([]));
    }
}
