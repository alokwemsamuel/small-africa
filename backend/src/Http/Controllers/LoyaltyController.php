<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Json;
use App\Loyalty\LoyaltyService;
use App\Loyalty\WalletService;
use App\Support\Database;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** The signed-in member's Interest Account. */
final class LoyaltyController
{
    public function __construct(private LoyaltyService $loyalty, private WalletService $wallet, private Database $db)
    {
    }

    public function summary(Request $request, Response $response): Response
    {
        return Json::send($response, $this->loyalty->summary((int) Json::user($request)['id']));
    }

    public function history(Request $request, Response $response): Response
    {
        $q = Validator::validate($request->getQueryParams(), [
            'kind' => 'required|string|in:wallet,points',
            'before' => 'nullable|int|min:1',
        ]);
        return Json::send($response, $this->loyalty->history((int) Json::user($request)['id'], $q['kind'], $q['before'] ?? null));
    }

    public function startTopup(Request $request, Response $response): Response
    {
        $data = Validator::validate(Json::body($request), ['amount_naira' => 'required|int|min:1|max:10000000'], ['amount_naira' => 'Amount']);
        $result = $this->wallet->startTopup(Json::user($request), (int) $data['amount_naira'] * 100, $request->getHeaderLine('Idempotency-Key') ?: null);
        return Json::send($response, $result, 201);
    }

    public function verifyTopup(Request $request, Response $response): Response
    {
        $data = Validator::validate(Json::body($request), ['reference' => 'required|string|max:20|regex:/^TU-[A-Z0-9]{6}$/']);
        return Json::send($response, ['topup' => $this->wallet->verify($data['reference'], (int) Json::user($request)['id'])]);
    }

    /** @param array{slug: string} $args */
    public function redeem(Request $request, Response $response, array $args): Response
    {
        $userId = (int) Json::user($request)['id'];
        $result = $this->loyalty->redeem($userId, $args['slug'], $request->getHeaderLine('Idempotency-Key') ?: null);
        return Json::send($response, ['result' => $result, 'account' => $this->loyalty->summary($userId)]);
    }

    public function notifications(Request $request, Response $response): Response
    {
        return Json::send($response, $this->loyalty->notifications((int) Json::user($request)['id']));
    }

    public function markRead(Request $request, Response $response): Response
    {
        $body = Json::body($request);
        $ids = isset($body['ids']) && is_array($body['ids']) ? array_values(array_filter($body['ids'], 'is_int')) : null;
        $userId = (int) Json::user($request)['id'];
        $this->loyalty->markRead($userId, $ids);
        return Json::send($response, $this->loyalty->notifications($userId));
    }

    /** Public: the rewards menu for the Interest Account page. */
    public function catalog(Request $request, Response $response): Response
    {
        $rows = $this->db->all('SELECT slug, name, description, points_cost, reward_type, dine_in_only FROM rewards_catalog WHERE is_active = 1 ORDER BY points_cost, sort_order');
        return Json::send($response->withHeader('Cache-Control', 'public, max-age=300'), ['rewards' => array_map(static fn ($r) => [
            'slug' => $r['slug'],
            'name' => $r['name'],
            'description' => $r['description'],
            'pointsCost' => (int) $r['points_cost'],
            'type' => $r['reward_type'],
            'dineInOnly' => (bool) $r['dine_in_only'],
        ], $rows)]);
    }
}
