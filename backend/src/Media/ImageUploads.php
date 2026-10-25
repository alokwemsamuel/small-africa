<?php

declare(strict_types=1);

namespace App\Media;

use App\Http\ValidationError;
use Psr\Http\Message\UploadedFileInterface;

/**
 * Secure image uploads for the menu manager. Uploads are never stored as received:
 *  - size limit, real content-type check (finfo, not the browser's claim), pixel limits;
 *  - decoded and re-encoded to WebP with GD, which drops EXIF/GPS data and any payload
 *    hidden in the file;
 *  - saved outside the web root under a random-suffixed name and served only through the
 *    media route, which accepts nothing but "<slug>-<hex>.webp".
 */
final class ImageUploads
{
    public const MAX_BYTES = 5 * 1024 * 1024;
    private const MAX_WIDTH = 1600;
    private const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

    public function __construct(private string $dir)
    {
    }

    /** @return string stored path relative to the uploads dir, e.g. "dishes/jollof-1a2b3c4d5e.webp" */
    public function storeDishImage(UploadedFileInterface $file, string $slug): string
    {
        if ($file->getError() !== UPLOAD_ERR_OK) {
            throw ValidationError::field('image', $file->getError() === UPLOAD_ERR_INI_SIZE || $file->getError() === UPLOAD_ERR_FORM_SIZE
                ? 'That image is too large (5 MB maximum).'
                : 'The upload didn’t complete. Please try again.');
        }
        if (($file->getSize() ?? 0) > self::MAX_BYTES) {
            throw ValidationError::field('image', 'That image is too large (5 MB maximum).');
        }
        $bytes = (string) $file->getStream();
        if (strlen($bytes) === 0 || strlen($bytes) > self::MAX_BYTES) {
            throw ValidationError::field('image', 'That image is too large (5 MB maximum).');
        }
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        if (!in_array($mime, self::ALLOWED, true)) {
            throw ValidationError::field('image', 'Please upload a JPEG, PNG or WebP photo.');
        }
        $info = @getimagesizefromstring($bytes);
        if (!$info || $info[0] < 400 || $info[1] < 300 || $info[0] > 8000 || $info[1] > 8000) {
            throw ValidationError::field('image', 'Photos must be between 400×300 and 8000×8000 pixels.');
        }
        $src = @imagecreatefromstring($bytes);
        if (!$src) {
            throw ValidationError::field('image', 'That file isn’t a readable image.');
        }
        [$w, $h] = [imagesx($src), imagesy($src)];
        $tw = min(self::MAX_WIDTH, $w);
        $th = (int) round($h * $tw / $w);
        $out = imagecreatetruecolor($tw, $th);
        imagealphablending($out, false);
        imagesavealpha($out, true);
        imagecopyresampled($out, $src, 0, 0, 0, 0, $tw, $th, $w, $h);
        imagedestroy($src);

        $safeSlug = preg_replace('/[^a-z0-9-]/', '', strtolower($slug)) ?: 'dish';
        $name = 'dishes/' . substr($safeSlug, 0, 60) . '-' . bin2hex(random_bytes(5)) . '.webp';
        $path = $this->path($name);
        if (!is_dir(dirname($path)) && !mkdir(dirname($path), 0775, true) && !is_dir(dirname($path))) {
            throw new \RuntimeException('Could not create the uploads directory.');
        }
        if (!imagewebp($out, $path, 82)) {
            imagedestroy($out);
            throw new \RuntimeException('Could not save the image.');
        }
        imagedestroy($out);
        return $name;
    }

    public function delete(?string $name): void
    {
        if ($name !== null && self::isSafeName($name) && is_file($this->path($name))) {
            @unlink($this->path($name));
        }
    }

    /** Absolute path of a stored file, or null when the name isn't one we could have made. */
    public function resolve(string $name): ?string
    {
        return self::isSafeName($name) && is_file($this->path($name)) ? $this->path($name) : null;
    }

    public static function isSafeName(string $name): bool
    {
        return (bool) preg_match('#^dishes/[a-z0-9-]{1,60}-[a-f0-9]{10}\.webp$#', $name);
    }

    private function path(string $name): string
    {
        return rtrim($this->dir, '/\\') . '/' . $name;
    }
}
