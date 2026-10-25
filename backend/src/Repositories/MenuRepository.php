<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Support\Clock;
use App\Support\Database;

/** Read model for the public menu. Prices are kobo; the client never supplies prices. */
final class MenuRepository
{
    private const DISH_SELECT = 'SELECT d.*, k.slug AS kitchen_slug, c.slug AS category_slug
        FROM dishes d
        LEFT JOIN kitchens k ON k.id = d.kitchen_id
        JOIN categories c ON c.id = d.category_id
        WHERE d.deleted_at IS NULL';

    public function __construct(private Database $db, private Clock $clock)
    {
    }

    /** @return list<array<string, mixed>> */
    public function kitchens(): array
    {
        return array_map(static fn ($k) => [
            'id' => (int) $k['id'],
            'slug' => $k['slug'],
            'name' => $k['name'],
            'tagline' => $k['tagline'],
            'description' => $k['description'],
            'accentColor' => $k['accent_color'],
        ], $this->db->all('SELECT * FROM kitchens ORDER BY sort_order'));
    }

    /** @return list<array<string, mixed>> */
    public function categories(): array
    {
        return array_map(static fn ($c) => ['id' => (int) $c['id'], 'slug' => $c['slug'], 'name' => $c['name']],
            $this->db->all('SELECT * FROM categories ORDER BY sort_order'));
    }

    /** @return list<array<string, mixed>> */
    public function dishes(): array
    {
        $rows = $this->db->all(self::DISH_SELECT . ' ORDER BY c.sort_order, d.sort_order');
        $options = $this->optionsByDish();
        return array_map(fn ($d) => $this->toPublic($d, $options[(int) $d['id']] ?? []), $rows);
    }

    /** @return array<string, mixed>|null */
    public function dish(string $slug): ?array
    {
        $d = $this->db->one(self::DISH_SELECT . ' AND d.slug = ?', [$slug]);
        if (!$d) {
            return null;
        }
        $dish = $this->toPublic($d, $this->optionsByDish((int) $d['id'])[(int) $d['id']] ?? []);
        $dish['tastingCourses'] = array_map(static fn ($t) => [
            'courseNo' => (int) $t['course_no'], 'kitchen' => $t['kitchen_slug'], 'name' => $t['name'], 'description' => $t['description'],
        ], $this->db->all(
            'SELECT t.*, k.slug AS kitchen_slug FROM tasting_courses t JOIN kitchens k ON k.id = t.kitchen_id WHERE t.dish_id = ? ORDER BY t.course_no',
            [$d['id']],
        ));

        // Related: same kitchen first, then same category; popular first.
        $related = $this->db->all(
            self::DISH_SELECT . ' AND d.id <> ? AND (d.kitchen_id <=> ? OR d.category_id = ?)
             ORDER BY (d.kitchen_id <=> ?) DESC, (d.category_id = ?) DESC, d.popularity DESC LIMIT 4',
            [$d['id'], $d['kitchen_id'], $d['category_id'], $d['kitchen_id'], $d['category_id']],
        );
        $dish['related'] = array_map(fn ($r) => $this->toPublic($r, []), $related);
        return $dish;
    }

    /** @return array<int, array{portion: list<array<string, mixed>>, addon: list<array<string, mixed>>}> */
    private function optionsByDish(?int $dishId = null): array
    {
        $rows = $dishId === null
            ? $this->db->all('SELECT * FROM dish_options ORDER BY dish_id, option_group, sort_order')
            : $this->db->all('SELECT * FROM dish_options WHERE dish_id = ? ORDER BY option_group, sort_order', [$dishId]);
        $out = [];
        foreach ($rows as $o) {
            $out[(int) $o['dish_id']][$o['option_group']][] = [
                'id' => (int) $o['id'],
                'name' => $o['name'],
                'priceDeltaKobo' => (int) $o['price_delta_kobo'],
                'isDefault' => (bool) $o['is_default'],
            ];
        }
        return $out;
    }

    /**
     * @param array<string, mixed> $d
     * @param array<string, mixed> $options
     * @return array<string, mixed>
     */
    private function toPublic(array $d, array $options): array
    {
        $today = $this->clock->now()->format('Y-m-d');
        $soldOut = !$d['is_available'] || ($d['sold_out_until'] !== null && $d['sold_out_until'] >= $today);
        return [
            'id' => (int) $d['id'],
            'slug' => $d['slug'],
            'name' => $d['name'],
            'kitchen' => $d['kitchen_slug'],
            'category' => $d['category_slug'],
            'shortDescription' => $d['short_description'],
            'description' => $d['description'],
            'ingredients' => $d['ingredients'],
            'allergens' => $d['allergens'] ? explode(',', $d['allergens']) : [],
            'priceKobo' => (int) $d['price_kobo'],
            'spiceLevel' => (int) $d['spice_level'],
            'isVegetarian' => (bool) $d['is_vegetarian'],
            'isGlutenFree' => (bool) $d['is_gluten_free'],
            'containsNuts' => (bool) $d['contains_nuts'],
            'containsPork' => (bool) $d['contains_pork'],
            'isAlcoholic' => (bool) $d['is_alcoholic'],
            'isFeatured' => (bool) $d['is_featured'],
            'isAvailable' => !$soldOut,
            'popularity' => (int) $d['popularity'],
            'imageUrl' => $d['image_path'] ? '/uploads/' . $d['image_path'] : null,
            'imageAlt' => $d['image_alt'] ?: $d['name'],
            'options' => ['portion' => $options['portion'] ?? [], 'addon' => $options['addon'] ?? []],
        ];
    }
}
