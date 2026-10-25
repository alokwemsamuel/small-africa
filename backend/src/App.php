<?php

declare(strict_types=1);

namespace App;

use App\Audit\AuditLogger;
use App\Http\Controllers\AccountController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\HealthController;
use App\Http\ErrorHandler;
use App\Http\Middleware\Cors;
use App\Http\Middleware\RequestContext;
use App\Http\Middleware\RequireRole;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\StartSession;
use App\Http\Middleware\VerifyCsrf;
use App\Mail\EmailTemplates;
use App\Mail\LogMailer;
use App\Mail\Mailer;
use App\Mail\SmtpMailer;
use App\Repositories\UserRepository;
use App\Security\Crypto;
use App\Security\Csrf;
use App\Security\NativeSession;
use App\Security\RateLimiter;
use App\Security\Session;
use App\Services\AuthService;
use App\Support\Clock;
use App\Support\Config;
use App\Support\Container;
use App\Support\Database;
use App\Support\Logger;
use Slim\App as SlimApp;
use Slim\Factory\AppFactory;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Routing\RouteCollectorProxy;

final class App
{
    public static function root(): string
    {
        return dirname(__DIR__);
    }

    /** Builds the service container. Tests override entries (Session, Mailer, Clock) before create(). */
    public static function container(Config $config): Container
    {
        $c = new Container();
        $root = self::root();
        $c->instance(Config::class, $config);
        $c->set(Clock::class, fn () => new Clock());
        $c->set(Logger::class, fn () => new Logger($root . '/storage/logs'));
        $c->set(Database::class, fn () => Database::connect($config));
        $c->set(Crypto::class, fn () => new Crypto($config->str('APP_KEY')));
        $c->set(Session::class, fn () => new NativeSession(
            $config->str('SESSION_NAME', 'sa_session'),
            $config->bool('SESSION_SECURE', $config->isProduction()),
            $config->int('SESSION_IDLE_MINUTES', 120) * 60,
            $root . '/storage/sessions',
        ));
        $c->set(Csrf::class, fn (Container $c) => new Csrf($c->get(Session::class)));
        $c->set(RateLimiter::class, fn (Container $c) => new RateLimiter($c->get(Database::class), $c->get(Clock::class)));
        $c->set(AuditLogger::class, fn (Container $c) => new AuditLogger($c->get(Database::class)));
        $c->set(Mailer::class, fn () => $config->str('MAIL_DRIVER', 'log') === 'smtp'
            ? new SmtpMailer($config)
            : new LogMailer($root . '/storage/mail'));
        $c->set(EmailTemplates::class, fn () => new EmailTemplates(rtrim($config->str('FRONTEND_URL'), '/')));
        $c->set(UserRepository::class, fn (Container $c) => new UserRepository($c->get(Database::class)));
        $c->set(AuthService::class, fn (Container $c) => new AuthService(
            $c->get(Database::class), $c->get(UserRepository::class), $c->get(Session::class), $c->get(Csrf::class),
            $c->get(RateLimiter::class), $c->get(Mailer::class), $c->get(EmailTemplates::class), $c->get(AuditLogger::class),
            $c->get(Crypto::class), $c->get(Clock::class), $c->get(Logger::class),
        ));
        $c->set(AuthController::class, fn (Container $c) => new AuthController($c->get(AuthService::class), $c->get(Csrf::class)));
        $c->set(AccountController::class, fn (Container $c) => new AccountController($c->get(UserRepository::class), $c->get(AuthService::class), $c->get(AuditLogger::class)));
        $c->set(HealthController::class, fn (Container $c) => new HealthController($c->get(Database::class), $c->get(Clock::class)));
        return $c;
    }

    public static function create(Container $c): SlimApp
    {
        /** @var Config $config */
        $config = $c->get(Config::class);
        AppFactory::setContainer($c);
        $app = AppFactory::create();
        $app->setBasePath(rtrim($config->str('APP_BASE_PATH', ''), '/'));

        $origins = $config->list('CORS_ALLOWED_ORIGINS');
        $responses = new ResponseFactory();

        // Slim runs middleware last-added-first: Cors and SecurityHeaders wrap everything,
        // including error responses.
        $app->add(new VerifyCsrf($c->get(Csrf::class), $origins, ['/api/payments/paystack/webhook']));
        $app->add(new StartSession($c->get(Session::class), $c->get(AuthService::class)));
        $app->add(new RequestContext($config->list('TRUSTED_PROXIES'), $c->get(AuditLogger::class)));
        $app->addBodyParsingMiddleware();
        $app->addRoutingMiddleware();
        $errors = $app->addErrorMiddleware(false, false, false);
        $errors->setDefaultErrorHandler(new ErrorHandler($responses, $c->get(Logger::class), $config->bool('APP_DEBUG')));
        $app->add(new SecurityHeaders($config->bool('APP_HTTPS', $config->isProduction())));
        $app->add(new Cors($origins, $responses));

        self::routes($app);
        return $app;
    }

    private static function routes(SlimApp $app): void
    {
        $app->group('/api', function (RouteCollectorProxy $api): void {
            $api->get('/health', HealthController::class);

            $api->group('/auth', function (RouteCollectorProxy $auth): void {
                $auth->get('/csrf', [AuthController::class, 'csrf']);
                $auth->get('/me', [AuthController::class, 'me']);
                $auth->post('/register', [AuthController::class, 'register']);
                $auth->post('/login', [AuthController::class, 'login']);
                $auth->post('/2fa', [AuthController::class, 'twoFactor']);
                $auth->post('/logout', [AuthController::class, 'logout']);
                $auth->post('/forgot-password', [AuthController::class, 'forgotPassword']);
                $auth->post('/reset-password', [AuthController::class, 'resetPassword']);
                $auth->post('/verify-email', [AuthController::class, 'verifyEmail']);
                $auth->post('/resend-verification', [AuthController::class, 'resendVerification'])->add(RequireRole::signedIn());
            });

            $api->group('/account', function (RouteCollectorProxy $account): void {
                $account->patch('/profile', [AccountController::class, 'updateProfile']);
                $account->post('/password', [AccountController::class, 'changePassword']);
                $account->post('/2fa/setup', [AccountController::class, 'twoFactorSetup'])->add(RequireRole::staff());
                $account->post('/2fa/confirm', [AccountController::class, 'twoFactorConfirm'])->add(RequireRole::staff());
                $account->post('/2fa/disable', [AccountController::class, 'twoFactorDisable'])->add(RequireRole::staff());
            })->add(RequireRole::signedIn());
        });
    }
}
