<?php

declare(strict_types=1);

namespace App\Http;

final class ValidationError extends HttpError
{
    /** @param array<string, string> $errors field => message */
    public function __construct(public readonly array $errors, string $message = 'Please check the highlighted fields.')
    {
        parent::__construct(422, $message, 'validation_failed', ['fields' => $errors]);
    }

    public static function field(string $field, string $message): self
    {
        return new self([$field => $message]);
    }
}
