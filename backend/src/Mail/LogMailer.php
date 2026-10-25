<?php

declare(strict_types=1);

namespace App\Mail;

/** Development mailer: writes each message to storage/mail as an .html file you can open. */
final class LogMailer implements Mailer
{
    /** @var list<array{to: string, subject: string, html: string, text: string}> */
    public array $sent = [];

    public function __construct(private ?string $dir)
    {
    }

    public function send(string $toEmail, string $toName, string $subject, string $html, string $text): void
    {
        $this->sent[] = ['to' => $toEmail, 'subject' => $subject, 'html' => $html, 'text' => $text];
        if ($this->dir === null) {
            return;
        }
        if (!is_dir($this->dir)) {
            @mkdir($this->dir, 0750, true);
        }
        $slug = preg_replace('/[^a-z0-9]+/', '-', strtolower($subject));
        $file = sprintf('%s/%s_%s_%s.html', $this->dir, date('Ymd-His'), substr(bin2hex(random_bytes(3)), 0, 6), trim($slug, '-'));
        $header = sprintf("<!--\nTo: %s <%s>\nSubject: %s\n-->\n", $toName, $toEmail, $subject);
        file_put_contents($file, $header . $html);
    }
}
