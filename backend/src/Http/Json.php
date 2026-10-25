<?php

declare(strict_types=1);

namespace App\Http;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class Json
{
    public static function send(Response $response, mixed $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /** @return array<string, mixed> */
    public static function body(Request $request): array
    {
        $body = $request->getParsedBody();
        return is_array($body) ? $body : [];
    }

    public static function ip(Request $request): string
    {
        return (string) $request->getAttribute('client_ip', '0.0.0.0');
    }

    /** @return array<string, mixed> */
    public static function user(Request $request): array
    {
        $user = $request->getAttribute('user');
        if (!is_array($user)) {
            throw HttpError::unauthorized();
        }
        return $user;
    }
}
