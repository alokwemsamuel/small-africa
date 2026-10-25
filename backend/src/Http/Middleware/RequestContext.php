<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Audit\AuditLogger;
use App\Http\HttpError;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as Handler;

/**
 * Resolves the client IP (trusting X-Forwarded-For only from configured proxies), caps body
 * size, and passes request context to the audit logger.
 */
final class RequestContext implements MiddlewareInterface
{
    private const MAX_JSON_BYTES = 1_048_576;

    /** @param list<string> $trustedProxies */
    public function __construct(private array $trustedProxies, private AuditLogger $audit)
    {
    }

    public function process(Request $request, Handler $handler): Response
    {
        $server = $request->getServerParams();
        $ip = (string) ($server['REMOTE_ADDR'] ?? '0.0.0.0');
        if (in_array($ip, $this->trustedProxies, true)) {
            $forwarded = trim(explode(',', $request->getHeaderLine('X-Forwarded-For'))[0] ?? '');
            if (filter_var($forwarded, FILTER_VALIDATE_IP)) {
                $ip = $forwarded;
            }
        }
        if ((int) $request->getHeaderLine('Content-Length') > self::MAX_JSON_BYTES
            && str_contains($request->getHeaderLine('Content-Type'), 'json')) {
            throw new HttpError(413, 'That request is too large.', 'payload_too_large');
        }
        $this->audit->withRequestContext($ip, $request->getHeaderLine('User-Agent') ?: null);
        return $handler->handle($request->withAttribute('client_ip', $ip));
    }
}
