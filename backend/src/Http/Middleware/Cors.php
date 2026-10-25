<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as Handler;

/** CORS restricted to an allow-list. Credentials are only shared with listed origins. */
final class Cors implements MiddlewareInterface
{
    /** @param list<string> $allowedOrigins */
    public function __construct(private array $allowedOrigins, private ResponseFactoryInterface $responses)
    {
    }

    public function process(Request $request, Handler $handler): Response
    {
        $origin = $request->getHeaderLine('Origin');
        $allowed = $origin !== '' && in_array($origin, $this->allowedOrigins, true);

        if ($request->getMethod() === 'OPTIONS') {
            $response = $this->responses->createResponse($allowed ? 204 : 403);
        } else {
            $response = $handler->handle($request);
        }
        if ($allowed) {
            $response = $response
                ->withHeader('Access-Control-Allow-Origin', $origin)
                ->withHeader('Access-Control-Allow-Credentials', 'true')
                ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
                ->withHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, X-Requested-With, Idempotency-Key, X-Device-Id')
                ->withHeader('Access-Control-Max-Age', '600');
        }
        return $response->withAddedHeader('Vary', 'Origin');
    }
}
