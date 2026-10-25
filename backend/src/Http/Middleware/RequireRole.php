<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Http\HttpError;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as Handler;

/**
 * Server-side RBAC. Attach to a route or group; an empty role list means "any signed-in user".
 * Staff accounts with 2FA enabled are already fully verified by the time they have a session.
 */
final class RequireRole implements MiddlewareInterface
{
    /** @param list<string> $roles */
    public function __construct(private array $roles = [])
    {
    }

    public static function signedIn(): self
    {
        return new self();
    }

    public static function staff(): self
    {
        return new self(['super_admin', 'manager', 'staff']);
    }

    public static function managers(): self
    {
        return new self(['super_admin', 'manager']);
    }

    public static function superAdmin(): self
    {
        return new self(['super_admin']);
    }

    public function process(Request $request, Handler $handler): Response
    {
        $user = $request->getAttribute('user');
        if (!is_array($user)) {
            throw HttpError::unauthorized();
        }
        if ($this->roles && !in_array($user['role'], $this->roles, true)) {
            throw HttpError::forbidden();
        }
        return $handler->handle($request);
    }
}
