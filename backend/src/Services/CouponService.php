<?php

declare(strict_types=1);

namespace App\Services;

use App\Http\ValidationError;
use App\Support\Database;

/** Validates a coupon against an order and computes its discount (kobo). */
final class CouponService
{
    public function __construct(private Database $db)
    {
    }

    /**
     * @param list<array{kitchenId: int|null, lineTotalKobo: int}> $lines priced order lines
     * @return array{coupon: array<string, mixed>, discountKobo: int}
     */
    public function evaluate(string $code, array $lines, \DateTimeImmutable $orderDate, ?int $userId, string $email): array
    {
        $code = strtoupper(trim($code));
        $coupon = $this->db->one('SELECT * FROM coupons WHERE code = ?', [$code]);
        $fail = static fn (string $m) => throw ValidationError::field('coupon_code', $m);
        if (!$coupon || !$coupon['is_active']) {
            $fail('That code isn’t valid.');
        }
        $at = $orderDate->format('Y-m-d H:i:s');
        if ($coupon['starts_at'] && $at < $coupon['starts_at']) {
            $fail('That code isn’t active yet.');
        }
        if ($coupon['ends_at'] && $at > $coupon['ends_at']) {
            $fail('That code has expired.');
        }
        if ($coupon['valid_weekdays'] !== null && $coupon['valid_weekdays'] !== '') {
            $days = array_map('intval', explode(',', $coupon['valid_weekdays']));
            if (!in_array((int) $orderDate->format('w'), $days, true)) {
                $names = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
                $fail('That code is only valid on ' . implode(' and ', array_map(static fn ($d) => $names[$d], $days)) . '.');
            }
        }
        if ($coupon['usage_limit'] !== null && (int) $coupon['times_used'] >= (int) $coupon['usage_limit']) {
            $fail('That code has reached its usage limit.');
        }

        $email = mb_strtolower($email);
        if ($coupon['per_user_limit'] !== null) {
            $used = (int) $this->db->scalar(
                'SELECT COUNT(*) FROM coupon_redemptions cr JOIN orders o ON o.id = cr.order_id
                 WHERE cr.coupon_id = ? AND (o.customer_email = ? OR (? IS NOT NULL AND o.user_id = ?))',
                [$coupon['id'], $email, $userId, $userId],
            );
            if ($used >= (int) $coupon['per_user_limit']) {
                $fail('You’ve already used this code.');
            }
        }
        if ($coupon['first_order_only']) {
            $previous = (int) $this->db->scalar(
                "SELECT COUNT(*) FROM orders WHERE payment_status = 'paid' AND (customer_email = ? OR (? IS NOT NULL AND user_id = ?))",
                [$email, $userId, $userId],
            );
            if ($previous > 0) {
                $fail('This code is for your first order only.');
            }
        }

        $eligible = 0;
        foreach ($lines as $l) {
            if ($coupon['kitchen_id'] === null || $l['kitchenId'] === (int) $coupon['kitchen_id']) {
                $eligible += $l['lineTotalKobo'];
            }
        }
        if ($eligible === 0) {
            $kitchen = $this->db->scalar('SELECT name FROM kitchens WHERE id = ?', [$coupon['kitchen_id']]);
            $fail("Add a dish from our {$kitchen} to use this code.");
        }
        if ($eligible < (int) $coupon['min_order_kobo']) {
            $fail(sprintf('Spend ₦%s on eligible dishes to use this code.', number_format((int) $coupon['min_order_kobo'] / 100)));
        }

        $discount = $coupon['discount_type'] === 'percent'
            ? intdiv($eligible * (int) $coupon['discount_value'], 100)
            : (int) $coupon['discount_value'];
        if ($coupon['max_discount_kobo'] !== null) {
            $discount = min($discount, (int) $coupon['max_discount_kobo']);
        }
        // Round down to whole naira so receipts never show kobo.
        $discount = intdiv(min($discount, $eligible), 100) * 100;
        return ['coupon' => $coupon, 'discountKobo' => $discount];
    }
}
