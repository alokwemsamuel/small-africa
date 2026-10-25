<?php

declare(strict_types=1);

namespace App\Mail;

use App\Support\Config;
use PHPMailer\PHPMailer\PHPMailer;

final class SmtpMailer implements Mailer
{
    public function __construct(private Config $config)
    {
    }

    public function send(string $toEmail, string $toName, string $subject, string $html, string $text): void
    {
        $mail = new PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = $this->config->str('MAIL_HOST');
        $mail->Port = $this->config->int('MAIL_PORT', 587);
        $mail->SMTPAuth = true;
        $mail->Username = $this->config->str('MAIL_USERNAME');
        $mail->Password = $this->config->str('MAIL_PASSWORD');
        $mail->SMTPSecure = $this->config->str('MAIL_ENCRYPTION', 'tls') === 'ssl' ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
        $mail->CharSet = PHPMailer::CHARSET_UTF8;
        $mail->setFrom($this->config->str('MAIL_FROM_ADDRESS'), $this->config->str('MAIL_FROM_NAME', 'Small Africa'));
        $mail->addAddress($toEmail, $toName);
        $mail->Subject = $subject;
        $mail->isHTML(true);
        $mail->Body = $html;
        $mail->AltBody = $text;
        $mail->send();
    }
}
