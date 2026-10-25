<?php

declare(strict_types=1);

namespace App\Services;

use App\Http\ValidationError;
use App\Support\Clock;
use App\Support\Database;
use App\Support\Settings;

/**
 * Server-side order pricing. Prices sent by the browser are never used: every dish, option
 * and fee is read from the database here, so checkout totals can't be tampered with.
 */
final class PricingService
{
    public const MAX_QTY_PER_LINE = 20;

    public function __construct(
        private Database $db,
        private Settings $settings,
        private CouponService $coupons,
        private Clock $clock,
    ) {
    }

    /**
     * @param array{items: list<array<string, mixed>>, fulfilment: string, zone?: ?string, scheduled_for?: ?string,
     *              coupon_code?: ?string, confirm_age?: bool, email?: ?string} $req
     * @return array<string, mixed>
     */
    public function quote(array $req, ?int $userId): array
    {
        $ordering = $this->settings->group('ordering');
        $pricing = $this->settings->group('pricing');
        if (!($ordering['accepting_orders'] ?? true)) {
            throw ValidationError::field('items', 'We’re not taking online orders right now. Please call or WhatsApp us.');
        }

        $lines = $this->priceLines($req['items'], (int) ($ordering['max_items_per_order'] ?? 40));
        if (array_filter($lines, static fn ($l) => $l['isAlcoholic']) && empty($req['confirm_age'])) {
            throw ValidationError::field('confirm_age', 'Please confirm you are 18 or over to order alcohol.');
        }
        $subtotal = array_sum(array_column($lines, 'lineTotalKobo'));
        $when = $this->resolveTime($req['scheduled_for'] ?? null, (int) ($ordering['min_lead_minutes'] ?? 45), (int) ($ordering['max_schedule_days'] ?? 7));

        $zone = null;
        $deliveryFee = 0;
        if ($req['fulfilment'] === 'delivery') {
            $zone = $this->db->one('SELECT * FROM delivery_zones WHERE slug = ? AND is_active = 1', [$req['zone'] ?? '']);
            if (!$zone) {
                throw ValidationError::field('zone', 'Choose your delivery area.');
            }
            if ($subtotal < (int) $zone['min_order_kobo']) {
                throw ValidationError::field('items', sprintf(
                    'The minimum order for delivery to %s is ₦%s.',
                    $zone['name'],
                    number_format((int) $zone['min_order_kobo'] / 100),
                ));
            }
            $deliveryFee = (int) $zone['fee_kobo'];
        }

        $discount = 0;
        $coupon = null;
        if (!empty($req['coupon_code'])) {
            $result = $this->coupons->evaluate((string) $req['coupon_code'], $lines, $when['at'], $userId, (string) ($req['email'] ?? ''));
            $coupon = $result['coupon'];
            $discount = $result['discountKobo'];
        }

        $packaging = (int) ($pricing['packaging_fee_kobo'] ?? 0);
        $serviceCharge = intdiv(($subtotal - $discount) * (int) ($pricing['service_charge_online_bp'] ?? 0), 10000);
        $vatBp = (int) ($pricing['vat_rate_bp'] ?? 750);
        // Menu prices include VAT; report the included portion for the receipt.
        $vatIncluded = intdiv(($subtotal - $discount) * $vatBp, 10000 + $vatBp);
        $total = $subtotal - $discount + $deliveryFee + $packaging + $serviceCharge;

        return [
            'lines' => $lines,
            'subtotalKobo' => $subtotal,
            'discountKobo' => $discount,
            'coupon' => $coupon ? ['id' => (int) $coupon['id'], 'code' => $coupon['code'], 'description' => $coupon['description']] : null,
            'deliveryFeeKobo' => $deliveryFee,
            'packagingFeeKobo' => $packaging,
            'serviceChargeKobo' => $serviceCharge,
            'vatIncludedKobo' => $vatIncluded,
            'totalKobo' => $total,
            'fulfilment' => $req['fulfilment'],
            'zone' => $zone ? ['id' => (int) $zone['id'], 'slug' => $zone['slug'], 'name' => $zone['name'], 'etaMinutes' => (int) $zone['eta_minutes']] : null,
            'scheduledFor' => $when['scheduled'] ? $when['at']->format('Y-m-d H:i') : null,
            'estimatedReadyAt' => $when['at']->modify('+' . ($zone ? (int) $zone['eta_minutes'] : 25) . ' minutes')->format(DATE_ATOM),
        ];
    }

    /**
     * @param list<array<string, mixed>> $items
     * @return list<array<string, mixed>>
     */
    private function priceLines(array $items, int $maxItems): array
    {
        if (!$items) {
            throw ValidationError::field('items', 'Your order is empty.');
        }
        if (count($items) > 40) {
            throw ValidationError::field('items', 'That’s a lot of different dishes. Please call us for large orders.');
        }
        $today = $this->clock->now()->format('Y-m-d');
        $lines = [];
        $totalQty = 0;
        foreach ($items as $i => $item) {
            $dishId = filter_var($item['dish_id'] ?? null, FILTER_VALIDATE_INT);
            $qty = filter_var($item['quantity'] ?? null, FILTER_VALIDATE_INT);
            if ($dishId === false || $qty === false || $qty < 1 || $qty > self::MAX_QTY_PER_LINE) {
                throw ValidationError::field('items', 'One of the items in your order is invalid. Please refresh your basket.');
            }
            $dish = $this->db->one(
                'SELECT d.*, k.slug AS kitchen_slug FROM dishes d LEFT JOIN kitchens k ON k.id = d.kitchen_id
                 JOIN categories c ON c.id = d.category_id WHERE d.id = ? AND d.deleted_at IS NULL',
                [$dishId],
            );
            if (!$dish) {
                throw ValidationError::field('items', 'A dish in your order is no longer on the menu. Please remove it.');
            }
            if (!$dish['is_available'] || ($dish['sold_out_until'] !== null && $dish['sold_out_until'] >= $today)) {
                throw ValidationError::field('items', "Sorry, {$dish['name']} is sold out today. Please remove it to continue.");
            }
            if ($this->db->scalar('SELECT slug FROM categories WHERE id = ?', [$dish['category_id']]) === 'tasting') {
                throw ValidationError::field('items', 'The Chef’s Tasting Menu is served in the restaurant only. Please reserve a table.');
            }

            $options = $this->db->all('SELECT * FROM dish_options WHERE dish_id = ?', [$dishId]);
            $portions = array_values(array_filter($options, static fn ($o) => $o['option_group'] === 'portion'));
            $portion = null;
            if ($portions) {
                $wanted = $item['portion_id'] ?? null;
                foreach ($portions as $p) {
                    if (($wanted === null && $p['is_default']) || ($wanted !== null && (int) $p['id'] === (int) $wanted)) {
                        $portion = $p;
                    }
                }
                if (!$portion) {
                    throw ValidationError::field('items', "Please choose an option for {$dish['name']}.");
                }
            }
            $addonIds = array_values(array_unique(array_map('intval', (array) ($item['addon_ids'] ?? []))));
            $addons = [];
            foreach ($addonIds as $aid) {
                $match = array_values(array_filter($options, static fn ($o) => $o['option_group'] === 'addon' && (int) $o['id'] === $aid));
                if (!$match) {
                    throw ValidationError::field('items', "An add-on for {$dish['name']} isn’t available any more. Please update your basket.");
                }
                $addons[] = $match[0];
            }

            $unit = (int) $dish['price_kobo'] + (int) ($portion['price_delta_kobo'] ?? 0)
                + array_sum(array_map(static fn ($a) => (int) $a['price_delta_kobo'], $addons));
            $totalQty += $qty;
            $note = isset($item['note']) && is_string($item['note']) ? mb_substr(trim($item['note']), 0, 200) : null;
            $lines[] = [
                'dishId' => (int) $dish['id'],
                'slug' => $dish['slug'],
                'name' => $dish['name'],
                'kitchenId' => $dish['kitchen_id'] !== null ? (int) $dish['kitchen_id'] : null,
                'kitchen' => $dish['kitchen_slug'],
                'unitPriceKobo' => $unit,
                'quantity' => $qty,
                'lineTotalKobo' => $unit * $qty,
                'portion' => $portion && count($portions) > 1 ? ['id' => (int) $portion['id'], 'name' => $portion['name']] : null,
                'addons' => array_map(static fn ($a) => ['id' => (int) $a['id'], 'name' => $a['name']], $addons),
                'note' => $note ?: null,
                'containsPork' => (bool) $dish['contains_pork'],
                'isAlcoholic' => (bool) $dish['is_alcoholic'],
            ];
        }
        if ($totalQty > $maxItems) {
            throw ValidationError::field('items', "Online orders are limited to {$maxItems} items. Please call us for larger orders.");
        }
        return $lines;
    }

    /** @return array{at: \DateTimeImmutable, scheduled: bool} */
    private function resolveTime(?string $scheduled, int $leadMinutes, int $maxDays): array
    {
        $now = $this->clock->now();
        if ($scheduled === null || $scheduled === '') {
            $window = $this->settings->openingWindow($now);
            if (!$window || $now < $window['opens'] || $now->modify("+{$leadMinutes} minutes") > $window['closes']) {
                throw ValidationError::field('scheduled_for', 'We’re closed for ASAP orders right now. Please schedule your order for later.');
            }
            return ['at' => $now->modify("+{$leadMinutes} minutes"), 'scheduled' => false];
        }
        $at = \DateTimeImmutable::createFromFormat('!Y-m-d H:i', $scheduled, Clock::zone());
        if (!$at || $at->format('Y-m-d H:i') !== $scheduled) {
            throw ValidationError::field('scheduled_for', 'Choose a valid date and time.');
        }
        if ($at < $now->modify("+{$leadMinutes} minutes")) {
            throw ValidationError::field('scheduled_for', "Please allow at least {$leadMinutes} minutes for us to prepare your order.");
        }
        if ($at > $now->modify("+{$maxDays} days")) {
            throw ValidationError::field('scheduled_for', "Orders can be scheduled up to {$maxDays} days ahead.");
        }
        $window = $this->settings->openingWindow($at);
        if (!$window || $at < $window['opens'] || $at > $window['closes']) {
            throw ValidationError::field('scheduled_for', 'That time is outside our opening hours.');
        }
        return ['at' => $at, 'scheduled' => true];
    }
}
