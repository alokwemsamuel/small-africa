<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Social\Identity;
use App\Social\Provider;
use App\Social\SocialError;

/** A provider that answers as told: no network. Remembers what it was asked. */
final class FakeProvider implements Provider
{
    public ?string $lastState = null;
    public ?string $lastNonce = null;
    public ?string $lastRedirectUri = null;
    public ?string $lastVerifier = null;
    /** @var array<string, mixed> */
    public array $lastPosted = [];
    public int $finished = 0;

    public function __construct(private string $name, public ?Identity $identity = null, public ?SocialError $error = null)
    {
    }

    public function name(): string
    {
        return $this->name;
    }

    public function start(string $redirectUri, string $state, string $nonce): array
    {
        $this->lastState = $state;
        $this->lastNonce = $nonce;
        $this->lastRedirectUri = $redirectUri;
        return ['url' => "https://{$this->name}.example/authorize?state={$state}", 'pkceVerifier' => 'verifier-' . $state];
    }

    public function finish(string $redirectUri, string $code, ?string $pkceVerifier, string $nonce, array $posted): Identity
    {
        $this->finished++;
        $this->lastVerifier = $pkceVerifier;
        $this->lastPosted = $posted;
        if ($this->error !== null) {
            throw $this->error;
        }
        return $this->identity ?? throw new SocialError(SocialError::FAILED);
    }
}
