<?php

declare(strict_types=1);

namespace App;

use App\Audit\AuditLogger;
use App\Http\Controllers\AccountController;
use App\Http\Controllers\AccountDataController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CheckoutController;
use App\Http\Controllers\Admin\AuditController;
use App\Http\Controllers\Admin\ContentController;
use App\Http\Controllers\Admin\CustomersController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\LoyaltyAdminController;
use App\Http\Controllers\Admin\MenuController as AdminMenuController;
use App\Http\Controllers\Admin\OrdersController as AdminOrdersController;
use App\Http\Controllers\Admin\ReservationsController as AdminReservationsController;
use App\Http\Controllers\Admin\SettingsController;
use App\Http\Controllers\Admin\StaffController;
use App\Http\Controllers\LoyaltyController;
use App\Http\Controllers\MediaController;
use App\Http\Middleware\RequirePermission;
use App\Media\ImageUploads;
use App\Loyalty\InterestService;
use App\Loyalty\Ledger;
use App\Loyalty\LoyaltyJobs;
use App\Loyalty\LoyaltyService;
use App\Loyalty\Notifier;
use App\Loyalty\WalletService;
use App\Payments\PaymentAttempts;
use App\Payments\WebhookHandler;
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
        $c->set(PaymentAttempts::class, fn (Container $c) => new PaymentAttempts($c->get(Database::class), $c->get(PaymentGateway::class), $c->get(Logger::class)));
        $c->set(Ledger::class, fn (Container $c) => new Ledger($c->get(Database::class), $c->get(Clock::class)));
        $c->set(Notifier::class, fn (Container $c) => new Notifier(
            $c->get(Database::class), $c->get(Mailer::class), $c->get(EmailTemplates::class), $c->get(Logger::class), $c->get(Clock::class), $frontend,
        ));
        $c->set(LoyaltyService::class, fn (Container $c) => new LoyaltyService(
            $c->get(Database::class), $c->get(Settings::class), $c->get(Ledger::class), $c->get(Notifier::class), $c->get(AuditLogger::class),
            $c->get(RateLimiter::class), $c->get(Clock::class), $c->get(Logger::class), $frontend,
        ));
        $c->set(WalletService::class, fn (Container $c) => new WalletService(
            $c->get(Database::class), $c->get(Settings::class), $c->get(Ledger::class), $c->get(PaymentAttempts::class), $c->get(Notifier::class),
            $c->get(RateLimiter::class), $c->get(AuditLogger::class), $c->get(Clock::class), $frontend,
        ));
        $c->set(InterestService::class, fn (Container $c) => new InterestService(
            $c->get(Database::class), $c->get(Settings::class), $c->get(Ledger::class), $c->get(Notifier::class), $c->get(AuditLogger::class),
            $c->get(Clock::class), $c->get(Logger::class),
        ));
        $c->set(OrderService::class, fn (Container $c) => new OrderService(
            $c->get(Database::class), $c->get(PricingService::class), $c->get(PaymentAttempts::class), $c->get(Ledger::class),
            $c->get(LoyaltyService::class), $c->get(RateLimiter::class), $c->get(Mailer::class), $c->get(EmailTemplates::class),
            $c->get(AuditLogger::class), $c->get(Clock::class), $c->get(Logger::class), $c->get(Crypto::class), $frontend,
        ));
        $c->set(WebhookHandler::class, fn (Container $c) => new WebhookHandler(
            $c->get(Database::class), $c->get(PaymentGateway::class), $c->get(PaymentAttempts::class), $c->get(OrderService::class),
            $c->get(WalletService::class), $c->get(Clock::class), $c->get(Logger::class),
        ));
        $c->set(LoyaltyJobs::class, fn (Container $c) => new LoyaltyJobs(
            $c->get(Database::class), $c->get(LoyaltyService::class), $c->get(InterestService::class), $c->get(OrderService::class),
            $c->get(Ledger::class), $c->get(Notifier::class), $c->get(Clock::class), $c->get(Logger::class), $frontend,
        ));
        $c->set(LoyaltyController::class, fn (Container $c) => new LoyaltyController($c->get(LoyaltyService::class), $c->get(WalletService::class), $c->get(Database::class)));
        $c->set(ImageUploads::class, fn () => new ImageUploads($root . '/storage/uploads'));
        $c->set(MediaController::class, fn (Container $c) => new MediaController($c->get(ImageUploads::class)));
        $c->set(DashboardController::class, fn (Container $c) => new DashboardController($c->get(Database::class), $c->get(Clock::class), $c->get(Config::class)));
        $c->set(AdminOrdersController::class, fn (Container $c) => new AdminOrdersController($c->get(Database::class), $c->get(OrderService::class), $c->get(AuditLogger::class)));
        $c->set(AdminReservationsController::class, fn (Container $c) => new AdminReservationsController(
            $c->get(Database::class), $c->get(ReservationService::class), $c->get(AuditLogger::class), $c->get(Clock::class),
        ));
        $c->set(AdminMenuController::class, fn (Container $c) => new AdminMenuController($c->get(Database::class), $c->get(ImageUploads::class), $c->get(AuditLogger::class), $c->get(Clock::class)));
        $c->set(CustomersController::class, fn (Container $c) => new CustomersController($c->get(Database::class), $c->get(LoyaltyService::class)));
        $c->set(LoyaltyAdminController::class, fn (Container $c) => new LoyaltyAdminController(
            $c->get(Database::class), $c->get(Settings::class), $c->get(InterestService::class), $c->get(AuditLogger::class), $c->get(Clock::class), $c->get(Config::class),
        ));
        $c->set(SettingsController::class, fn (Container $c) => new SettingsController($c->get(Database::class), $c->get(Settings::class), $c->get(AuditLogger::class)));
        $c->set(ContentController::class, fn (Container $c) => new ContentController($c->get(Database::class), $c->get(AuditLogger::class), $c->get(Clock::class)));
        $c->set(StaffController::class, fn (Container $c) => new StaffController($c->get(Database::class), $c->get(UserRepository::class), $c->get(AuthService::class), $c->get(AuditLogger::class)));
        $c->set(AuditController::class, fn (Container $c) => new AuditController($c->get(Database::class)));
        $c->set(ReservationService::class, fn (Container $c) => new ReservationService(
            $c->get(Database::class), $c->get(Settings::class), $c->get(RateLimiter::class), $c->get(Mailer::class),
            $c->get(EmailTemplates::class), $c->get(AuditLogger::class), $c->get(Crypto::class), $c->get(Clock::class),
            $c->get(Logger::class), $frontend,
        ));
        $c->set(CheckoutController::class, fn (Container $c) => new CheckoutController(
            $c->get(PricingService::class), $c->get(OrderService::class), $c->get(PaymentGateway::class),
            $c->get(RateLimiter::class), $c->get(Database::class), $c->get(Config::class), $c->get(PaymentAttempts::class),
            $c->get(WebhookHandler::class), $c->get(WalletService::class),
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
            $api->get('/rewards', [LoyaltyController::class, 'catalog']);
            $api->get('/media/dishes/{file:[a-z0-9-]+\.webp}', [MediaController::class, 'dish']);

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

            // Admin panel: every route checks its own permission on the server (see Permissions::MAP).
            $api->group('/admin', function (RouteCollectorProxy $a): void {
                $p = static fn (string $permission) => new RequirePermission($permission);
                $a->get('/me', [DashboardController::class, 'me']);
                $a->get('/dashboard', [DashboardController::class, 'show'])->add($p('dashboard.view'));

                $a->get('/orders', [AdminOrdersController::class, 'index'])->add($p('orders.view'));
                $a->get('/orders/{reference}', [AdminOrdersController::class, 'show'])->add($p('orders.view'));
                $a->post('/orders/{reference}/status', [AdminOrdersController::class, 'updateStatus'])->add($p('orders.status'));
                $a->post('/orders/{reference}/refund-flag', [AdminOrdersController::class, 'refundFlag'])->add($p('orders.refund'));

                $a->get('/reservations', [AdminReservationsController::class, 'index'])->add($p('reservations.manage'));
                $a->patch('/reservations/{code}', [AdminReservationsController::class, 'update'])->add($p('reservations.manage'));
                $a->get('/capacity', [AdminReservationsController::class, 'capacity'])->add($p('reservations.manage'));
                $a->put('/capacity', [AdminReservationsController::class, 'setCapacity'])->add($p('reservations.capacity'));
                $a->delete('/capacity/{id:[0-9]+}', [AdminReservationsController::class, 'clearCapacity'])->add($p('reservations.capacity'));

                $a->get('/menu', [AdminMenuController::class, 'index'])->add($p('menu.availability'));
                $a->post('/dishes', [AdminMenuController::class, 'create'])->add($p('menu.manage'));
                $a->patch('/dishes/{id:[0-9]+}', [AdminMenuController::class, 'update'])->add($p('menu.manage'));
                $a->delete('/dishes/{id:[0-9]+}', [AdminMenuController::class, 'delete'])->add($p('menu.manage'));
                $a->post('/dishes/{id:[0-9]+}/availability', [AdminMenuController::class, 'availability'])->add($p('menu.availability'));
                $a->post('/dishes/{id:[0-9]+}/image', [AdminMenuController::class, 'image'])->add($p('menu.manage'));
                $a->delete('/dishes/{id:[0-9]+}/image', [AdminMenuController::class, 'removeImage'])->add($p('menu.manage'));
                $a->post('/categories', [AdminMenuController::class, 'saveCategory'])->add($p('menu.manage'));
                $a->patch('/categories/{id:[0-9]+}', [AdminMenuController::class, 'saveCategory'])->add($p('menu.manage'));
                $a->patch('/kitchens/{id:[0-9]+}', [AdminMenuController::class, 'saveKitchen'])->add($p('menu.manage'));

                $a->get('/customers', [CustomersController::class, 'index'])->add($p('customers.view'));
                $a->get('/customers/{id:[0-9]+}', [CustomersController::class, 'show'])->add($p('customers.view'));
                $a->get('/customers/{id:[0-9]+}/history', [CustomersController::class, 'history'])->add($p('customers.view'));
                $a->post('/customers/{id:[0-9]+}/visits', [CustomersController::class, 'recordVisit'])->add($p('customers.visits'));
                $a->post('/customers/{id:[0-9]+}/adjust', [CustomersController::class, 'adjust'])->add($p('loyalty.adjust'));

                $a->get('/loyalty/settings', [LoyaltyAdminController::class, 'settings'])->add($p('loyalty.manage'));
                $a->put('/loyalty/settings', [LoyaltyAdminController::class, 'saveSettings'])->add($p('loyalty.manage'));
                $a->post('/loyalty/rewards', [LoyaltyAdminController::class, 'saveReward'])->add($p('loyalty.manage'));
                $a->patch('/loyalty/rewards/{id:[0-9]+}', [LoyaltyAdminController::class, 'saveReward'])->add($p('loyalty.manage'));
                $a->get('/loyalty/analytics', [LoyaltyAdminController::class, 'analytics'])->add($p('loyalty.manage'));
                $a->get('/loyalty/ledger', [LoyaltyAdminController::class, 'ledger'])->add($p('loyalty.manage'));
                $a->post('/loyalty/interest-runs', [LoyaltyAdminController::class, 'runInterest'])->add($p('loyalty.interest'));
                $a->post('/loyalty/interest-runs/simulate', [LoyaltyAdminController::class, 'simulateInterest'])->add($p('loyalty.interest'));

                $a->get('/reviews', [ContentController::class, 'reviews'])->add($p('reviews.moderate'));
                $a->patch('/reviews/{id:[0-9]+}', [ContentController::class, 'moderateReview'])->add($p('reviews.moderate'));
                $a->get('/coupons', [ContentController::class, 'coupons'])->add($p('coupons.manage'));
                $a->post('/coupons', [ContentController::class, 'saveCoupon'])->add($p('coupons.manage'));
                $a->patch('/coupons/{id:[0-9]+}', [ContentController::class, 'saveCoupon'])->add($p('coupons.manage'));
                $a->post('/coupons/{id:[0-9]+}/expire', [ContentController::class, 'expireCoupon'])->add($p('coupons.manage'));
                $a->get('/enquiries', [ContentController::class, 'enquiries'])->add($p('enquiries.manage'));
                $a->patch('/enquiries/{id:[0-9]+}', [ContentController::class, 'updateEnquiry'])->add($p('enquiries.manage'));
                $a->get('/messages', [ContentController::class, 'messages'])->add($p('enquiries.manage'));
                $a->patch('/messages/{id:[0-9]+}', [ContentController::class, 'updateMessage'])->add($p('enquiries.manage'));

                $a->get('/staff', [StaffController::class, 'index'])->add($p('staff.manage'));
                $a->post('/staff', [StaffController::class, 'create'])->add($p('staff.manage'));
                $a->patch('/staff/{id:[0-9]+}', [StaffController::class, 'update'])->add($p('staff.manage'));
                $a->post('/staff/{id:[0-9]+}/reset-2fa', [StaffController::class, 'resetTwoFactor'])->add($p('staff.manage'));
                $a->post('/staff/{id:[0-9]+}/invite', [StaffController::class, 'resendInvite'])->add($p('staff.manage'));

                $a->get('/settings', [SettingsController::class, 'index'])->add($p('settings.manage'));
                $a->put('/settings/hours', [SettingsController::class, 'saveHours'])->add($p('settings.manage'));
                $a->post('/settings/zones', [SettingsController::class, 'saveZone'])->add($p('settings.manage'));
                $a->patch('/settings/zones/{id:[0-9]+}', [SettingsController::class, 'saveZone'])->add($p('settings.manage'));
                $a->patch('/settings/seating/{id:[0-9]+}', [SettingsController::class, 'saveSeating'])->add($p('settings.manage'));
                $a->put('/settings/{group:restaurant|pricing|ordering|reservations}', [SettingsController::class, 'saveGroup'])->add($p('settings.manage'));

                $a->get('/audit', [AuditController::class, 'index'])->add($p('audit.view'));
            })->add(RequireRole::staff());

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
                $account->get('/loyalty', [LoyaltyController::class, 'summary']);
                $account->get('/loyalty/history', [LoyaltyController::class, 'history']);
                $account->post('/wallet/topups', [LoyaltyController::class, 'startTopup']);
                $account->post('/wallet/topups/verify', [LoyaltyController::class, 'verifyTopup']);
                $account->post('/rewards/{slug:[a-z0-9-]+}/redeem', [LoyaltyController::class, 'redeem']);
                $account->get('/notifications', [LoyaltyController::class, 'notifications']);
                $account->post('/notifications/read', [LoyaltyController::class, 'markRead']);
                $account->post('/2fa/setup', [AccountController::class, 'twoFactorSetup'])->add(RequireRole::staff());
                $account->post('/2fa/confirm', [AccountController::class, 'twoFactorConfirm'])->add(RequireRole::staff());
                $account->post('/2fa/disable', [AccountController::class, 'twoFactorDisable'])->add(RequireRole::staff());
            })->add(RequireRole::signedIn());
        });
    }
}
