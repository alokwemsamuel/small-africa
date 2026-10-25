<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Audit\AuditLogger;
use App\Http\HttpError;
use App\Http\Json;
use App\Http\ValidationError;
use App\Repositories\UserRepository;
use App\Security\Crypto;
use App\Security\PasswordPolicy;
use App\Services\AuthService;
use App\Support\Database;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** Staff & roles (Super Admin only). */
final class StaffController extends AdminController
{
    private const ROLE_LABELS = ['super_admin' => 'Super Admin', 'manager' => 'Manager', 'staff' => 'Staff'];

    public function __construct(private Database $db, private UserRepository $users, private AuthService $auth, private AuditLogger $audit)
    {
    }

    public function index(Request $request, Response $response): Response
    {
        return Json::send($response, ['staff' => array_map(static fn ($u) => [
            'id' => (int) $u['id'],
            'name' => "{$u['first_name']} {$u['last_name']}",
            'email' => $u['email'],
            'phone' => $u['phone'],
            'role' => $u['role'],
            'staffPosition' => $u['staff_position'],
            'isActive' => (bool) $u['is_active'],
            'twoFactorEnabled' => $u['totp_enabled_at'] !== null,
            'lastLoginAt' => $u['last_login_at'],
            'lockedUntil' => $u['locked_until'],
        ], $this->db->all("SELECT * FROM users WHERE role IN ('super_admin', 'manager', 'staff') ORDER BY FIELD(role, 'super_admin', 'manager', 'staff'), first_name"))]);
    }

    /** Creates a staff account and emails a link to choose a password. */
    public function create(Request $request, Response $response): Response
    {
        $data = Validator::validate(Json::body($request), [
            'first_name' => 'required|string|max:80',
            'last_name' => 'required|string|max:80',
            'email' => 'required|email',
            'phone' => 'nullable|phone',
            'role' => 'required|string|in:super_admin,manager,staff',
            'staff_position' => 'nullable|string|in:kitchen,front_desk',
        ], ['first_name' => 'First name', 'last_name' => 'Last name']);
        $this->checkPosition($data['role'], $data['staff_position'] ?? null);
        if ($this->users->findByEmail($data['email'])) {
            throw ValidationError::field('email', 'Someone already has an account with this email. Change their role instead.');
        }
        $id = $this->users->create([
            'role' => $data['role'],
            'staff_position' => $data['role'] === 'staff' ? $data['staff_position'] : null,
            'first_name' => $data['first_name'],
            'last_name' => $data['last_name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            // Unknown random password until they choose their own from the invitation.
            'password_hash' => PasswordPolicy::hash(Crypto::token(32)),
        ]);
        $actor = Json::user($request);
        $this->auth->inviteStaff($id, $actor['first_name'], self::ROLE_LABELS[$data['role']]);
        $this->audit->record((int) $actor['id'], 'staff.created', 'user', $id, ['role' => $data['role'], 'position' => $data['staff_position'] ?? null]);
        return $this->index($request, $response)->withStatus(201);
    }

    /**
     * Role, position and active/suspended. Suspending or changing role signs the person out everywhere.
     *
     * @param array{id: string} $args
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        $actor = Json::user($request);
        $target = $this->db->one("SELECT * FROM users WHERE id = ? AND role IN ('super_admin', 'manager', 'staff')", [(int) $args['id']]) ?? throw HttpError::notFound();
        $data = Validator::validate(Json::body($request), [
            'role' => 'nullable|string|in:super_admin,manager,staff,customer',
            'staff_position' => 'nullable|string|in:kitchen,front_desk',
            'is_active' => 'nullable|bool',
        ]);
        $role = $data['role'] ?? $target['role'];
        $position = array_key_exists('staff_position', $data) ? $data['staff_position'] : $target['staff_position'];
        $active = $data['is_active'] ?? (bool) $target['is_active'];
        if ((int) $target['id'] === (int) $actor['id'] && ($role !== $target['role'] || !$active)) {
            throw HttpError::conflict('You can’t change your own role or suspend yourself. Ask another Super Admin.');
        }
        if ($target['role'] === 'super_admin' && ($role !== 'super_admin' || !$active)) {
            $others = (int) $this->db->scalar("SELECT COUNT(*) FROM users WHERE role = 'super_admin' AND is_active = 1 AND id <> ?", [$target['id']]);
            if ($others === 0) {
                throw HttpError::conflict('There must always be at least one active Super Admin.');
            }
        }
        if ($role !== 'customer') {
            $this->checkPosition($role, $position);
        }
        $signOut = $role !== $target['role'] || !$active;
        $this->db->run(
            'UPDATE users SET role = ?, staff_position = ?, is_active = ?, session_version = session_version + ? WHERE id = ?',
            [$role, $role === 'staff' ? $position : null, $active ? 1 : 0, $signOut ? 1 : 0, $target['id']],
        );
        if ($role === 'customer') {
            $this->db->run('INSERT IGNORE INTO loyalty_accounts (user_id) VALUES (?)', [$target['id']]);
        }
        $this->audit->record((int) $actor['id'], 'staff.updated', 'user', (int) $target['id'], [
            'from' => ['role' => $target['role'], 'position' => $target['staff_position'], 'active' => (bool) $target['is_active']],
            'to' => ['role' => $role, 'position' => $role === 'staff' ? $position : null, 'active' => $active],
        ]);
        return $this->index($request, $response);
    }

    /**
     * Clears a lost authenticator so the person can set up two-factor sign-in again.
     *
     * @param array{id: string} $args
     */
    public function resetTwoFactor(Request $request, Response $response, array $args): Response
    {
        $target = $this->db->one("SELECT * FROM users WHERE id = ? AND role IN ('super_admin', 'manager', 'staff')", [(int) $args['id']]) ?? throw HttpError::notFound();
        $this->db->run('UPDATE users SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_last_used_step = NULL, session_version = session_version + 1 WHERE id = ?', [$target['id']]);
        $this->audit->record($this->actorId($request), 'staff.2fa_reset', 'user', (int) $target['id']);
        return $this->index($request, $response);
    }

    /** @param array{id: string} $args */
    public function resendInvite(Request $request, Response $response, array $args): Response
    {
        $actor = Json::user($request);
        $target = $this->db->one("SELECT * FROM users WHERE id = ? AND role IN ('super_admin', 'manager', 'staff') AND is_active = 1", [(int) $args['id']]) ?? throw HttpError::notFound();
        $this->auth->inviteStaff((int) $target['id'], $actor['first_name'], self::ROLE_LABELS[$target['role']]);
        $this->audit->record((int) $actor['id'], 'staff.invite_sent', 'user', (int) $target['id']);
        return Json::send($response, ['ok' => true]);
    }

    private function checkPosition(string $role, ?string $position): void
    {
        if ($role === 'staff' && !in_array($position, ['kitchen', 'front_desk'], true)) {
            throw ValidationError::field('staff_position', 'Choose kitchen or front desk.');
        }
    }
}
