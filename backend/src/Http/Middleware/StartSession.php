<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Security\Session;
use App\Services\AuthService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as Handler;

/** Starts the session and attaches the signed-in user (if any) as the "user" attribute. */
final class StartSession implements MiddlewareInterface
{
    public function __construct(private Session $session, private AuthService $auth)
    {
    }

    public function process(Request $request, Handler $handler): Response
    {
        $this->session->start();
        return $handler->handle($request->withAttribute('user', $this->auth->currentUser()));
    }
}
