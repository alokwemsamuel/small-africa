<?php

declare(strict_types=1);

namespace App\Http;

/**
 * An error whose message is safe to show the user. Anything else that escapes a handler is
 * logged and replaced with a generic message.
 */
class HttpError extends \RuntimeException
{
    /** @param array<string, mixed> $extra */
    public function __construct(
        public readonly int $status,
        string $message,
        public readonly string $errorCode = 'error',
        public readonly array $extra = [],
    ) {
        parent::__construct($message, $status);
    }

    public static function badRequest(string $message, string $code = 'bad_request'): self
    {
        return new self(400, $message, $code);
    }

    public static function unauthorized(string $message = 'Please sign in to continue.'): self
    {
        return new self(401, $message, 'unauthenticated');
    }

    public static function forbidden(string $message = "You don't have permission to do that."): self
    {
        return new self(403, $message, 'forbidden');
    }

    public static function notFound(string $message = 'We couldn’t find that.'): self
    {
        return new self(404, $message, 'not_found');
    }

    public static function conflict(string $message, string $code = 'conflict'): self
    {
        return new self(409, $message, $code);
    }

    public static function tooManyRequests(int $retryAfter): self
    {
        return new self(429, 'Too many attempts. Please wait a moment and try again.', 'rate_limited', ['retryAfter' => $retryAfter]);
    }
}
