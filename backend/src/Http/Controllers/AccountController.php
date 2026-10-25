<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Audit\AuditLogger;
use App\Http\Json;
use App\Repositories\UserRepository;
use App\Security\PasswordPolicy;
use App\Services\AuthService;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class AccountController
{
    public function __construct(private UserRepository $users, private AuthService $auth, private AuditLogger $audit)
    {
    }

    public function updateProfile(Request $request, Response $response): Response
    {
        $user = Json::user($request);
        $data = Validator::validate(Json::body($request), [
            'first_name' => 'nullable|string|max:80',
            'last_name' => 'nullable|string|max:80',
            'phone' => 'nullable|phone',
            'birthday' => 'nullable|date',
            'favourite_kitchen_id' => 'nullable|int|in:1,2,3',
            'marketing_opt_in' => 'nullable|bool',
            'theme_preference' => 'nullable|string|in:dark,light,system',
        ]);
        // Names and opt-in can't be nulled; birthday can only be set once (it drives birthday rewards).
        foreach (['first_name', 'last_name', 'marketing_opt_in'] as $f) {
            if (array_key_exists($f, $data) && $data[$f] === null) {
                unset($data[$f]);
            }
        }
        if (array_key_exists('birthday', $data) && $user['birthday'] !== null) {
            unset($data['birthday']);
        }
        if (isset($data['marketing_opt_in'])) {
            $data['marketing_opt_in'] = $data['marketing_opt_in'] ? 1 : 0;
        }
        $this->users->update((int) $user['id'], $data);
        $this->audit->record((int) $user['id'], 'account.profile_updated', 'user', $user['id'], ['fields' => array_keys($data)]);
        return Json::send($response, ['user' => UserRepository::toPublic($this->users->find((int) $user['id']))]);
    }

    public function changePassword(Request $request, Response $response): Response
    {
        $data = Validator::validate(Json::body($request), [
            'current_password' => 'required|string|max:' . PasswordPolicy::MAX_LENGTH,
            'new_password' => 'required|string|max:' . PasswordPolicy::MAX_LENGTH,
        ], ['current_password' => 'Current password', 'new_password' => 'New password']);
        $this->auth->changePassword(Json::user($request), $data['current_password'], $data['new_password']);
        return Json::send($response, ['message' => 'Password updated. Other devices have been signed out.']);
    }

    public function twoFactorSetup(Request $request, Response $response): Response
    {
        return Json::send($response, $this->auth->beginTwoFactorSetup(Json::user($request)));
    }

    public function twoFactorConfirm(Request $request, Response $response): Response
    {
        $data = Validator::validate(Json::body($request), ['code' => 'required|string|max:10']);
        $this->auth->confirmTwoFactorSetup(Json::user($request), $data['code']);
        return Json::send($response, ['message' => 'Two-factor authentication is on.']);
    }

    public function twoFactorDisable(Request $request, Response $response): Response
    {
        $data = Validator::validate(Json::body($request), [
            'password' => 'required|string|max:' . PasswordPolicy::MAX_LENGTH,
            'code' => 'required|string|max:10',
        ]);
        $this->auth->disableTwoFactor(Json::user($request), $data['password'], $data['code']);
        return Json::send($response, ['message' => 'Two-factor authentication is off.']);
    }
}
