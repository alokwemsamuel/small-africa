<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\HttpError;
use App\Http\Json;
use App\Services\ReservationService;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class ReservationController
{
    public function __construct(private ReservationService $reservations)
    {
    }

    public function availability(Request $request, Response $response): Response
    {
        $q = Validator::validate($request->getQueryParams(), [
            'date' => 'required|date',
            'party' => 'required|int|min:1|max:50',
        ], ['party' => 'Party size']);
        return Json::send($response, $this->reservations->availability($q['date'], $q['party']));
    }

    public function create(Request $request, Response $response): Response
    {
        $data = Validator::validate(Json::body($request), [
            'date' => 'required|date',
            'time' => 'required|time',
            'party_size' => 'required|int|min:1|max:50',
            'area' => 'required|string|max:40',
            'occasion' => 'nullable|string|in:none,birthday,anniversary,business,date_night,celebration,other',
            'notes' => 'nullable|string|max:500',
            'name' => 'required|string|max:160',
            'email' => 'required|email',
            'phone' => 'required|phone',
        ], ['party_size' => 'Party size', 'area' => 'Seating area']);
        $user = $request->getAttribute('user');
        return Json::send($response, $this->reservations->create($data, is_array($user) ? $user : null, Json::ip($request)), 201);
    }

    /** @param array{code: string} $args */
    public function show(Request $request, Response $response, array $args): Response
    {
        $this->assertCode($args['code']);
        $user = $request->getAttribute('user');
        $token = $request->getQueryParams()['t'] ?? null;
        return Json::send($response, ['reservation' => $this->reservations->find($args['code'], is_array($user) ? $user : null, is_string($token) ? $token : null)]);
    }

    /** @param array{code: string} $args */
    public function cancel(Request $request, Response $response, array $args): Response
    {
        $this->assertCode($args['code']);
        $user = $request->getAttribute('user');
        $token = Json::body($request)['t'] ?? null;
        return Json::send($response, ['reservation' => $this->reservations->cancel($args['code'], is_array($user) ? $user : null, is_string($token) ? $token : null)]);
    }

    public function mine(Request $request, Response $response): Response
    {
        $user = Json::user($request);
        return Json::send($response, ['reservations' => $this->reservations->listForUser((int) $user['id'], $user['email'])]);
    }

    private function assertCode(string $code): void
    {
        if (!preg_match('/^R-[A-Z0-9]{6}$/i', $code)) {
            throw HttpError::notFound('We couldn’t find that reservation.');
        }
    }
}
