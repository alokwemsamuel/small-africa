import { env } from './env';

/**
 * Error thrown for any non-2xx API response. `fields` carries per-field validation messages
 * (keys match the API's snake_case field names).
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string> = {},
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: Method;
  body?: unknown;
  /** Multipart upload (e.g. an image); sent instead of a JSON body. */
  formData?: FormData;
  signal?: AbortSignal;
  idempotencyKey?: string;
}

/** Transport used by api(): the real fetch client, or the demo-mode mock (Phase 7). */
export type Transport = <T>(path: string, options: RequestOptions) => Promise<T>;

// The CSRF token lives only in memory: never localStorage. Auth itself is an httpOnly cookie.
let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(`${env.apiBase}/auth/csrf`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok)
    throw new ApiError(res.status, 'csrf_unavailable', 'We couldn’t reach the server. Please try again.');
  const data = (await res.json()) as { csrfToken: string };
  csrfToken = data.csrfToken;
  return csrfToken;
}

async function request<T>(path: string, options: RequestOptions, retried: boolean): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') {
    headers['X-CSRF-Token'] = csrfToken ?? (await fetchCsrfToken());
    // The browser sets the multipart boundary itself for FormData.
    if (!options.formData) headers['Content-Type'] = 'application/json';
  }
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${env.apiBase}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: method === 'GET' ? undefined : (options.formData ?? JSON.stringify(options.body ?? {})),
      signal: options.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network_error', 'You appear to be offline. Check your connection and try again.');
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof data.csrfToken === 'string') csrfToken = data.csrfToken;

  if (!res.ok) {
    const err = (data.error ?? {}) as {
      code?: string;
      message?: string;
      fields?: Record<string, string>;
      retryAfter?: number;
    };
    // A stale token (e.g. session expired in another tab): refresh it once and replay.
    if (res.status === 403 && err.code === 'csrf_mismatch' && !retried) {
      await fetchCsrfToken();
      return request<T>(path, options, true);
    }
    throw new ApiError(
      res.status,
      err.code ?? 'error',
      err.message ?? 'Something went wrong. Please try again.',
      err.fields,
      err.retryAfter,
    );
  }
  return data as T;
}

const httpTransport: Transport = (path, options) => request(path, options, false);
let transport: Transport = httpTransport;

/** Swap the transport (demo mode installs the mock API here at startup). */
export function setTransport(t: Transport): void {
  transport = t;
}

export function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return transport<T>(path, options);
}
