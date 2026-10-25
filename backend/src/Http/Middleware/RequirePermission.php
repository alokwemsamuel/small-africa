<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Http\HttpError;
use App\Security\Permissions;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as Handler;

/** Server-side check of one admin permission (see Permissions::MAP). */
final class RequirePermission implements MiddlewareInterface
{
    public function __construct(private string $permission)
    {
    }

    public function process(Request $request, Handler $handler): Response
    {
        $user = $request->getAttribute('user');
        if (!is_array($user)) {
            throw HttpError::unauthorized();
        }
        if (!Permissions::can($user, $this->permission)) {
            throw HttpError::forbidden();
        }
        return $handler->handle($request);
    }
}
