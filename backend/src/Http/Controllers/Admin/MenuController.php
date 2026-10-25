<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Audit\AuditLogger;
use App\Http\HttpError;
use App\Http\Json;
use App\Http\ValidationError;
use App\Media\ImageUploads;
use App\Support\Clock;
use App\Support\Database;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class MenuController extends AdminController
{
    private const ALLERGENS = ['gluten', 'dairy', 'egg', 'nuts', 'peanuts', 'fish', 'shellfish', 'soy', 'sesame', 'celery', 'mustard', 'sulphites'];

    public function __construct(private Database $db, private ImageUploads $uploads, private AuditLogger $audit, private Clock $clock)
    {
    }

    public function index(Request $request, Response $response): Response
    {
        $options = [];
        foreach ($this->db->all('SELECT * FROM dish_options ORDER BY option_group, sort_order, id') as $o) {
            $options[(int) $o['dish_id']][] = [
                'id' => (int) $o['id'], 'group' => $o['option_group'], 'name' => $o['name'],
                'priceDeltaKobo' => (int) $o['price_delta_kobo'], 'isDefault' => (bool) $o['is_default'],
            ];
        }
        $today = $this->clock->now()->format('Y-m-d');
        return Json::send($response, [
            'kitchens' => array_map(static fn ($k) => [
                'id' => (int) $k['id'], 'slug' => $k['slug'], 'name' => $k['name'], 'tagline' => $k['tagline'], 'description' => $k['description'],
            ], $this->db->all('SELECT * FROM kitchens ORDER BY sort_order')),
            'categories' => array_map(static fn ($c) => ['id' => (int) $c['id'], 'slug' => $c['slug'], 'name' => $c['name'], 'sortOrder' => (int) $c['sort_order']],
                $this->db->all('SELECT * FROM categories ORDER BY sort_order')),
            'dishes' => array_map(fn ($d) => [
                'id' => (int) $d['id'],
                'slug' => $d['slug'],
                'name' => $d['name'],
                'kitchenId' => $d['kitchen_id'] !== null ? (int) $d['kitchen_id'] : null,
                'categoryId' => (int) $d['category_id'],
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
                'isAvailable' => (bool) $d['is_available'],
                'soldOutToday' => $d['sold_out_until'] !== null && $d['sold_out_until'] >= $today,
                'imageUrl' => $d['image_path'] ? '/media/' . $d['image_path'] : null,
                'imageAlt' => $d['image_alt'],
                'sortOrder' => (int) $d['sort_order'],
                'popularity' => (int) $d['popularity'],
                'options' => $options[(int) $d['id']] ?? [],
            ], $this->db->all('SELECT * FROM dishes WHERE deleted_at IS NULL ORDER BY category_id, sort_order, name')),
        ]);
    }

    public function create(Request $request, Response $response): Response
    {
        $data = $this->validateDish(Json::body($request), true);
        $id = $this->db->transaction(function () use ($data): int {
            $id = $this->db->insert('dishes', $this->columns($data) + ['slug' => $this->uniqueSlug($data['name'])]);
            $this->saveOptions($id, $data['options'] ?? []);
            return $id;
        });
        $this->audit->record($this->actorId($request), 'menu.dish_created', 'dish', $id, ['name' => $data['name']]);
        return $this->index($request, $response)->withStatus(201);
    }

    /** @param array{id: string} $args */
    public function update(Request $request, Response $response, array $args): Response
    {
        $dish = $this->dish((int) $args['id']);
        $data = $this->validateDish(Json::body($request), false);
        $before = $dish;
        $this->db->transaction(function () use ($dish, $data): void {
            $cols = $this->columns($data);
            if ($cols) {
                $this->db->run(
                    'UPDATE dishes SET ' . implode(', ', array_map(static fn ($c) => "{$c} = ?", array_keys($cols))) . ' WHERE id = ?',
                    [...array_values($cols), $dish['id']],
                );
            }
            if (array_key_exists('options', $data)) {
                $this->saveOptions((int) $dish['id'], $data['options']);
            }
        });
        $changed = array_keys(array_diff_key($data, ['options' => 1]));
        $meta = ['fields' => $changed];
        if (isset($data['price_naira'])) {
            $meta['price'] = ['from' => (int) $before['price_kobo'], 'to' => $data['price_naira'] * 100];
        }
        $this->audit->record($this->actorId($request), 'menu.dish_updated', 'dish', (int) $dish['id'], $meta);
        return $this->index($request, $response);
    }

    /**
     * "Sold out today" and on/off-menu switches (kitchen staff may use these).
     *
     * @param array{id: string} $args
     */
    public function availability(Request $request, Response $response, array $args): Response
    {
        $dish = $this->dish((int) $args['id']);
        $data = Validator::validate(Json::body($request), ['sold_out_today' => 'nullable|bool', 'available' => 'nullable|bool']);
        if (array_key_exists('sold_out_today', $data) && $data['sold_out_today'] !== null) {
            $this->db->run('UPDATE dishes SET sold_out_until = ? WHERE id = ?', [$data['sold_out_today'] ? $this->clock->now()->format('Y-m-d') : null, $dish['id']]);
        }
        if (array_key_exists('available', $data) && $data['available'] !== null) {
            $this->db->run('UPDATE dishes SET is_available = ? WHERE id = ?', [$data['available'] ? 1 : 0, $dish['id']]);
        }
        $this->audit->record($this->actorId($request), 'menu.availability', 'dish', (int) $dish['id'], $data);
        return $this->index($request, $response);
    }

    /** @param array{id: string} $args */
    public function delete(Request $request, Response $response, array $args): Response
    {
        $dish = $this->dish((int) $args['id']);
        // Soft delete: past orders and reviews keep their link to the dish.
        $this->db->run('UPDATE dishes SET deleted_at = ?, is_available = 0, slug = ? WHERE id = ?', [
            $this->clock->sql(), substr($dish['slug'], 0, 80) . '-deleted-' . $dish['id'], $dish['id'],
        ]);
        $this->audit->record($this->actorId($request), 'menu.dish_deleted', 'dish', (int) $dish['id'], ['name' => $dish['name']]);
        return $this->index($request, $response);
    }

    /** @param array{id: string} $args */
    public function image(Request $request, Response $response, array $args): Response
    {
        $dish = $this->dish((int) $args['id']);
        $file = $request->getUploadedFiles()['image'] ?? null;
        if (!$file instanceof \Psr\Http\Message\UploadedFileInterface) {
            throw ValidationError::field('image', 'Choose a photo to upload.');
        }
        $alt = trim((string) ($request->getParsedBody()['alt'] ?? ''));
        $name = $this->uploads->storeDishImage($file, $dish['slug']);
        $this->db->run('UPDATE dishes SET image_path = ?, image_alt = ? WHERE id = ?', [$name, $alt !== '' ? mb_substr($alt, 0, 255) : $dish['name'], $dish['id']]);
        $this->uploads->delete($dish['image_path']);
        $this->audit->record($this->actorId($request), 'menu.image_uploaded', 'dish', (int) $dish['id'], ['file' => $name]);
        return $this->index($request, $response);
    }

    /** @param array{id: string} $args */
    public function removeImage(Request $request, Response $response, array $args): Response
    {
        $dish = $this->dish((int) $args['id']);
        $this->db->run('UPDATE dishes SET image_path = NULL WHERE id = ?', [$dish['id']]);
        $this->uploads->delete($dish['image_path']);
        $this->audit->record($this->actorId($request), 'menu.image_removed', 'dish', (int) $dish['id']);
        return $this->index($request, $response);
    }

    public function saveCategory(Request $request, Response $response, array $args = []): Response
    {
        $data = Validator::validate(Json::body($request), ['name' => 'required|string|max:60', 'sort_order' => 'nullable|int|min:0|max:999']);
        if (isset($args['id'])) {
            $this->db->one('SELECT id FROM categories WHERE id = ?', [(int) $args['id']]) ?? throw HttpError::notFound();
            $this->db->run('UPDATE categories SET name = ?, sort_order = COALESCE(?, sort_order) WHERE id = ?', [$data['name'], $data['sort_order'] ?? null, (int) $args['id']]);
        } else {
            $slug = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower($data['name'])), '-');
            if ($this->db->scalar('SELECT 1 FROM categories WHERE slug = ?', [$slug])) {
                throw ValidationError::field('name', 'A category with that name already exists.');
            }
            $this->db->insert('categories', ['slug' => $slug, 'name' => $data['name'], 'sort_order' => $data['sort_order'] ?? 99]);
        }
        $this->audit->record($this->actorId($request), 'menu.category_saved', 'category', $args['id'] ?? $data['name']);
        return $this->index($request, $response);
    }

    /** @param array{id: string} $args */
    public function saveKitchen(Request $request, Response $response, array $args): Response
    {
        $this->db->one('SELECT id FROM kitchens WHERE id = ?', [(int) $args['id']]) ?? throw HttpError::notFound();
        $data = Validator::validate(Json::body($request), [
            'name' => 'required|string|max:80',
            'tagline' => 'required|string|max:160',
            'description' => 'required|string|max:1000',
        ]);
        $this->db->run('UPDATE kitchens SET name = ?, tagline = ?, description = ? WHERE id = ?', [$data['name'], $data['tagline'], $data['description'], (int) $args['id']]);
        $this->audit->record($this->actorId($request), 'menu.kitchen_saved', 'kitchen', (int) $args['id']);
        return $this->index($request, $response);
    }

    /**
     * @param array<string, mixed> $body
     * @return array<string, mixed>
     */
    private function validateDish(array $body, bool $creating): array
    {
        $req = $creating ? 'required' : 'nullable';
        $data = Validator::validate($body, [
            'name' => "{$req}|string|min:2|max:120",
            'kitchen_id' => 'nullable|int|min:1',
            'category_id' => "{$req}|int|min:1",
            'short_description' => "{$req}|string|max:255",
            'description' => "{$req}|string|max:3000",
            'ingredients' => 'nullable|string|max:1000',
            'price_naira' => "{$req}|int|min:0|max:5000000",
            'spice_level' => 'nullable|int|min:0|max:3',
            'is_vegetarian' => 'nullable|bool',
            'is_gluten_free' => 'nullable|bool',
            'contains_nuts' => 'nullable|bool',
            'contains_pork' => 'nullable|bool',
            'is_alcoholic' => 'nullable|bool',
            'is_featured' => 'nullable|bool',
            'is_available' => 'nullable|bool',
            'sort_order' => 'nullable|int|min:0|max:9999',
        ], ['price_naira' => 'Price', 'category_id' => 'Category', 'kitchen_id' => 'Kitchen']);
        if (isset($data['category_id']) && !$this->db->scalar('SELECT 1 FROM categories WHERE id = ?', [$data['category_id']])) {
            throw ValidationError::field('category_id', 'Choose a category.');
        }
        if (isset($data['kitchen_id']) && !$this->db->scalar('SELECT 1 FROM kitchens WHERE id = ?', [$data['kitchen_id']])) {
            throw ValidationError::field('kitchen_id', 'Choose a kitchen.');
        }
        if (array_key_exists('allergens', $body)) {
            $list = is_array($body['allergens']) ? $body['allergens'] : [];
            $bad = array_diff($list, self::ALLERGENS);
            if ($bad) {
                throw ValidationError::field('allergens', 'Unknown allergen: ' . implode(', ', array_map('strval', $bad)));
            }
            $data['allergens'] = $list ? implode(',', array_values(array_unique($list))) : null;
        }
        if (array_key_exists('options', $body)) {
            $data['options'] = $this->validateOptions($body['options']);
        }
        return $data;
    }

    /** @return list<array<string, mixed>> */
    private function validateOptions(mixed $options): array
    {
        if (!is_array($options) || count($options) > 20) {
            throw ValidationError::field('options', 'Up to 20 portions and add-ons per dish.');
        }
        $out = [];
        foreach (array_values($options) as $i => $o) {
            $clean = Validator::validate(is_array($o) ? $o : [], [
                'group' => 'required|string|in:portion,addon',
                'name' => 'required|string|max:80',
                'price_delta_naira' => 'required|int|min:-1000000|max:1000000',
                'is_default' => 'nullable|bool',
            ], ['price_delta_naira' => 'Price change']);
            $out[] = $clean + ['sort_order' => $i];
        }
        $portions = array_filter($out, static fn ($o) => $o['group'] === 'portion');
        if ($portions && count(array_filter($portions, static fn ($o) => !empty($o['is_default']))) !== 1) {
            throw ValidationError::field('options', 'Mark exactly one portion as the default.');
        }
        return $out;
    }

    /** @param list<array<string, mixed>> $options */
    private function saveOptions(int $dishId, array $options): void
    {
        // Past orders keep a JSON snapshot of their options, so options can be replaced safely.
        $this->db->run('DELETE FROM dish_options WHERE dish_id = ?', [$dishId]);
        foreach ($options as $o) {
            $this->db->insert('dish_options', [
                'dish_id' => $dishId, 'option_group' => $o['group'], 'name' => $o['name'],
                'price_delta_kobo' => $o['price_delta_naira'] * 100, 'is_default' => !empty($o['is_default']) ? 1 : 0, 'sort_order' => $o['sort_order'],
            ]);
        }
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function columns(array $data): array
    {
        $map = [
            'name' => 'name', 'kitchen_id' => 'kitchen_id', 'category_id' => 'category_id', 'short_description' => 'short_description',
            'description' => 'description', 'ingredients' => 'ingredients', 'allergens' => 'allergens', 'spice_level' => 'spice_level', 'sort_order' => 'sort_order',
        ];
        $cols = [];
        foreach ($map as $key => $col) {
            if (array_key_exists($key, $data)) {
                $cols[$col] = $data[$key];
            }
        }
        foreach (['is_vegetarian', 'is_gluten_free', 'contains_nuts', 'contains_pork', 'is_alcoholic', 'is_featured', 'is_available'] as $flag) {
            if (array_key_exists($flag, $data) && $data[$flag] !== null) {
                $cols[$flag] = $data[$flag] ? 1 : 0;
            }
        }
        if (isset($data['price_naira'])) {
            $cols['price_kobo'] = $data['price_naira'] * 100;
        }
        foreach (['name', 'category_id', 'short_description', 'description'] as $required) {
            if (array_key_exists($required, $cols) && $cols[$required] === null) {
                unset($cols[$required]); // PATCH with an empty value: keep what's there
            }
        }
        return $cols;
    }

    private function uniqueSlug(string $name): string
    {
        $base = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT', $name) ?: $name)), '-') ?: 'dish';
        $slug = substr($base, 0, 90);
        for ($i = 2; $this->db->scalar('SELECT 1 FROM dishes WHERE slug = ?', [$slug]); $i++) {
            $slug = substr($base, 0, 90) . "-{$i}";
        }
        return $slug;
    }

    /** @return array<string, mixed> */
    private function dish(int $id): array
    {
        return $this->db->one('SELECT * FROM dishes WHERE id = ? AND deleted_at IS NULL', [$id]) ?? throw HttpError::notFound('We couldn’t find that dish.');
    }
}
