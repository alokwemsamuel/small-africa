<?php

declare(strict_types=1);

namespace App\Social;

/**
 * A sign-in that can't go ahead, for a reason the customer should be told about. The code becomes
 * `?error=social_<code>` on the page they are sent back to (frontend/src/lib/socialErrors.js).
 */
final class SocialError extends \RuntimeException
{
    public const CANCELLED = 'cancelled';
    public const FAILED = 'failed';
    public const EXPIRED = 'expired';
    public const DISABLED = 'disabled';
    public const EMAIL_UNVERIFIED = 'email_unverified';
    public const STAFF = 'staff';
    public const INACTIVE = 'inactive';
    public const IN_USE = 'in_use';

    public function __construct(public readonly string $reason, string $detail = '')
    {
        parent::__construct($detail !== '' ? $detail : "Social sign-in: {$reason}");
    }
}
