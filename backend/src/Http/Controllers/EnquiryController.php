<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Json;
use App\Http\ValidationError;
use App\Mail\EmailTemplates;
use App\Mail\Mailer;
use App\Security\Crypto;
use App\Security\RateLimiter;
use App\Support\Clock;
use App\Support\Config;
use App\Support\Database;
use App\Support\Logger;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** Public forms: contact, newsletter, events & catering enquiries. All rate-limited per IP. */
final class EnquiryController
{
    public function __construct(
        private Database $db,
        private RateLimiter $limiter,
        private Mailer $mailer,
        private EmailTemplates $emails,
        private Config $config,
        private Clock $clock,
        private Logger $logger,
    ) {
    }

    public function contact(Request $request, Response $response): Response
    {
        $this->limiter->hit('contact:ip:' . Json::ip($request), 5, 3600);
        $data = Validator::validate(Json::body($request), [
            'name' => 'required|string|max:160',
            'email' => 'required|email',
            'phone' => 'nullable|phone',
            'subject' => 'required|string|max:160',
            'message' => 'required|string|min:10|max:3000',
            'website' => 'nullable|string|max:200', // honeypot: real people leave it empty
        ]);
        if (!empty($data['website'])) {
            return Json::send($response, ['message' => 'Thank you. We’ll reply within one working day.'], 201);
        }
        unset($data['website']);
        $id = $this->db->insert('contact_messages', $data);
        $this->notifyRestaurant('New contact message', "{$data['name']} ({$data['email']}) wrote: {$data['subject']}");
        return Json::send($response, ['id' => $id, 'message' => 'Thank you. We’ll reply within one working day.'], 201);
    }

    public function newsletter(Request $request, Response $response): Response
    {
        $this->limiter->hit('newsletter:ip:' . Json::ip($request), 10, 3600);
        $data = Validator::validate(Json::body($request), [
            'email' => 'required|email',
            'source' => 'nullable|string|in:footer,home,checkout,account',
        ]);
        // Idempotent and enumeration-safe: same answer whether or not the address was known.
        $existing = $this->db->one('SELECT id, status FROM newsletter_subscribers WHERE email = ?', [$data['email']]);
        if ($existing === null) {
            $this->db->insert('newsletter_subscribers', [
                'email' => $data['email'],
                'source' => $data['source'] ?? 'footer',
                'unsubscribe_token' => Crypto::hashToken(Crypto::token()),
            ]);
        } elseif ($existing['status'] === 'unsubscribed') {
            $this->db->run("UPDATE newsletter_subscribers SET status = 'subscribed', unsubscribed_at = NULL WHERE id = ?", [$existing['id']]);
        }
        return Json::send($response, ['message' => 'You’re on the list. Watch your inbox for menus, events and member offers.'], 201);
    }

    public function eventEnquiry(Request $request, Response $response): Response
    {
        $this->limiter->hit('events:ip:' . Json::ip($request), 5, 3600);
        $data = Validator::validate(Json::body($request), [
            'name' => 'required|string|max:160',
            'email' => 'required|email',
            'phone' => 'required|phone',
            'company' => 'nullable|string|max:160',
            'event_type' => 'required|string|in:private_dining,corporate,wedding,birthday,other',
            'package' => 'nullable|string|max:40',
            'event_date' => 'required|date',
            'guests' => 'required|int|min:2|max:500',
            'budget_naira' => 'nullable|int|min:0|max:500000000',
            'message' => 'nullable|string|max:2000',
        ], ['event_type' => 'Event type', 'event_date' => 'Event date', 'budget_naira' => 'Budget']);

        if ($data['event_date'] <= $this->clock->now()->format('Y-m-d')) {
            throw ValidationError::field('event_date', 'Please choose a date in the future.');
        }
        $packageId = null;
        if (!empty($data['package'])) {
            $packageId = $this->db->scalar('SELECT id FROM event_packages WHERE slug = ?', [$data['package']]);
            if (!$packageId) {
                throw ValidationError::field('package', 'Please choose a package from the list.');
            }
        }
        $user = $request->getAttribute('user');
        $id = $this->db->insert('event_enquiries', [
            'user_id' => is_array($user) ? $user['id'] : null,
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'],
            'company' => $data['company'] ?? null,
            'event_type' => $data['event_type'],
            'package_id' => $packageId,
            'event_date' => $data['event_date'],
            'guests' => $data['guests'],
            'budget_kobo' => isset($data['budget_naira']) ? $data['budget_naira'] * 100 : null,
            'message' => $data['message'] ?? null,
        ]);
        $this->notifyRestaurant('New event enquiry', "{$data['name']}: {$data['event_type']} for {$data['guests']} guests on {$data['event_date']}");
        return Json::send($response, [
            'id' => $id,
            'message' => 'Thank you. Our events team will call you within one working day with a tailored proposal.',
        ], 201);
    }

    private function notifyRestaurant(string $subject, string $body): void
    {
        $to = $this->config->str('MAIL_FROM_ADDRESS', 'hello@smallafrica.ng');
        $mail = $this->emails->render($subject . ' — Small Africa', $subject, $body, 'Open admin', rtrim($this->config->str('FRONTEND_URL'), '/') . '/admin');
        try {
            $this->mailer->send($to, 'Small Africa', $mail['subject'], $mail['html'], $mail['text']);
        } catch (\Throwable $e) {
            $this->logger->error('Staff notification failed', ['subject' => $subject, 'error' => $e->getMessage()]);
        }
    }
}
