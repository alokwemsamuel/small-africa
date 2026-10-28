<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Json;
use App\Repositories\UserRepository;
use App\Security\Csrf;
use App\Security\PasswordPolicy;
use App\Services\AuthService;
use App\Social\SocialAuthService;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class AuthController
{
    public function __construct(private AuthService $auth, private Csrf $csrf, private SocialAuthService $social)
    {
    }

    /** The SPA calls this on load to get its CSRF token (and learn who is signed in). */
    public function csrf(Request $request, Response $response): Response
    {
        return Json::send($response, ['csrfToken' => $this->csrf->token()]);
    }

    public function me(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        return Json::send($response, ['user' => is_array($user) ? UserRepository::toPublic($user) : null]);
    }

    public function register(Request $request, Response $response): Response
    {
        $data = Validator::validate(Json::body($request), [
            'first_name' => 'required|string|max:80',
            'last_name' => 'required|string|max:80',
            'email' => 'required|email',
            'phone' => 'nullable|phone',
            'password' => 'required|string|max:' . PasswordPolicy::MAX_LENGTH,
            'referral_code' => 'nullable|string|max:20',
            'device_id' => 'nullable|string|max:64|regex:/^[A-Za-z0-9-]{16,64}$/',
            'marketing_opt_in' => 'nullable|bool',
            'accept_terms' => 'required|bool',
        ], ['first_name' => 'First name', 'last_name' => 'Last name', 'accept_terms' => 'Accepting the terms']);
        if ($data['accept_terms'] !== true) {
            throw \App\Http\ValidationError::field('accept_terms', 'Please accept the Terms and Privacy Policy to continue.');
        }
        $user = $this->auth->register($data, Json::ip($request));
        return Json::send($response, ['user' => $user, 'csrfToken' => $this->csrf->token()], 201);
    }

    /** The "almost there" step after a first sign-up with Google, Apple or Facebook. */
    public function welcome(Request $request, Response $response): Response
    {
        $data = Validator::validate(Json::body($request), [
            'email' => 'nullable|email',
            'phone' => 'required|phone',
            'birthday_day' => 'nullable|int|min:1|max:31',
            'birthday_month' => 'nullable|int|min:1|max:12',
            'referral_code' => 'nullable|string|max:20',
            'device_id' => 'nullable|string|max:64|regex:/^[A-Za-z0-9-]{16,64}$/',
            'accept_terms' => 'required|bool',
        ], ['accept_terms' => 'Accepting the terms']);
        $user = $this->social->completeWelcome(Json::user($request), $data, Json::ip($request));
        return Json::send($response, ['user' => $user, 'csrfToken' => $this->csrf->token()]);
    }

    public function login(Request $request, Response $response): Response
    {
        $data = Validator::validate(Json::body($request), [
            'email' => 'required|email',
            'password' => 'required|string|max:' . PasswordPolicy::MAX_LENGTH,
        ]);
        $result = $this->auth->login($data['email'], $data['password'], Json::ip($request));
        return Json::send($response, $result + ['csrfToken' => $this->csrf->token()]);
    }

    public function twoFactor(Request $request, Response $response): Response
    {
        $data = Validator::validate(Json::body($request), ['code' => 'required|string|max:10']);
        $user = $this->auth->completeTwoFactor($data['code'], Json::ip($request));
        return Json::send($response, ['user' => $user, 'csrfToken' => $this->csrf->token()]);
    }

    public function logout(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        $this->auth->logout(is_array($user) ? (int) $user['id'] : null);
        return Json::send($response, ['ok' => true]);
    }

    public function forgotPassword(Request $request, Response $response): Response
    {
        $data = Validator::validate(Json::body($request), ['email' => 'required|email']);
        $this->auth->requestPasswordReset($data['email'], Json::ip($request));
        return Json::send($response, ['message' => 'If an account exists for that email, we’ve sent a link to reset your password.']);
    }

    public function resetPassword(Request $request, Response $response): Response
    {
        $data = Validator::validate(Json::body($request), [
            'token' => 'required|string|max:100',
            'password' => 'required|string|max:' . PasswordPolicy::MAX_LENGTH,
        ]);
        $this->auth->resetPassword($data['token'], $data['password'], Json::ip($request));
        return Json::send($response, ['message' => 'Your password has been changed. You can now sign in.']);
    }

    public function verifyEmail(Request $request, Response $response): Response
    {
        $data = Validator::validate(Json::body($request), ['token' => 'required|string|max:100']);
        $this->auth->verifyEmail($data['token']);
        return Json::send($response, ['message' => 'Thank you, your email is confirmed.']);
    }

    public function resendVerification(Request $request, Response $response): Response
    {
        $this->auth->resendVerification(Json::user($request));
        return Json::send($response, ['message' => 'We’ve sent a new confirmation link.']);
    }
}
