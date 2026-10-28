<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\HttpError;
use App\Http\Json;
use App\Repositories\UserRepository;
use App\Security\Crypto;
use App\Security\RateLimiter;
use App\Services\AuthService;
use App\Social\OAuthCookie;
use App\Social\ProviderRegistry;
use App\Social\SocialAuthService;
use App\Social\SocialError;
use App\Support\Config;
use App\Support\Logger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Sign in with Google, Apple or Facebook. Both routes are plain browser navigations (redirects),
 * not API calls from the single-page app:
 *
 *   start    → makes `state`, `nonce` and a PKCE verifier, seals them in the sa_oauth cookie, and
 *              redirects to the provider;
 *   callback → checks the cookie and the `state`, has the provider class exchange the code on the
 *              server and verify the result, signs the customer in with the usual session cookie
 *              (session id rotated), and redirects back into the site. Problems become
 *              `?error=social_…` on the page they are sent back to.
 *
 * Apple's callback is a cross-site POST, so it can't carry the CSRF header: it is exempt from the
 * CSRF check (see App.php) and protected by the sealed state instead.
 */
final class OAuthController
{
    public function __construct(
        private ProviderRegistry $providers,
        private SocialAuthService $social,
        private OAuthCookie $cookie,
        private UserRepository $users,
        private RateLimiter $limiter,
        private Config $config,
        private Logger $logger,
    ) {
    }

    /** Which providers have keys, so the frontend only shows buttons that can work. */
    public function providers(Request $request, Response $response): Response
    {
        return Json::send($response, ['providers' => $this->providers->enabled()]);
    }

    /** @param array{provider: string} $args */
    public function start(Request $request, Response $response, array $args): Response
    {
        $mode = $this->mode($request->getQueryParams()['mode'] ?? null);
        $cookiePath = $this->cookiePath($request);
        try {
            $this->limiter->hit('oauth:start:' . Json::ip($request), 30, 600);
            $provider = $this->providers->get($args['provider']);

            $linkUserId = null;
            if ($mode === 'link') {
                $user = $request->getAttribute('user');
                if (!is_array($user)) {
                    throw new SocialError(SocialError::EXPIRED);
                }
                $linkUserId = (int) $user['id'];
            }

            $state = Crypto::token(24);
            $nonce = Crypto::token(24);
            $begin = $provider->start($this->redirectUri($provider->name()), $state, $nonce);
            $sealed = $this->cookie->seal([
                'p' => $provider->name(),
                's' => $state,
                'n' => $nonce,
                'v' => $begin['pkceVerifier'],
                'm' => $mode,
                'r' => $this->safePath($request->getQueryParams()['return'] ?? null),
                'ref' => $this->referralCode($request->getQueryParams()['ref'] ?? null),
                'u' => $linkUserId,
            ]);
            return $this->redirect($response, $begin['url'], $this->cookie->header($sealed, $cookiePath));
        } catch (SocialError $e) {
            return $this->fail($response, $mode, $e->reason, $cookiePath, $e);
        } catch (HttpError $e) {
            // Too many tries from one address.
            return $this->fail($response, $mode, SocialError::FAILED, $cookiePath, $e);
        }
    }

    /** @param array{provider: string} $args */
    public function callback(Request $request, Response $response, array $args): Response
    {
        $cookiePath = $this->cookiePath($request);
        $params = $request->getMethod() === 'POST' && is_array($request->getParsedBody())
            ? $request->getParsedBody()
            : $request->getQueryParams();
        $sealed = $request->getCookieParams()[OAuthCookie::NAME] ?? null;
        $attempt = $this->cookie->open(is_string($sealed) ? $sealed : null);
        $mode = $this->mode($attempt['m'] ?? null);

        try {
            $this->limiter->hit('oauth:callback:' . Json::ip($request), 30, 600);
            // The cookie is what ties this answer to the sign-in the same browser started.
            if ($attempt === null) {
                throw new SocialError(SocialError::EXPIRED);
            }
            $state = (string) ($params['state'] ?? '');
            if ($attempt['p'] !== $args['provider'] || $state === '' || !hash_equals((string) $attempt['s'], $state)) {
                throw new SocialError(SocialError::FAILED, 'State does not match: the answer is not from the sign-in this browser started.');
            }
            if (isset($params['error'])) {
                // The person said no (or the provider refused): not an error worth logging.
                throw new SocialError(SocialError::CANCELLED);
            }
            $code = (string) ($params['code'] ?? '');
            if ($code === '') {
                throw new SocialError(SocialError::FAILED, 'The provider sent no code.');
            }

            $provider = $this->providers->get($args['provider']);
            $identity = $provider->finish($this->redirectUri($provider->name()), $code, $attempt['v'] ?? null, (string) $attempt['n'], $params);

            if ($mode === 'link') {
                $current = $request->getAttribute('user');
                if (!is_array($current) || (int) $current['id'] !== (int) ($attempt['u'] ?? 0)) {
                    throw new SocialError(SocialError::EXPIRED);
                }
                $this->social->link($current, $identity);
                return $this->redirect($response, $this->frontend('/account?tab=settings&connected=' . $provider->name()), $this->cookie->header(null, $cookiePath));
            }

            $result = $this->social->signIn($identity);
            $user = $result['user'];
            $needsWelcome = ($user['signup_provider'] ?? null) !== null && $user['onboarded_at'] === null;
            $to = $needsWelcome
                ? '/welcome' . (!empty($attempt['ref']) ? '?ref=' . rawurlencode((string) $attempt['ref']) : '')
                : ($attempt['r'] ?? '/account');
            return $this->redirect($response, $this->frontend($to), $this->cookie->header(null, $cookiePath));
        } catch (SocialError $e) {
            return $this->fail($response, $mode, $e->reason, $cookiePath, $e);
        } catch (HttpError $e) {
            return $this->fail($response, $mode, SocialError::FAILED, $cookiePath, $e);
        }
    }

    private function fail(Response $response, string $mode, string $reason, string $cookiePath, \Throwable $cause): Response
    {
        if (!in_array($reason, [SocialError::CANCELLED, SocialError::DISABLED], true)) {
            $this->logger->warning('Social sign-in did not complete', ['reason' => $reason, 'detail' => $cause->getMessage()]);
        }
        $url = $mode === 'link'
            ? $this->frontend('/account?tab=settings&error=social_' . $reason)
            : $this->frontend('/login?error=social_' . $reason);
        return $this->redirect($response, $url, $this->cookie->header(null, $cookiePath));
    }

    private function redirect(Response $response, string $url, string $setCookie): Response
    {
        return $response->withStatus(302)->withHeader('Location', $url)->withHeader('Set-Cookie', $setCookie);
    }

    private function frontend(string $path): string
    {
        return rtrim($this->config->str('FRONTEND_URL'), '/') . $path;
    }

    /** The address registered with each provider as the redirect (callback) URL. */
    private function redirectUri(string $provider): string
    {
        $base = $this->config->str('OAUTH_REDIRECT_BASE', '') ?: rtrim($this->config->str('FRONTEND_URL'), '/') . '/api';
        return rtrim($base, '/') . "/auth/oauth/{$provider}/callback";
    }

    /** The sign-in cookie is only sent to these routes: its path is this URL without the provider and action. */
    private function cookiePath(Request $request): string
    {
        return preg_replace('#/[a-z]+/(?:start|callback)$#', '', $request->getUri()->getPath()) ?: '/';
    }

    private function mode(mixed $value): string
    {
        return in_array($value, ['sign-in', 'sign-up', 'link'], true) ? $value : 'sign-in';
    }

    /** Only a path on this site, so the redirect after sign-in can't be turned into an open redirect. */
    private function safePath(mixed $value): ?string
    {
        return is_string($value) && strlen($value) <= 200 && preg_match('#^/(?!/)[A-Za-z0-9/_\-.?=&%]*$#', $value) === 1 ? $value : null;
    }

    private function referralCode(mixed $value): ?string
    {
        return is_string($value) && preg_match('/^[A-Za-z0-9]{1,20}$/', $value) === 1 ? strtoupper($value) : null;
    }
}
