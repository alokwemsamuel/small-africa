<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\HttpError;
use App\Media\ImageUploads;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Psr7\Stream;

/** Serves re-encoded uploads. File names are random and never reused, so they cache forever. */
final class MediaController
{
    public function __construct(private ImageUploads $uploads)
    {
    }

    /** @param array{file: string} $args */
    public function dish(Request $request, Response $response, array $args): Response
    {
        $path = $this->uploads->resolve('dishes/' . $args['file']) ?? throw HttpError::notFound();
        $handle = fopen($path, 'rb') ?: throw HttpError::notFound();
        return $response
            ->withHeader('Content-Type', 'image/webp')
            ->withHeader('Content-Length', (string) filesize($path))
            ->withHeader('Cache-Control', 'public, max-age=31536000, immutable')
            ->withHeader('Content-Security-Policy', "default-src 'none'")
            ->withBody(new Stream($handle));
    }
}
