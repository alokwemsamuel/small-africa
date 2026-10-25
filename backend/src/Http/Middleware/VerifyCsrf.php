<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Http\HttpError;
use App\Security\Csrf;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as Handler;

/**
 * Every state-changing request needs (1) a matching X-CSRF-Token header and (2) an Origin
 * (or Referer) from the allow-list when the browser sends one. Server-to-server webhooks are
 * exempt; they are authenticated by signature instead.
 */
final class VerifyCsrf implements MiddlewareInterface
{
    private const SAFE = ['GET', 'HEAD', 'OPTIONS'];

    /**
     * @param list<string> $allowedOrigins
     * @param list<string> $exemptPaths path suffixes, e.g. "/api/payments/paystack/webhook"
     */
    public function __construct(private Csrf $csrf, private array $allowedOrigins, private array $exemptPaths)
    {
    }

    public function process(Request $request, Handler $handler): Response
    {
        if (in_array($request->getMethod(), self::SAFE, true) || $this->isExempt($request->getUri()->getPath())) {
            return $handler->handle($request);
        }
        $origin = $request->getHeaderLine('Origin');
        if ($origin === '' && ($referer = $request->getHeaderLine('Referer')) !== '') {
            $parts = parse_url($referer);
            $origin = isset($parts['scheme'], $parts['host'])
                ? $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '')
                : '';
        }
        if ($origin !== '' && !in_array($origin, $this->allowedOrigins, true)) {
            throw HttpError::forbidden('Request origin not allowed.');
        }
        if (!$this->csrf->isValid($request->getHeaderLine('X-CSRF-Token'))) {
            throw new HttpError(403, 'Your session expired. Please refresh the page and try again.', 'csrf_mismatch');
        }
        return $handler->handle($request);
    }

    private function isExempt(string $path): bool
    {
        foreach ($this->exemptPaths as $suffix) {
            if (str_ends_with($path, $suffix)) {
                return true;
            }
        }
        return false;
    }
}
