<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Json;
use App\Security\PasswordPolicy;
use App\Social\ProviderRegistry;
use App\Social\SocialAuthService;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** "Connected accounts" on the account page, and setting a first password for provider-only customers. */
final class IdentitiesController
{
    public function __construct(private SocialAuthService $social, private ProviderRegistry $providers)
    {
    }

    public function index(Request $request, Response $response): Response
    {
        return Json::send($response, $this->social->connections(Json::user($request)) + ['available' => $this->providers->enabled()]);
    }

    /** @param array{provider: string} $args */
    public function disconnect(Request $request, Response $response, array $args): Response
    {
        $this->social->disconnect(Json::user($request), $args['provider']);
        return Json::send($response, ['ok' => true]);
    }

    public function setPassword(Request $request, Response $response): Response
    {
        $data = Validator::validate(Json::body($request), [
            'new_password' => 'required|string|max:' . PasswordPolicy::MAX_LENGTH,
        ], ['new_password' => 'New password']);
        $this->social->setPassword(Json::user($request), $data['new_password']);
        return Json::send($response, ['message' => 'Your password is set. You can now sign in with your email and password too.']);
    }
}
