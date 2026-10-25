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

    /** @return array{subject: string, html: string, text: string} */
    public function render(string $subject, string $heading, string $body, ?string $ctaLabel, ?string $ctaUrl, string $footnote = ''): array
    {
        $e = static fn (string $v): string => htmlspecialchars($v, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $button = $ctaLabel && $ctaUrl
            ? '<tr><td style="padding:8px 40px 32px"><a href="' . $e($ctaUrl) . '" style="display:inline-block;background:#C9A24B;color:#0E0C0A;text-decoration:none;font:600 14px/1 Arial,sans-serif;letter-spacing:1.2px;text-transform:uppercase;padding:16px 28px;border-radius:999px">' . $e($ctaLabel) . '</a></td></tr>'
            : '';
        $html = <<<HTML
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{$e($subject)}</title></head>
<body style="margin:0;background:#0E0C0A;padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#1A1612;border:1px solid #3a3022;border-radius:8px">
<tr><td style="padding:36px 40px 8px;text-align:center;font:600 22px/1 Georgia,serif;letter-spacing:6px;color:#C9A24B">SMALL AFRICA</td></tr>
<tr><td style="padding:0 40px 24px;text-align:center;font:italic 15px/1.4 Georgia,serif;color:#E6C97A">Three kitchens. One table.</td></tr>
<tr><td style="padding:8px 40px 12px;font:600 26px/1.25 Georgia,serif;color:#F6EFE3">{$e($heading)}</td></tr>
<tr><td style="padding:0 40px 24px;font:400 15px/1.6 Arial,sans-serif;color:#E7D9C4">{$e($body)}</td></tr>
{$button}
<tr><td style="padding:0 40px 32px;font:400 12px/1.6 Arial,sans-serif;color:#8A8178">{$e($footnote)}</td></tr>
</table>
<p style="text-align:center;font:400 11px/1.6 Arial,sans-serif;color:#8A8178;margin:16px 0 0">Small Africa · Lagos, Nigeria</p>
</body></html>
HTML;
        $text = "SMALL AFRICA\n\n{$heading}\n\n{$body}\n\n" . ($ctaUrl ? "{$ctaLabel}: {$ctaUrl}\n\n" : '') . $footnote . "\n";
        return ['subject' => $subject, 'html' => $html, 'text' => $text];
    }
}
