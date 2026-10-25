<?php

declare(strict_types=1);

namespace App;

use App\Audit\AuditLogger;
use App\Http\Controllers\AccountController;
use App\Http\Controllers\AccountDataController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CheckoutController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\ReservationController;
use App\Payments\HttpClient;
use App\Payments\PaymentGateway;
use App\Payments\PaystackGateway;
use App\Payments\SimulatedGateway;
use App\Services\CouponService;
use App\Services\OrderService;
use App\Services\PricingService;
use App\Services\ReservationService;
use App\Support\Settings;
use App\Http\Controllers\EnquiryController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\PublicController;
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
use App\Repositories\MenuRepository;
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
        $c->set(Settings::class, fn (Container $c) => new Settings($c->get(Database::class)));
        $c->set(HttpClient::class, fn () => new HttpClient());
        $c->set(PaymentGateway::class, function (Container $c) use ($config): PaymentGateway {
            $driver = $config->str('PAYMENT_DRIVER', 'paystack');
            if ($driver === 'simulated') {
                if ($config->isProduction()) {
                    throw new \RuntimeException('PAYMENT_DRIVER=simulated is not allowed in production.');
                }
                return new SimulatedGateway($c->get(Database::class));
            }
            return new PaystackGateway($config->str('PAYSTACK_SECRET_KEY', ''), $c->get(HttpClient::class));
        });
        $c->set(CouponService::class, fn (Container $c) => new CouponService($c->get(Database::class)));
        $c->set(PricingService::class, fn (Container $c) => new PricingService(
            $c->get(Database::class), $c->get(Settings::class), $c->get(CouponService::class), $c->get(Clock::class),
        ));
        $frontend = rtrim($config->str('FRONTEND_URL'), '/');
        $c->set(OrderService::class, fn (Container $c) => new OrderService(
            $c->get(Database::class), $c->get(PricingService::class), $c->get(PaymentGateway::class), $c->get(RateLimiter::class),
            $c->get(Mailer::class), $c->get(EmailTemplates::class), $c->get(AuditLogger::class), $c->get(Clock::class),
            $c->get(Logger::class), $c->get(Crypto::class), $frontend,
        ));
        $c->set(ReservationService::class, fn (Container $c) => new ReservationService(
            $c->get(Database::class), $c->get(Settings::class), $c->get(RateLimiter::class), $c->get(Mailer::class),
            $c->get(EmailTemplates::class), $c->get(AuditLogger::class), $c->get(Crypto::class), $c->get(Clock::class),
            $c->get(Logger::class), $frontend,
        ));
        $c->set(CheckoutController::class, fn (Container $c) => new CheckoutController(
            $c->get(PricingService::class), $c->get(OrderService::class), $c->get(PaymentGateway::class),
            $c->get(RateLimiter::class), $c->get(Database::class), $c->get(Config::class),
        ));
        $c->set(OrderController::class, fn (Container $c) => new OrderController($c->get(OrderService::class), $c->get(Database::class), $c->get(Clock::class)));
        $c->set(ReservationController::class, fn (Container $c) => new ReservationController($c->get(ReservationService::class)));
        $c->set(AccountDataController::class, fn (Container $c) => new AccountDataController($c->get(Database::class), $c->get(RateLimiter::class), $c->get(AuditLogger::class)));
        $c->set(MenuRepository::class, fn (Container $c) => new MenuRepository($c->get(Database::class), $c->get(Clock::class)));
        $c->set(PublicController::class, fn (Container $c) => new PublicController($c->get(MenuRepository::class), $c->get(Database::class)));
        $c->set(EnquiryController::class, fn (Container $c) => new EnquiryController(
            $c->get(Database::class), $c->get(RateLimiter::class), $c->get(Mailer::class), $c->get(EmailTemplates::class),
            $c->get(Config::class), $c->get(Clock::class), $c->get(Logger::class),
        ));
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
            $api->get('/site', [PublicController::class, 'site']);
            $api->get('/menu', [PublicController::class, 'menu']);
            $api->get('/menu/{slug}', [PublicController::class, 'dish']);
            $api->post('/contact', [EnquiryController::class, 'contact']);
            $api->post('/newsletter', [EnquiryController::class, 'newsletter']);
            $api->post('/events/enquiries', [EnquiryController::class, 'eventEnquiry']);

            $api->post('/checkout/quote', [CheckoutController::class, 'quote']);
            $api->post('/orders', [CheckoutController::class, 'placeOrder']);
            $api->get('/orders/{reference}', [OrderController::class, 'track']);
            $api->post('/payments/verify', [CheckoutController::class, 'verifyPayment']);
            $api->post('/payments/paystack/webhook', [CheckoutController::class, 'webhook']);
            $api->post('/payments/simulate', [CheckoutController::class, 'simulate']);

            $api->get('/reservations/availability', [ReservationController::class, 'availability']);
            $api->post('/reservations', [ReservationController::class, 'create']);
            $api->get('/reservations/{code}', [ReservationController::class, 'show']);
            $api->post('/reservations/{code}/cancel', [ReservationController::class, 'cancel']);

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
                $account->get('/orders', [OrderController::class, 'mine']);
                $account->post('/orders/{reference}/reorder', [OrderController::class, 'reorder']);
                $account->get('/reservations', [ReservationController::class, 'mine']);
                $account->get('/addresses', [AccountDataController::class, 'addresses']);
                $account->post('/addresses', [AccountDataController::class, 'saveAddress']);
                $account->patch('/addresses/{id:[0-9]+}', [AccountDataController::class, 'saveAddress']);
                $account->delete('/addresses/{id:[0-9]+}', [AccountDataController::class, 'deleteAddress']);
                $account->get('/reviews', [AccountDataController::class, 'reviews']);
                $account->post('/reviews', [AccountDataController::class, 'createReview']);
                $account->post('/2fa/setup', [AccountController::class, 'twoFactorSetup'])->add(RequireRole::staff());
                $account->post('/2fa/confirm', [AccountController::class, 'twoFactorConfirm'])->add(RequireRole::staff());
                $account->post('/2fa/disable', [AccountController::class, 'twoFactorDisable'])->add(RequireRole::staff());
            })->add(RequireRole::signedIn());
        });
    }
}
