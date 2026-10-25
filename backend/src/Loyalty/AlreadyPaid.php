<?php

declare(strict_types=1);

namespace App\Loyalty;

use App\Http\HttpError;

/** Interest for this month has already been paid; nothing was changed. */
final class AlreadyPaid extends HttpError
{
    public function __construct(public readonly string $period)
    {
        parent::__construct(409, "Interest for {$period} has already been paid.", 'interest_already_paid');
    }
}
