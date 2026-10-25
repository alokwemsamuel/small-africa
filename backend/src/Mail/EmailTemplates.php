<?php

declare(strict_types=1);

namespace App\Mail;

/**
 * Branded transactional emails. Email clients need inline styles and tables; every dynamic
 * value is escaped with e().
 */
final class EmailTemplates
{
    public function __construct(private string $frontendUrl)
    {
    }

    /** @return array{subject: string, html: string, text: string} */
    public function verifyEmail(string $firstName, string $token): array
    {
        $url = $this->frontendUrl . '/verify-email?token=' . rawurlencode($token);
        return $this->render(
            'Confirm your email — Small Africa',
            'Welcome to the table, ' . $firstName,
            "Please confirm your email address to activate your account and your Small Africa Interest Account.",
            'Confirm my email',
            $url,
            'This link expires in 24 hours. If you didn’t create an account, you can ignore this email.',
        );
    }

    /** @return array{subject: string, html: string, text: string} */
    public function passwordReset(string $firstName, string $token): array
    {
        $url = $this->frontendUrl . '/reset-password?token=' . rawurlencode($token);
        return $this->render(
            'Reset your password — Small Africa',
            'Reset your password',
            "Hi {$firstName}, we received a request to reset your password. Choose a new one using the button below.",
            'Choose a new password',
            $url,
            'This link expires in 60 minutes and can be used once. If you didn’t ask for this, you can ignore this email; your password won’t change.',
        );
    }

    /** @return array{subject: string, html: string, text: string} */
    public function staffInvite(string $firstName, string $inviterName, string $roleLabel, string $token): array
    {
        $url = $this->frontendUrl . '/reset-password?token=' . rawurlencode($token);
        return $this->render(
            'You’re invited to the Small Africa admin',
            'Welcome to the team, ' . $firstName,
            "{$inviterName} has given you {$roleLabel} access to the Small Africa admin panel. Choose your password to get started.",
            'Choose my password',
            $url,
            'This link expires in 72 hours and can be used once. Managers should turn on two-factor sign-in from their account page.',
        );
    }

    /** @return array{subject: string, html: string, text: string} */
    public function passwordChanged(string $firstName): array
    {
        return $this->render(
            'Your password was changed — Small Africa',
            'Password changed',
            "Hi {$firstName}, the password on your Small Africa account was just changed and you’ve been signed out of other devices.",
            'Sign in',
            $this->frontendUrl . '/login',
            'If this wasn’t you, reset your password immediately and contact us on WhatsApp.',
        );
    }

    /**
     * @param array<string, mixed> $order
     * @param list<array{0: string, 1: int}> $items label, line total (kobo)
     * @return array{subject: string, html: string, text: string}
     */
    public function orderConfirmation(array $order, array $items, string $trackUrl): array
    {
        $rows = array_map(static fn ($i) => [$i[0], self::naira($i[1])], $items);
        $rows[] = ['Subtotal', self::naira((int) $order['subtotal_kobo'])];
        if ((int) $order['discount_kobo'] > 0) {
            $rows[] = ['Discount', '−' . self::naira((int) $order['discount_kobo'])];
        }
        if ((int) ($order['voucher_discount_kobo'] ?? 0) > 0) {
            $rows[] = ['Reward voucher', '−' . self::naira((int) $order['voucher_discount_kobo'])];
        }
        $rows[] = [$order['fulfilment'] === 'delivery' ? 'Delivery & packaging' : 'Packaging', self::naira((int) $order['delivery_fee_kobo'])];
        if ((int) ($order['wallet_applied_kobo'] ?? 0) > 0) {
            $rows[] = ['Paid with dining credit', '−' . self::naira((int) $order['wallet_applied_kobo'])];
        }
        $rows[] = [(int) ($order['wallet_applied_kobo'] ?? 0) > 0 ? 'Paid by card' : 'Total paid', self::naira((int) $order['total_kobo'])];
        $when = $order['scheduled_for']
            ? 'scheduled for ' . date('D j M, g:ia', strtotime((string) $order['scheduled_for']))
            : ($order['fulfilment'] === 'delivery' ? 'on its way as soon as it’s ready' : 'ready for pickup soon');
        return $this->render(
            "Order {$order['reference']} confirmed — Small Africa",
            'Thank you, ' . strtok((string) $order['customer_name'], ' '),
            "We’ve received your order {$order['reference']} and payment. Your {$order['fulfilment']} is {$when}. Track it live with the button below.",
            'Track my order',
            $trackUrl,
            'Prices include VAT. Questions about your order? Reply to this email or WhatsApp us, quoting ' . $order['reference'] . '.',
            $rows,
        );
    }

    /**
     * @param array<string, mixed> $order
     * @return array{subject: string, html: string, text: string}
     */
    public function orderStatus(array $order, string $status, string $trackUrl): array
    {
        [$heading, $body] = match ($status) {
            'ready' => $order['fulfilment'] === 'pickup'
                ? ['Your order is ready', "Order {$order['reference']} is ready for pickup at Small Africa, Victoria Island."]
                : ['Your order is ready', "Order {$order['reference']} is packed and waiting for your rider."],
            'out_for_delivery' => ['Your order is on its way', "Order {$order['reference']} has left our kitchen and is on its way to you."],
            default => ['Order update', "Order {$order['reference']} is now: {$status}."],
        };
        return $this->render("{$heading} — Small Africa", $heading, $body, 'Track my order', $trackUrl);
    }

    /**
     * @param array<string, mixed> $r reservation row
     * @return array{subject: string, html: string, text: string}
     */
    public function reservationConfirmation(array $r, string $areaName, string $manageUrl): array
    {
        $when = date('l j F Y', strtotime((string) $r['service_date'])) . ' at ' . date('g:ia', strtotime((string) $r['start_time']));
        $rows = [
            ['Reservation code', $r['code']],
            ['When', $when],
            ['Guests', (string) $r['party_size']],
            ['Seating', $areaName],
        ];
        if ($r['occasion'] !== 'none') {
            $rows[] = ['Occasion', ucwords(str_replace('_', ' ', (string) $r['occasion']))];
        }
        return $this->render(
            "Table confirmed for {$when} — Small Africa",
            'Your table is booked',
            'We look forward to welcoming you. If your plans change, please cancel at least 4 hours ahead so another guest can enjoy the table.',
            'View or cancel booking',
            $manageUrl,
            'Small Africa, Victoria Island, Lagos. Smart casual dress. We hold tables for 15 minutes.',
            $rows,
        );
    }

    /**
     * @param array<string, mixed> $r
     * @return array{subject: string, html: string, text: string}
     */
    public function reservationCancelled(array $r): array
    {
        return $this->render(
            "Reservation {$r['code']} cancelled — Small Africa",
            'Your booking is cancelled',
            'Your reservation for ' . date('l j F', strtotime((string) $r['service_date'])) . ' has been cancelled. We hope to see you another time.',
            'Book again',
            $this->frontendUrl . '/reservations',
        );
    }

    private static function naira(int $kobo): string
    {
        return '₦' . number_format(intdiv($kobo, 100));
    }

    /**
     * @param list<array{0: string, 1: string}> $rows optional label/value table (receipts, booking details)
     * @return array{subject: string, html: string, text: string}
     */
    public function render(string $subject, string $heading, string $body, ?string $ctaLabel, ?string $ctaUrl, string $footnote = '', array $rows = []): array
    {
        $e = static fn (string $v): string => htmlspecialchars($v, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $button = $ctaLabel && $ctaUrl
            ? '<tr><td style="padding:8px 40px 32px"><a href="' . $e($ctaUrl) . '" style="display:inline-block;background:#C9A24B;color:#0E0C0A;text-decoration:none;font:600 14px/1 Arial,sans-serif;letter-spacing:1.2px;text-transform:uppercase;padding:16px 28px;border-radius:999px">' . $e($ctaLabel) . '</a></td></tr>'
            : '';
        $table = '';
        if ($rows) {
            $last = count($rows) - 1;
            $table = '<tr><td style="padding:0 40px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #3a3022">';
            foreach ($rows as $i => [$label, $value]) {
                $weight = $i === $last ? '600' : '400';
                $table .= '<tr><td style="padding:10px 0;border-bottom:1px solid #3a3022;font:' . $weight . ' 14px/1.4 Arial,sans-serif;color:#E7D9C4">' . $e($label) . '</td>'
                    . '<td style="padding:10px 0;border-bottom:1px solid #3a3022;text-align:right;font:' . $weight . ' 14px/1.4 Arial,sans-serif;color:#F6EFE3">' . $e($value) . '</td></tr>';
            }
            $table .= '</table></td></tr>';
        }
        $html = <<<HTML
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{$e($subject)}</title></head>
<body style="margin:0;background:#0E0C0A;padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#1A1612;border:1px solid #3a3022;border-radius:8px">
<tr><td style="padding:36px 40px 8px;text-align:center;font:600 22px/1 Georgia,serif;letter-spacing:6px;color:#C9A24B">SMALL AFRICA</td></tr>
<tr><td style="padding:0 40px 24px;text-align:center;font:italic 15px/1.4 Georgia,serif;color:#E6C97A">Three kitchens. One table.</td></tr>
<tr><td style="padding:8px 40px 12px;font:600 26px/1.25 Georgia,serif;color:#F6EFE3">{$e($heading)}</td></tr>
<tr><td style="padding:0 40px 24px;font:400 15px/1.6 Arial,sans-serif;color:#E7D9C4">{$e($body)}</td></tr>
{$table}
{$button}
<tr><td style="padding:0 40px 32px;font:400 12px/1.6 Arial,sans-serif;color:#8A8178">{$e($footnote)}</td></tr>
</table>
<p style="text-align:center;font:400 11px/1.6 Arial,sans-serif;color:#8A8178;margin:16px 0 0">Small Africa · Lagos, Nigeria</p>
</body></html>
HTML;
        $text = "SMALL AFRICA\n\n{$heading}\n\n{$body}\n\n"
            . implode('', array_map(static fn ($r) => "{$r[0]}: {$r[1]}\n", $rows)) . ($rows ? "\n" : '')
            . ($ctaUrl ? "{$ctaLabel}: {$ctaUrl}\n\n" : '') . $footnote . "\n";
        return ['subject' => $subject, 'html' => $html, 'text' => $text];
    }
}
