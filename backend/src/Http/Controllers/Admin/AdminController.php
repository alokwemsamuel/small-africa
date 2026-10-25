<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Json;
use Psr\Http\Message\ServerRequestInterface as Request;

/** Shared helpers for admin controllers: the acting user and simple paging. */
abstract class AdminController
{
    protected const PER_PAGE = 25;

    protected function actorId(Request $request): int
    {
        return (int) Json::user($request)['id'];
    }

    /** @return array{0: int, 1: int, 2: int} page, limit, offset */
    protected function page(Request $request): array
    {
        $page = max(1, (int) ($request->getQueryParams()['page'] ?? 1));
        return [$page, self::PER_PAGE, ($page - 1) * self::PER_PAGE];
    }

    /**
     * @param list<array<string, mixed>> $items
     * @return array{items: list<array<string, mixed>>, page: int, pages: int, total: int}
     */
    protected function paged(array $items, int $total, int $page): array
    {
        return ['items' => $items, 'page' => $page, 'pages' => max(1, (int) ceil($total / self::PER_PAGE)), 'total' => $total];
    }

    protected function query(Request $request, string $key): ?string
    {
        $v = $request->getQueryParams()[$key] ?? null;
        return is_string($v) && trim($v) !== '' ? trim($v) : null;
    }

    /** Escapes LIKE wildcards in user search text. */
    protected function like(string $q): string
    {
        return '%' . addcslashes($q, '%_\\') . '%';
    }
}
