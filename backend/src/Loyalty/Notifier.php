<?php

declare(strict_types=1);

namespace App\Loyalty;

use App\Mail\EmailTemplates;
use App\Mail\Mailer;
use App\Support\Clock;
use App\Support\Database;
use App\Support\Logger;

/**
 * In-app notification centre plus the matching email. Email failures are logged, never
 * fatal: the credit or points have already been recorded in the ledger.
 */
final class Notifier
{
    public function __construct(
        private Database $db,
        private Mailer $mailer,
        private EmailTemplates $emails,
        private Logger $logger,
        private Clock $clock,
        private string $frontendUrl,
    ) {
    }

    /**
     * @param array<string, mixed> $data
     * @param array{subject: string, heading: string, body: string, cta?: string, path?: string, footnote?: string}|null $email
     */
    public function notify(int $userId, string $type, string $title, string $body, array $data = [], ?array $email = null): void
    {
        $this->db->insert('notifications', [
            'user_id' => $userId,
            'type' => $type,
            'title' => mb_substr($title, 0, 160),
            'body' => mb_substr($body, 0, 500),
            'data' => $data ? json_encode($data, JSON_UNESCAPED_UNICODE) : null,
            'created_at' => $this->clock->sql(),
        ]);
        if ($email === null) {
            return;
        }
        $user = $this->db->one('SELECT email, first_name, last_name, is_active FROM users WHERE id = ?', [$userId]);
        if (!$user || !$user['is_active']) {
            return;
        }
        $mail = $this->emails->render(
            $email['subject'],
            $email['heading'],
            $email['body'],
            $email['cta'] ?? 'Open my Interest Account',
            $this->frontendUrl . ($email['path'] ?? '/account?tab=rewards'),
            $email['footnote'] ?? 'Dining credit can only be spent at Small Africa. It is not cash and can’t be withdrawn or transferred.',
        );
        try {
            $this->mailer->send($user['email'], trim($user['first_name'] . ' ' . $user['last_name']), $mail['subject'], $mail['html'], $mail['text']);
        } catch (\Throwable $e) {
            $this->logger->error('Loyalty email failed', ['user_id' => $userId, 'type' => $type, 'error' => $e->getMessage()]);
        }
    }

    public static function naira(int $kobo): string
    {
        return '₦' . number_format(intdiv($kobo, 100));
    }
}
