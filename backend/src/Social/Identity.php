<?php

declare(strict_types=1);

namespace App\Social;

/**
 * Who a provider says someone is, after the provider's answer has been verified on the server.
 * The subject (the provider's own id for the person) identifies them; the email is only a hint.
 */
final class Identity
{
    public function __construct(
        public readonly string $provider,
        public readonly string $subject,
        public readonly ?string $email,
        /** True only when the provider itself says the email address is confirmed. */
        public readonly bool $emailVerified,
        public readonly string $firstName = '',
        public readonly string $lastName = '',
    ) {
    }
}
