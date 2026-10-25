<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Json;
use App\Support\Clock;
use App\Support\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class HealthController
{
    public function __construct(private Database $db, private Clock $clock)
    {
    }

    public function __invoke(Request $request, Response $response): Response
    {
        try {
            $dbOk = (int) $this->db->scalar('SELECT 1') === 1;
        } catch (\Throwable) {
            $dbOk = false;
        }
        return Json::send($response, [
            'status' => $dbOk ? 'ok' : 'degraded',
            'database' => $dbOk,
            'time' => $this->clock->now()->format(DATE_ATOM),
        ], $dbOk ? 200 : 503);
    }
}
