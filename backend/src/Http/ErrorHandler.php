<?php

declare(strict_types=1);

namespace App\Http;

use App\Support\Logger;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Exception\HttpException as SlimHttpException;

/**
 * Converts exceptions to JSON. Users see a friendly message; unexpected errors are logged
 * with an ID they can quote to support. Stack traces never leave the server.
 */
final class ErrorHandler
{
    public function __construct(private ResponseFactoryInterface $responses, private Logger $logger, private bool $debug)
    {
    }

    public function __invoke(Request $request, \Throwable $e, bool $displayErrorDetails, bool $logErrors, bool $logErrorDetails): Response
    {
        $response = $this->responses->createResponse();

        if ($e instanceof HttpError) {
            $payload = ['error' => ['code' => $e->errorCode, 'message' => $e->getMessage()] + $e->extra];
            $response = Json::send($response, $payload, $e->status);
            if (isset($e->extra['retryAfter'])) {
                $response = $response->withHeader('Retry-After', (string) $e->extra['retryAfter']);
            }
            return $response;
        }

        if ($e instanceof SlimHttpException) {
            $status = $e->getCode();
            $messages = [404 => 'We couldn’t find that.', 405 => 'That action isn’t allowed here.'];
            return Json::send($response, ['error' => [
                'code' => $status === 404 ? 'not_found' : 'http_error',
                'message' => $messages[$status] ?? 'The request could not be completed.',
            ]], $status);
        }

        $errorId = bin2hex(random_bytes(6));
        $this->logger->error($e->getMessage(), [
            'error_id' => $errorId,
            'type' => $e::class,
            'file' => $e->getFile() . ':' . $e->getLine(),
            'method' => $request->getMethod(),
            'path' => $request->getUri()->getPath(),
            'trace' => $e->getTraceAsString(),
        ]);
        $payload = ['error' => [
            'code' => 'server_error',
            'message' => 'Something went wrong on our side. Please try again, or contact us quoting reference ' . $errorId . '.',
            'errorId' => $errorId,
        ]];
        if ($this->debug) {
            $payload['error']['debug'] = $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine();
        }
        return Json::send($response, $payload, 500);
    }
}
