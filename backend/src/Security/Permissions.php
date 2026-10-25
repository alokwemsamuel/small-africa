<?php

declare(strict_types=1);

namespace App\Security;

/**
 * Role-based access control for the admin panel, in one place. Every admin route names the
 * permission it needs and the server checks it on each request; the frontend only uses the
 * same list to decide which menu items to show.
 *
 * Grants are roles, or "staff:kitchen" / "staff:front_desk" for staff by position.
 */
final class Permissions
{
    private const MANAGERS = ['super_admin', 'manager'];

    /** @var array<string, list<string>> */
    public const MAP = [
        'dashboard.view' => ['super_admin', 'manager', 'staff:kitchen', 'staff:front_desk'],
        'orders.view' => ['super_admin', 'manager', 'staff:kitchen', 'staff:front_desk'],
        'orders.status' => ['super_admin', 'manager', 'staff:kitchen', 'staff:front_desk'],
        'orders.refund' => self::MANAGERS,
        'reservations.manage' => ['super_admin', 'manager', 'staff:front_desk'],
        'reservations.capacity' => self::MANAGERS,
        'menu.manage' => self::MANAGERS,
        'menu.availability' => ['super_admin', 'manager', 'staff:kitchen'],
        'customers.view' => ['super_admin', 'manager', 'staff:front_desk'],
        'customers.visits' => ['super_admin', 'manager', 'staff:front_desk'],
        'loyalty.manage' => self::MANAGERS,
        'loyalty.adjust' => ['super_admin'],
        'loyalty.interest' => ['super_admin'],
        'reviews.moderate' => self::MANAGERS,
        'coupons.manage' => self::MANAGERS,
        'enquiries.manage' => ['super_admin', 'manager', 'staff:front_desk'],
        'staff.manage' => ['super_admin'],
        'settings.manage' => self::MANAGERS,
        'audit.view' => self::MANAGERS,
    ];

    /** @param array<string, mixed>|null $user */
    public static function can(?array $user, string $permission): bool
    {
        if (!$user || !(bool) ($user['is_active'] ?? true)) {
            return false;
        }
        $grants = self::MAP[$permission] ?? [];
        $role = (string) $user['role'];
        return in_array($role, $grants, true)
            || ($role === 'staff' && in_array('staff:' . ($user['staff_position'] ?? ''), $grants, true));
    }

    /**
     * @param array<string, mixed>|null $user
     * @return list<string>
     */
    public static function for(?array $user): array
    {
        return array_values(array_filter(array_keys(self::MAP), static fn ($p) => self::can($user, $p)));
    }
}
